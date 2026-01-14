import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    console.log(`GENERATING CHAPTER ${chapterNumber}: "${chapterTitle}" for book ${bookId || 'unknown'}`);

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

      return new Response(
        JSON.stringify({ content: cleanedText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      
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
