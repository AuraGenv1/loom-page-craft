import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Helper: Get Smart Image Keywords ---
// This fixes the "Bathtub" issue by checking what KIND of guide this is.
const getVisualContext = (topic: string, chapterTitle: string): string => {
  const t = topic.toLowerCase();
  const c = chapterTitle.toLowerCase();
  
  // 1. Travel / Place Logic
  if (t.includes('travel') || t.includes('guide') || t.includes('stay') || t.includes('visit') || t.includes('vacation')) {
    return `cinematic shot of ${topic}, landmark, architecture, 4k, wide angle, travel photography`;
  }
  
  // 2. Food / Cooking Logic
  if (t.includes('food') || t.includes('cook') || t.includes('recipe') || t.includes('eat')) {
    return `delicious ${topic}, food photography, michelin style, close up, 4k, studio lighting`;
  }

  // 3. Skill / Craft Logic (Default)
  return `high quality photo of ${topic}, detail shot, hands working, professional, 4k, aesthetic`;
};

// --- Helper: Correct Title Translations ---
// This fixes the "Healer" (Soigné) issue.
const getLocalizedSubtitle = (lang: string): string => {
  switch (lang.toLowerCase()) {
    case 'fr': return "Le Guide Essentiel";      // French
    case 'es': return "La Guía Esencial";        // Spanish
    case 'it': return "La Guida Essenziale";     // Italian
    case 'de': return "Der Wesentliche Leitfaden"; // German
    case 'pt': return "O Guia Essencial";        // Portuguese
    case 'ja': return "必須ガイド";               // Japanese
    case 'zh': return "基本指南";                 // Chinese
    default: return "A Curated Guide";           // English
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, language = 'en' } = await req.json();

    if (!topic) throw new Error('Topic is required');

    console.log(`Generatng book for: ${topic} in ${language}`);

    // 1. Generate Structure (Table of Contents)
    const systemPrompt = `
      You are an expert author writing a premium guide book in ${language}.
      Topic: ${topic}
      
      Requirements:
      1. Title: Create a catchy, premium main title in ${language}.
      2. Chapters: Generate exactly 10 chapter titles.
      3. Tone: Professional, authoritative, yet accessible.
      4. Language: OUTPUT EVERYTHING STRICTLY IN ${language.toUpperCase()}.
      
      Format (JSON):
      {
        "title": "Main Title",
        "chapters": [
           { "title": "Chapter 1 Title", "description": "Brief summary" },
           ...
        ]
      }
    `;

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use GPT-4o for better language skills
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.7,
      }),
    });

    const aiData = await completion.json();
    const structure = JSON.parse(aiData.choices[0].message.content);

    // 2. Generate Cover Image (Using Smart Context