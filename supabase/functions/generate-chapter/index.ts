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
    const { bookId, chapterNumber, chapterTitle, topic, language = 'en' } = await req.json();

    if (!topic || !chapterTitle) {
      throw new Error('Missing required fields');
    }

    console.log(`GENERATING CHAPTER ${chapterNumber}: "${chapterTitle}" for topic "${topic}"`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

    const languageNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    // Prompt engineered for MAXIMUM LENGTH (Aiming for substantial content like before)
    const prompt = `You are an expert author writing a comprehensive, deep-dive textbook on "${topic}".
Write the full content for **Chapter ${chapterNumber}: ${chapterTitle}**.

**Requirements:**
1. **Language:** Write in ${targetLanguage}.
2. **Length:** Write as much as possible. Aim for 2,000+ words. Do not summarize; expand on every point.
3. **Structure:**
   - **Introduction:** Detailed history and context.
   - **The Science/Theory:** Explain the underlying principles deeply.
   - **Step-by-Step Guide:** Detailed instructions with potential variations.
   - **Case Studies:** Real-world examples or scenarios.
   - **Common Pitfalls:** Deep analysis of mistakes and how to fix them.
   - **Pro-Tip:** Include a distinct blockquote starting with "> **Pro-Tip:**".
4. **Tone:** Professional, authoritative, and educational.

Write ONLY the markdown content for the chapter. Do not wrap it in JSON.`;

    // UPDATE: Swapped broken 'gemini-pro' for working 'gemini-2.0-flash'
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192, // Max allowed for single request
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI service error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('No content returned from Gemini');

    // Clean up any potential markdown code blocks if the AI added them
    const cleanedText = rawText.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

    return new Response(
      JSON.stringify({ content: cleanedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating chapter:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
