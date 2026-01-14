import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { chapterNumber, chapterTitle, topic, tableOfContents, language = 'en' } = await req.json();

    console.log(`Generating Chapter ${chapterNumber}: "${chapterTitle}" for "${topic}"`);

    // Generate Content with Gemini
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const prompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for the book "${topic}".
    Context: ${tableOfContents?.map((c: any) => c.title).join(', ') || ''}
    Language: ${language}.
    Format: Markdown. 1000 words. Professional tone. Include a > **Pro-Tip**.`;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      }),
    });

    const geminiData = await geminiRes.json();
    let content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Clean markdown
    content = content.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

    if (!content) throw new Error('Gemini returned empty content');

    console.log(`Successfully generated Chapter ${chapterNumber}, length: ${content.length}`);

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
