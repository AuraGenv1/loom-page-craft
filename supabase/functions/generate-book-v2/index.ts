import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    console.log(`V2 GENERATOR (10 CHAPTERS): Generating book for topic: "${topic}"`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

    const languageNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    const prompt = `You are a book outline generator. Create a book outline for the topic: "${topic}".
IMPORTANT: Write all content in ${targetLanguage}.
Return ONLY raw JSON. The JSON structure must be exactly:
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
Generate exactly 10 chapters.`;

    // Using gemini-2.0-flash (Confirmed Available)
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          response_mime_type: "application/json"
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI service error (gemini-2.0-flash): ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('No content returned from Gemini');

    // Clean Markdown (Just in case)
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let bookData;
    try {
      bookData = JSON.parse(rawText);
    } catch (parseError) {
      console.error("JSON PARSE ERROR:", parseError);
      console.error("RAW TEXT:", rawText);
      throw new Error('AI returned invalid JSON');
    }

    // --- SAFETY CHECKS ---
    
    // 1. Fallback for Title
    if (!bookData.title) {
      console.warn("AI did not return a title. Using topic as fallback.");
      bookData.title = topic;
    }

    // 2. Fallback for Chapters
    if (!bookData.chapters || !Array.isArray(bookData.chapters)) {
      bookData.chapters = [];
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const tableOfContents = bookData.chapters.map((ch: any) => ({
      number: ch.chapter_number,
      title: ch.title || `Chapter ${ch.chapter_number}`,
    }));

    // Insert Book
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
      console.error("DB Insert Error:", bookError);
      throw new Error(`Database rejected book creation: ${bookError.message}`);
    }

    // Insert Chapters
    const chapterInserts = bookData.chapters.map((ch: any) => ({
      book_id: bookRow.id,
      chapter_number: ch.chapter_number,
      title: ch.title || `Chapter ${ch.chapter_number}`,
      status: 'pending',
    }));

    if (chapterInserts.length > 0) {
      const { error: chaptersError } = await supabase.from('chapters').insert(chapterInserts);
      if (chaptersError) console.error("Chapter Insert Error:", chaptersError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        bookId: bookRow.id,
        title: bookData.title,
        chapters: bookData.chapters,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Generation Failed:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
