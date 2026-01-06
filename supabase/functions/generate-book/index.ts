import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // 1. Handle CORS for the browser
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { topic } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) throw new Error("Missing GEMINI_API_KEY environment variable");

    const genAI = new GoogleGenerativeAI(apiKey);
    // We use gemini-1.5-flash for speed and reliability
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Create a comprehensive artisan how-to guide about: ${topic}.
      
      IMPORTANT: You must return ONLY a valid JSON object. Do not include markdown formatting or backticks.
      Structure:
      {
        "title": "A professional title",
        "preface": "A brief introduction",
        "chapters": [
          {
            "title": "Chapter 1 Name",
            "description": "Detailed chapter content"
          }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // 2. Clean up the response to ensure it is valid JSON
    // This removes markdown code blocks if the AI accidentally adds them
    const cleanText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const jsonResponse = JSON.parse(cleanText);

    return new Response(JSON.stringify({ content: jsonResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    // 3. Fixes the 'error is of type unknown' TypeScript error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Edge Function Error:", errorMessage);

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
