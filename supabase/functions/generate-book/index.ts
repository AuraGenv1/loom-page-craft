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
    const { topic } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }

    if (!topic || typeof topic !== "string") {
      throw new Error("Missing or invalid topic");
    }

    // Optimized prompt - 5-8 chapters to avoid truncation
    const prompt = `You are a professional book author. Generate a comprehensive artisan guide about: "${topic}".

CRITICAL JSON RULES:
1. Return ONLY valid JSON - no text before or after
2. Do NOT use markdown code blocks
3. Start with { and end with }
4. Escape all quotes inside strings with backslash
5. No trailing commas

Generate 5-8 chapters with detailed content (200-400 words each).

EXACT JSON structure:
{
  "title": "Main book title",
  "displayTitle": "Display title",
  "subtitle": "Subtitle under 80 chars",
  "preface": "2 paragraph introduction about ${topic}",
  "topic": "${topic}",
  "chapters": [
    {"title": "Chapter 1 Title", "description": "Detailed content 200-400 words"},
    {"title": "Chapter 2 Title", "description": "Detailed content 200-400 words"},
    {"title": "Chapter 3 Title", "description": "Detailed content 200-400 words"},
    {"title": "Chapter 4 Title", "description": "Detailed content 200-400 words"},
    {"title": "Chapter 5 Title", "description": "Detailed content 200-400 words"}
  ],
  "tableOfContents": [
    {"chapter": 1, "title": "Chapter 1 Title"},
    {"chapter": 2, "title": "Chapter 2 Title"},
    {"chapter": 3, "title": "Chapter 3 Title"},
    {"chapter": 4, "title": "Chapter 4 Title"},
    {"chapter": 5, "title": "Chapter 5 Title"}
  ],
  "localResources": [],
  "hasDisclaimer": true
}`;

    console.log("Calling Gemini API for topic:", topic);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Gemini response received");

    if (!data.candidates || data.candidates.length === 0) {
      console.error("No candidates in response");
      throw new Error("No candidates returned from Gemini API");
    }

    const candidate = data.candidates[0];
    
    // Check for truncation
    if (candidate.finishReason === "MAX_TOKENS") {
      console.error("Response was truncated due to max tokens");
      throw new Error("Response truncated - please try a simpler topic");
    }

    if (!candidate.content?.parts?.[0]?.text) {
      console.error("No content in candidate");
      throw new Error("No content in Gemini response");
    }

    const text = candidate.content.parts[0].text;

    // Clean the response
    let cleanJson = text.trim();
    
    // Remove markdown code blocks
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.slice(7);
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.slice(3);
    }
    if (cleanJson.endsWith("```")) {
      cleanJson = cleanJson.slice(0, -3);
    }
    cleanJson = cleanJson.trim();

    // Attempt to fix common JSON issues
    // Remove trailing commas before } or ]
    cleanJson = cleanJson.replace(/,(\s*[}\]])/g, '$1');

    // Try to parse JSON
    let parsedContent;
    try {
      parsedContent = JSON.parse(cleanJson);
    } catch (parseError: any) {
      console.error("JSON parse error:", parseError.message);
      console.error("Raw text (first 1000 chars):", cleanJson.substring(0, 1000));
      console.error("Raw text (last 500 chars):", cleanJson.substring(cleanJson.length - 500));
      
      // Check if JSON appears truncated
      if (!cleanJson.endsWith("}")) {
        throw new Error("Response was incomplete - please try again");
      }
      throw new Error("Failed to parse response - please try again");
    }

    const chapterCount = parsedContent.chapters?.length || 0;
    console.log(`Successfully parsed book with ${chapterCount} chapters`);

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
