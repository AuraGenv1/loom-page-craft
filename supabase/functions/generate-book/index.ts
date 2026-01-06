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
      throw new Error("GEMINI_API_KEY is missing from Secrets");
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
                  text: `Generate a JSON book structure for "${title}" about "${topic}". Must include "preface" and 5 "chapters".`,
                },
              ],
            },
          ],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    );

    const data = await response.json();

    // STOPS THE '0' ERROR: Check every level of the object before accessing it
    if (
      data &&
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
    ) {
      const content = JSON.parse(data.candidates[0].content.parts[0].text);
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // If we get here, Gemini failed. We return the raw error so you can see it.
      const errorDetail = data.error?.message || "Gemini returned an empty result (Check Safety Settings or API Key).";
      throw new Error(errorDetail);
    }
  } catch (error: any) {
    console.error("Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
