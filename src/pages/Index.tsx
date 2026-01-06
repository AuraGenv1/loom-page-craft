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

    const systemPrompt = `You are the Lead Architect at Loom & Page. 
    Topic: ${topic}.
    
    INSTRUCTIONAL GUIDELINES:
    1. Provide a detailed, cinematic narrative (min 800 words).
    2. DIAGRAM RULES: When describing technical components, you MUST provide explicit text labels. 
    3. Image Descriptions: Descriptions for AI generation must include "Labeled technical diagram with clear text callouts pointing to specific parts".
    
    Return JSON: 
    {
      "title": "Full Book Title",
      "displayTitle": "Short Cover Title",
      "subtitle": "Luxury subtitle",
      "tableOfContents": [{"chapter": 1, "title": "Chapter Title", "imageDescription": "8k technical diagram of [part] with labeled text callouts, studio lighting"}],
      "chapter1Content": "Markdown content here..."
    }`;

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
    const jsonStr = rawContent.match(/```json\s+([\s\S]*?)\s+```/)?.[1] || rawContent;
    const bookData = JSON.parse(jsonStr);

    if (FAL_KEY && bookData.tableOfContents?.[0]?.imageDescription) {
      const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${bookData.tableOfContents[0].imageDescription}. High-resolution photography, technical labels visible.`,
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
