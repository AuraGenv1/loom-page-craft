import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// 1. USE GEMINI API KEY
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
const pexelsApiKey = Deno.env.get("PEXELS_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Helper: Get Smart Image Keywords ---
const getVisualContext = (topic: string, chapterTitle: string): string => {
  const t = topic.toLowerCase();

  if (
    t.includes("travel") ||
    t.includes("guide") ||
    t.includes("stay") ||
    t.includes("visit") ||
    t.includes("vacation")
  ) {
    return `cinematic shot of ${topic}, landmark, architecture, 4k, wide angle, travel photography`;
  }
  if (t.includes("food") || t.includes("cook") || t.includes("recipe") || t.includes("eat")) {
    return `delicious ${topic}, food photography, michelin style, close up, 4k, studio lighting`;
  }
  return `high quality photo of ${topic}, detail shot, hands working, professional, 4k, aesthetic`;
};

// --- Helper: Correct Title Translations ---
const getLocalizedSubtitle = (lang: string): string => {
  switch (lang.toLowerCase()) {
    case "fr":
      return "Le Guide Essentiel";
    case "es":
      return "La Guía Esencial";
    case "it":
      return "La Guida Essenziale";
    case "de":
      return "Der Wesentliche Leitfaden";
    case "pt":
      return "O Guia Essencial";
    case "ja":
      return "必須ガイド";
    case "zh":
      return "基本指南";
    default:
      return "A Curated Guide";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, language = "en" } = await req.json();
    if (!topic) throw new Error("Topic is required");

    console.log(`Generating book for: ${topic} in ${language} using GEMINI`);

    // 2. GEMINI PROMPT
    const promptText = `
      You are an expert author writing a premium guide book in ${language}.
      Topic: ${topic}
      
      Requirements:
      1. Title: Create a catchy, premium main title in ${language}.
      2. Chapters: Generate exactly 10 chapter titles.
      3. Tone: Professional, authoritative, yet accessible.
      4. Language: OUTPUT EVERYTHING STRICTLY IN ${language.toUpperCase()}.
      
      Output strictly valid JSON (no markdown formatting):
      {
        "title": "Main Title",
        "chapters": [
           { "title": "Chapter 1 Title", "description": "Brief summary" },
           ...
        ]
      }
    `;

    // 3. CALL GOOGLE GEMINI API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
        }),
      },
    );

    const data = await response.json();

    // Check for API Errors
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      throw new Error(`Gemini API Error: ${data.error.message}`);
    }

    // 4. PARSE GEMINI RESPONSE
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) throw new Error("Gemini returned empty content");

    // Clean Markdown (Fixes the crash if Gemini adds ```json)
    rawText = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const structure = JSON.parse(rawText);

    // 5. Generate Cover Image (Pexels)
    const coverPrompt = getVisualContext(topic, "Cover");
    let coverImageUrl = null;

    if (pexelsApiKey) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(coverPrompt)}&per_page=1&orientation=portrait`,
          {
            headers: { Authorization: pexelsApiKey },
          },
        );
        const pexelsData = await pexelsRes.json();
        if (pexelsData.photos && pexelsData.photos.length > 0) {
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
