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

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY in Secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Generate a JSON book structure for "${title}" about "${topic}". Use this structure: {"preface": "string", "chapters": [{"title": "string", "description": "string"}]}`,
                },
              ],
            },
          ],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    );

    const data = await response.json();

    // EXTREME PROTECTION: This check prevents the "reading '0'" error
    if (data && data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      const content = JSON.parse(data.candidates[0].content.parts[0].text);
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // If Gemini fails, we report the actual error instead of crashing
      const errorMessage =
        data.error?.message || "Gemini returned an empty response. Check your API key or Safety Settings.";
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
