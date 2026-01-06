import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title, topic } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) throw new Error("API Key Missing in Secrets");

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Generate a JSON book structure for "${title}" about "${topic}". Use this structure: {"preface": "string", "chapters": [{"title": "string", "description": "string"}]}. Generate 5 chapters.`,
              },
            ],
          },
        ],
        generationConfig: { response_mime_type: "application/json", temperature: 0.7 },
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      let rawText = data.candidates[0].content.parts[0].text;
      // CLEANER: Removes markdown formatting if Gemini adds it
      const cleanJson = rawText.replace(/```json|```/g, "").trim();
      const content = JSON.parse(cleanJson);

      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      throw new Error("Gemini returned an empty response.");
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
