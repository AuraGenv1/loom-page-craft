import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title, topic } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in secrets.");
    }

    const prompt = `You are a master technical writer. Generate a high-end instructional book structure for: "${title}". 
    Topic: ${topic}.
    Return ONLY a JSON object with this exact structure:
    {
      "preface": "A short elegant introduction",
      "chapters": [
        {"title": "Chapter 1 Name", "description": "Detail for image generation"},
        {"title": "Chapter 2 Name", "description": "Detail for image generation"},
        {"title": "Chapter 3 Name", "description": "Detail for image generation"},
        {"title": "Chapter 4 Name", "description": "Detail for image generation"},
        {"title": "Chapter 5 Name", "description": "Detail for image generation"}
      ]
    }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    );

    const data = await response.json();

    // --- ROBUST ERROR CHECKING ---
    if (!data.candidates || data.candidates.length === 0) {
      console.error("Gemini API Error Response:", JSON.stringify(data));
      throw new Error(data.error?.message || "Gemini returned no results. Check your API key or topic.");
    }

    const contentString = data.candidates[0].content.parts[0].text;
    const content = JSON.parse(contentString);

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Critical Error in generate-book:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
