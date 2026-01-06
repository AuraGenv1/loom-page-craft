import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, sessionId } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    // 1. GENERATE THE TEXT CONTENT
    const systemPrompt = `You are the Lead Architect at Loom & Page. Create a luxury instructional guide for: ${topic}. 
    Return JSON format: {
      "title": "Full Book Title",
      "displayTitle": "Short Title",
      "subtitle": "Artisan Subtitle",
      "tableOfContents": [{"chapter": 1, "title": "Introduction"}],
      "chapter1Content": "Detailed markdown content...",
      "imagePrompt": "A high-end, cinematic studio photograph of [specific subject related to ${topic}] with luxury lighting and labeled technical parts."
    }`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }),
      },
    );

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates[0].content.parts[0].text;
    const bookData = JSON.parse(rawText.match(/\{[\s\S]*\}/)[0]);

    // 2. GENERATE THE FAL.AI IMAGE (INTEGRATION)
    let falImageUrl = null;
    if (FAL_KEY) {
      const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `${bookData.imagePrompt}, professional photography, 8k resolution, elegant, minimalist background`,
          image_size: "square_hd",
        }),
      });

      if (falRes.ok) {
        const falData = await falRes.json();
        falImageUrl = falData.images[0].url;
      }
    }

    // Combine data
    const finalBook = { ...bookData, coverImageUrl: falImageUrl };

    return new Response(JSON.stringify(finalBook), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
