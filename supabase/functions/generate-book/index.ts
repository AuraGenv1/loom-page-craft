import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Generate a comprehensive artisan guide about: ${topic}.
      
      You must return ONLY a raw JSON object. 
      Do NOT include markdown formatting like \`\`\`json.
      
      Structure:
      {
        "title": "Title",
        "displayTitle": "Main Title",
        "subtitle": "Subtitle",
        "preface": "Intro text",
        "topic": "${topic}",
        "chapters": [
          {
            "title": "Chapter 1",
            "description": "Content here..."
          }
        ],
        "tableOfContents": [
          { "chapter": 1, "title": "Chapter 1" }
        ],
        "hasDisclaimer": true
      }
    `;

    // Fixed: Removed generation_config with response_mime_type to prevent 500 error
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Safety check: Remove any accidental markdown backticks from the AI
    const cleanJsonString = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsedContent = JSON.parse(cleanJsonString);

    return new Response(JSON.stringify({ content: parsedContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
