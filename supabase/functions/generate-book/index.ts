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

    // Use prompt-based JSON enforcement - require 10-20 detailed chapters
    const prompt = `You are a professional book author. Generate a comprehensive artisan guide about: "${topic}".

CRITICAL: You MUST return ONLY a valid JSON object. Do NOT include any text before or after the JSON.
Do NOT wrap the JSON in markdown code blocks or backticks.
Start your response with { and end with }.

IMPORTANT: Generate between 10 to 20 detailed chapters that weave together a cohesive narrative about ${topic}.

The JSON structure must be EXACTLY:
{
  "title": "The main title of the book",
  "displayTitle": "A beautiful display title",
  "subtitle": "A compelling subtitle under 100 characters",
  "preface": "A 2-3 paragraph introduction to the subject matter that sets the stage for the journey ahead",
  "topic": "${topic}",
  "chapters": [
    {
      "title": "Chapter 1 Title",
      "description": "Full detailed content for this chapter, at least 800 words with practical guidance, examples, and insights"
    },
    {
      "title": "Chapter 2 Title", 
      "description": "Full detailed content for chapter 2, continuing the narrative thread"
    },
    ... continue for 10-20 total chapters ...
  ],
  "tableOfContents": [
    { "chapter": 1, "title": "Chapter 1 Title" },
    { "chapter": 2, "title": "Chapter 2 Title" },
    ... matching entries for all chapters ...
  ],
  "localResources": [],
  "hasDisclaimer": true
}

Requirements:
- Generate EXACTLY between 10 and 20 chapters (minimum 10, maximum 20)
- Each chapter must have at least 800 words of detailed, educational content
- The narrative must weave consistently across all chapters, building upon previous concepts
- Include practical examples, tips, and real-world applications
- The tableOfContents must list ALL chapters in order
- Make the content feel like a professionally authored artisan guide`;

    console.log("Calling Gemini API for topic:", topic);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 32000,
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
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Gemini response received");

    // Robust check for candidates
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      console.error("No candidates in response:", JSON.stringify(data));
      throw new Error("No candidates returned from Gemini API");
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error("No content in candidate:", JSON.stringify(candidate));
      throw new Error("No content in Gemini response candidate");
    }

    const text = candidate.content.parts[0].text;
    if (!text) {
      throw new Error("Empty text in Gemini response");
    }

    // Clean the response - strip markdown code blocks if present
    let cleanJsonString = text.trim();
    
    // Remove markdown code blocks
    if (cleanJsonString.startsWith("```json")) {
      cleanJsonString = cleanJsonString.slice(7);
    } else if (cleanJsonString.startsWith("```")) {
      cleanJsonString = cleanJsonString.slice(3);
    }
    if (cleanJsonString.endsWith("```")) {
      cleanJsonString = cleanJsonString.slice(0, -3);
    }
    cleanJsonString = cleanJsonString.trim();

    // Try to parse JSON
    let parsedContent;
    try {
      parsedContent = JSON.parse(cleanJsonString);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw text:", cleanJsonString.substring(0, 500));
      throw new Error("Failed to parse JSON from Gemini response");
    }

    // Validate chapter count
    const chapterCount = parsedContent.chapters?.length || 0;
    console.log(`Successfully parsed book content with ${chapterCount} chapters`);

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
