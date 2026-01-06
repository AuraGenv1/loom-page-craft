import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { topic } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-1.5-flash which is faster and supports JSON better
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Create a comprehensive artisan how-to guide about: ${topic}.
      Return the response as a valid JSON object with the following structure:
      {
        "title": "A professional title for the guide",
        "preface": "A brief introduction (2-3 sentences)",
        "chapters": [
          {
            "title": "Chapter Title",
            "description": "Full detailed content for this chapter (at least 3 paragraphs)"
          }
        ]
      }
      Provide at least 3 chapters.
    `;

    // We remove response_mime_type and instead instruct the model via prompt
    // to ensure compatibility with all API versions.
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean the response text in case Gemini adds markdown backticks
    const cleanText = text.replace(/```json|```/g, "").trim();
    const jsonResponse = JSON.parse(cleanText);

    return new Response(JSON.stringify({ content: jsonResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
