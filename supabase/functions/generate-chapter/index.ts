import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, chapterNumber, chapterTitle, topic, tableOfContents, language = 'en' } = await req.json();

    // Validate required fields
    if (!topic || !chapterTitle) {
      throw new Error('Missing required fields: topic and chapterTitle are required');
    }

    if (!chapterNumber || typeof chapterNumber !== 'number') {
      throw new Error('Missing or invalid chapterNumber');
    }

    if (!bookId) {
      throw new Error('Missing required field: bookId is required');
    }

    console.log(`Generating Chapter ${chapterNumber} for Book ${bookId}`);
    console.log(`Chapter title: "${chapterTitle}"`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Mark chapter as generating (upsert to handle race conditions)
    const { error: upsertError } = await supabase
      .from('chapters')
      .upsert({
        book_id: bookId,
        chapter_number: chapterNumber,
        title: chapterTitle,
        status: 'generating',
      }, {
        onConflict: 'book_id,chapter_number',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.log(`Note: Could not upsert generating status: ${upsertError.message}`);
      // Continue anyway - the chapter might already exist
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

    const languageNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    // Create a string of the full outline so the AI sees the big picture
    let outlineContext = "";
    if (tableOfContents && Array.isArray(tableOfContents)) {
      outlineContext = tableOfContents
        .map((ch: any) => `Ch ${ch.chapter}: ${ch.title}`)
        .join("\n");
    }

    const prompt = `You are an expert author writing a comprehensive textbook on "${topic}".

**CONTEXT - THE BOOK OUTLINE:**
${outlineContext}

**CURRENT TASK:**
Write the full content for **Chapter ${chapterNumber}: ${chapterTitle}**.

**CRITICAL INSTRUCTIONS TO AVOID REPETITION:**
1. You are writing ONLY Chapter ${chapterNumber}.
2. Do NOT write a general introduction to "${topic}" (that was covered in Chapter 1).
3. Do NOT cover topics from other chapters in the outline above.
4. Jump straight into the specific subject matter of "${chapterTitle}".

**Content Requirements:**
1. **Language:** Write in ${targetLanguage}.
2. **Length:** Detailed and deep (Aim for 1,500+ words).
3. **Pro-Tip:** Include a Pro-Tip block: > **Pro-Tip:** [Tip]
4. **Tone:** Professional, authoritative, and educational.

Write ONLY the markdown content.`;

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;

    // Create an AbortController with 60 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI service error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      // Explicit check for empty or missing content
      if (!rawText || rawText.trim().length === 0) {
        throw new Error(`AI returned empty content for Chapter ${chapterNumber}`);
      }

      console.log(`Successfully generated Chapter ${chapterNumber}, length: ${rawText.length} chars`);

      const cleanedText = rawText
        .replace(/^```markdown\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '');

      // Save the chapter to the chapters table with status 'completed'
      const { error: saveError } = await supabase
        .from('chapters')
        .upsert({
          book_id: bookId,
          chapter_number: chapterNumber,
          title: chapterTitle,
          content: cleanedText,
          status: 'completed',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'book_id,chapter_number',
          ignoreDuplicates: false,
        });

      if (saveError) {
        console.error(`Failed to save chapter to database: ${saveError.message}`);
        // Still return the content even if save fails - frontend can handle it
      } else {
        console.log(`Chapter ${chapterNumber} saved to chapters table for book ${bookId}`);
      }

      return new Response(
        JSON.stringify({ content: cleanedText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      
      // Update chapter status to 'failed' on error
      await supabase
        .from('chapters')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('book_id', bookId)
        .eq('chapter_number', chapterNumber);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`AI request timed out after 60 seconds for Chapter ${chapterNumber}`);
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error generating chapter:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
