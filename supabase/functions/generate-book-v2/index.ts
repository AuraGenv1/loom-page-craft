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
    const { topic, sessionId, language = 'en' } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'Missing topic' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`V2 GENERATOR (HIGH QUALITY): Generating book for: "${topic}"`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

    const languageNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    // Updated Prompt: Forces Pro-Tip format and Length
    const prompt = `You are an expert book author. Create a comprehensive book outline and write the first chapter for the topic: "${topic}".
IMPORTANT: Write all content in ${targetLanguage}.

Return ONLY raw JSON. The JSON structure must be exactly:
{
  "title": "A Catchy Title for the Book",
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
  ],
  "chapter_1_content": "MARKDOWN CONTENT HERE"
}

**Requirements for Chapter 1 Content:**
1. **Length:** Minimum 1,500 words. Detailed and deep.
2. **Pro-Tip:** You MUST include a Pro-Tip block using exactly this syntax:
   > **Pro-Tip:** [Your tip here]
3. **Formatting:** Use nice headers (##), lists, and bold text.
`;

    // Using gemini-2.0-flash
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          response_mime_type: "application/json"
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

    // Clean Markdown
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let aiData;
    try {
      aiData = JSON.parse(rawText);
    } catch (parseError) {
      console.error("JSON Parse Error:", rawText);
      throw new Error('AI returned invalid JSON');
    }

    // Fallbacks
    const safeTitle = aiData.title || topic;
    const safeChapters = Array.isArray(aiData.chapters) ? aiData.chapters : [];
    const safeCh1 = aiData.chapter_1_content || "Chapter 1 generation failed. Please refresh.";

    // FORMAT DATA EXACTLY FOR FRONTEND
    const frontendPayload = {
      title: safeTitle,
      tableOfContents: safeChapters.map((ch: any) => ({
        chapter: ch.chapter_number,
        title: ch.title || `Chapter ${ch.chapter_number}`
      })),
      chapter1Content: safeCh1,
      localResources: [],
      hasDisclaimer: false,
      displayTitle: safeTitle,
      subtitle: `A comprehensive guide to ${topic}`
    };

    // Return JSON only
    return new Response(
      JSON.stringify(frontendPayload),
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
