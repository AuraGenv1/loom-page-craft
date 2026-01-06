import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, topic } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY in Secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating book for title: "${title}", topic: "${topic}"`);

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
          generationConfig: { 
            response_mime_type: "application/json" 
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      },
    );

    const data = await response.json();
    console.log("Gemini response status:", response.status);
    console.log("Gemini response data:", JSON.stringify(data, null, 2));

    // Check for candidates array existence and length before accessing
    if (!data.candidates || data.candidates.length === 0) {
      const errorMessage = data.error?.message || 
        data.promptFeedback?.blockReason ||
        "Gemini returned no candidates. The request may have been blocked or the API key may be invalid.";
      console.error("No candidates returned:", errorMessage);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for content in the first candidate
    if (!data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      const finishReason = data.candidates[0].finishReason || "Unknown";
      console.error("No content in candidate, finishReason:", finishReason);
      return new Response(JSON.stringify({ error: `Gemini returned empty content. Finish reason: ${finishReason}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = JSON.parse(data.candidates[0].content.parts[0].text);
    console.log("Successfully parsed book content");
    
    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Generate book error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
