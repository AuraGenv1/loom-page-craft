import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { topic, sessionId, language = 'en' } = await req.json();
    if (!topic) return new Response(JSON.stringify({ error: 'Missing topic' }), { status: 400, headers: corsHeaders });

    const cleanTopic = topic.replace(/\b(travel )?guide\b/gi, '').trim(); 
    const subtitle = `A comprehensive guide to ${cleanTopic}`;

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const prompt = `You are an expert book author. Write a book outline and Chapter 1 for: "${cleanTopic}".
    Return ONLY JSON: { "title": "Unique Title", "chapters": [{"chapter_number":1, "title":"Title"}], "chapter_1_content": "Markdown" }
    Requirements: 1,500 words. Include exactly: > **Pro-Tip:** [Tip]`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, response_mime_type: "application/json" },
      }),
    });

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    const aiData = JSON.parse(rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1));

    return new Response(JSON.stringify({
      title: aiData.title,
      tableOfContents: aiData.chapters.map((ch: any) => ({ chapter: ch.chapter_number, title: ch.title })),
      chapter1Content: aiData.chapter_1_content,
      displayTitle: aiData.title,
      subtitle: subtitle,
      localResources: [],
      hasDisclaimer: false
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
