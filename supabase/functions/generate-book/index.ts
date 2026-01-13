import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, sessionId, language = 'en' } = await req.json();

    if (!topic || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: topic and sessionId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating book for topic: "${topic}", session: ${sessionId}`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Language mapping
    const languageNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    // Prompt for structured book outline
    const prompt = `You are a book outline generator. Create a book outline for the topic: "${topic}".

IMPORTANT: Write all content in ${targetLanguage}.

Return ONLY raw JSON with no markdown formatting, no code blocks, no backticks. Just pure JSON.

The JSON structure must be exactly:
{
  "title": "The Book Title",
  "chapters": [
    { "chapter_number": 1, "title": "Chapter 1 Title" },
    { "chapter_number": 2, "title": "Chapter 2 Title" },
    { "chapter_number": 3, "title": "Chapter 3 Title" },
    { "chapter_number": 4, "title": "Chapter 4 Title" },
    { "chapter_number": 5, "title": "Chapter 5 Title" },
    { "chapter_number": 6, "title": "Chapter 6 Title" },
    { "chapter_number": 7, "title": "Chapter 7 Title" },
    { "chapter_number": 8, "title": "Chapter 8 Title" },
    { "chapter_number": 9, "title": "Chapter 9 Title" },
    { "chapter_number": 10, "title": "Chapter 10 Title" }
  ]
}

Generate exactly 10 chapters with descriptive, engaging titles relevant to the topic.
Return ONLY the JSON object, nothing else.`;

    // Call Gemini API with gemini-pro model
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + GEMINI_API_KEY;
    
    console.log('Calling Gemini API with gemini-pro model...');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      throw new Error('No content returned from Gemini');
    }

    console.log('Raw Gemini response received, length:', rawText.length);

    // Clean markdown code blocks if present
    rawText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Parse the JSON
    let bookData: { title: string; chapters: Array<{ chapter_number: number; title: string }> };
    try {
      bookData = JSON.parse(rawText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw text was:', rawText.substring(0, 500));
      throw new Error('Failed to parse book outline from AI response');
    }

    if (!bookData.title || !Array.isArray(bookData.chapters)) {
      throw new Error('Invalid book data structure from AI');
    }

    console.log(`Parsed book: "${bookData.title}" with ${bookData.chapters.length} chapters`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Build table_of_contents array for the books table
    const tableOfContents = bookData.chapters.map(ch => ({
      number: ch.chapter_number,
      title: ch.title,
    }));

    // Insert into books table first
    const { data: bookRow, error: bookError } = await supabase
      .from('books')
      .insert({
        session_id: sessionId,
        topic: topic,
        title: bookData.title,
        table_of_contents: tableOfContents,
        chapter1_content: 'Generating...',
        has_disclaimer: false,
        local_resources: [],
      })
      .select('id')
      .single();

    if (bookError) {
      console.error('Book insert error:', bookError);
      throw new Error('Failed to save book to database');
    }

    const bookId = bookRow.id;
    console.log(`Book inserted with ID: ${bookId}`);

    // Insert chapters into chapters table
    const chapterInserts = bookData.chapters.map(ch => ({
      book_id: bookId,
      chapter_number: ch.chapter_number,
      title: ch.title,
      content: null,
      status: 'pending',
    }));

    const { error: chaptersError } = await supabase
      .from('chapters')
      .insert(chapterInserts);

    if (chaptersError) {
      console.error('Chapters insert error:', chaptersError);
      // Don't fail the whole request, chapters can be created later
    } else {
      console.log(`${chapterInserts.length} chapters inserted`);
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        bookId: bookId,
        title: bookData.title,
        chapters: bookData.chapters,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-book:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
