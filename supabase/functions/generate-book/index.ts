import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, fullBook = false } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    const systemPrompt = `You are the Lead Architect at Loom & Page, a luxury publisher. 
    Write a 600-word chapter in a cinematic, authoritative tone. No filler.
    Provide an imageDescription for a high-end 8k professional studio photograph.
    
    JSON STRUCTURE:
    {
      "title": "Title",
      "displayTitle": "Short Title",
      "subtitle": "Subtitle",
      "tableOfContents": [{ "chapter": 1, "title": "...", "imageDescription": "..." }],
      "chapter1Content": "Markdown..."
    }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nTopic: ${topic}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 15000 },
        }),
      },
    );

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = rawContent.match(/```json\s+([\s\S]*?)\s+```/);
    const bookData = JSON.parse(jsonMatch ? jsonMatch[1] : rawContent);

    // Cover Image Generation
    if (FAL_KEY && bookData.tableOfContents?.[0]?.imageDescription) {
      const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${bookData.tableOfContents[0].imageDescription}. Professional studio lighting, 8k.`,
          image_size: "square_hd",
        }),
      });
      if (falRes.ok) {
        const falData = await falRes.json();
        bookData.coverImageUrl = falData.images[0].url;
      }
    }

    return new Response(JSON.stringify(bookData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
