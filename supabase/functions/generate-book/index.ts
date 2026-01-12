import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
const pexelsApiKey = Deno.env.get("PEXELS_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SIMPLIFY QUERY for Pexels (Fixes "Bad Image" issue)
const getVisualQuery = (topic: string): string => {
  return topic.replace(/guide|manual|book|how to|learn/gi, "").trim();
};

const getLocalizedSubtitle = (lang: string): string => {
  switch (lang.toLowerCase()) {
    case "fr":
      return "Le Guide Essentiel";
    case "es":
      return "La Guía Esencial";
    case "it":
      return "La Guida Essenziale";
    default:
      return "A Curated Guide";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, language = "en" } = await req.json();

    // 1. GEMINI PROMPT
    const promptText = `
      You are a travel and skills expert writing a book in ${language}.
      Topic: ${topic}
      
      Output valid JSON only. No markdown formatting. No \`\`\` code blocks.
      Structure:
      {
        "title": "A creative title in ${language}",
        "chapters": [
           { "title": "Chapter 1 Title", "description": "Short summary" },
           { "title": "Chapter 2 Title", "description": "Short summary" },
           { "title": "Chapter 3 Title", "description": "Short summary" },
           { "title": "Chapter 4 Title", "description": "Short summary" },
           { "title": "Chapter 5 Title", "description": "Short summary" },
           { "title": "Chapter 6 Title", "description": "Short summary" },
           { "title": "Chapter 7 Title", "description": "Short summary" },
           { "title": "Chapter 8 Title", "description": "Short summary" },
           { "title": "Chapter 9 Title", "description": "Short summary" },
           { "title": "Chapter 10 Title", "description": "Short summary" }
        ]
      }
    `;

    // 2. CALL GEMINI (Switched to STABLE gemini-pro)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
        }),
      },
    );

    const data = await response.json();

    // API Error Check
    if (data.error) {
      console.error("Gemini Error:", data.error);
      throw new Error(data.error.message || "Gemini API Error");
    }

    // 3. PARSE RESPONSE
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini returned empty text");

    // Clean Markdown
    rawText = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let structure;
    try {
      structure = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON Parse Error:", rawText);
      throw new Error("Failed to parse AI response");
    }

    // 4. GET IMAGE
    const visualQuery = getVisualQuery(topic);
    let coverImageUrl = null;

    if (pexelsApiKey) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(visualQuery)}&per_page=1&orientation=portrait`,
          {
            headers: { Authorization: pexelsApiKey },
          },
        );
        const pexelsData = await pexelsRes.json();
        if (pexelsData.photos?.length > 0) {
          coverImageUrl = pexelsData.photos[0].src.large2x;
        }
      } catch (e) {
        console.error("Pexels error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        title: structure.title,
        subtitle: getLocalizedSubtitle(language),
        coverImage: coverImageUrl,
        chapters: structure.chapters,
        language: language,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
