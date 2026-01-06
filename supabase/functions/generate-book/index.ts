import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    const systemPrompt = `You are the Lead Architect at Loom & Page. Create a luxury instructional volume about ${topic}. Tone: Cinematic and sophisticated. 
    Return JSON: { "title": string, "displayTitle": string, "subtitle": string, "tableOfContents": [{ "chapter": number, "title": string, "imageDescription": string }], "chapter1Content": "markdown" }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 15000 },
        }),
      },
    );

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = rawContent.match(/```json\s+([\s\S]*?)\s+```/);
    const bookData = JSON.parse(jsonMatch ? jsonMatch[1] : rawContent);

    if (FAL_KEY && bookData.tableOfContents?.[0]?.imageDescription) {
      const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${bookData.tableOfContents[0].imageDescription}. Professional studio photography, 8k resolution.`,
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
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message || "An unexpected error occurred" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
