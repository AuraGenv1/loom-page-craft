import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { topic, language = 'en' } = await req.json();
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');

    // 1. Clean the Topic to avoid generic results
    // "Tokyo Luxury Travel Guide" -> "Tokyo Luxury Travel"
    const cleanTopic = topic.replace(/guide|manual|book|how to|learn/gi, '').trim();
    
    // Check if it is a skill (like "Cooking") vs a place
    const isSkill = /how to|learn|planting|cooking|gardening|self-help/i.test(topic);

    // 2. Gemini Prompt (Tier 1 Compatible)
    const promptText = `
      You are a professional author. Write a book outline in ${language}.
      Topic: ${topic}
      
      Output strictly valid JSON.
      Structure:
      {
        "title": "Main Title",
        "chapters": [
           { "title": "Chapter 1", "description": "Short summary" },
           { "title": "Chapter 2", "description": "Short summary" },
           { "title": "Chapter 3", "description": "Short summary" },
           { "title": "Chapter 4", "description": "Short summary" },
           { "title": "Chapter 5", "description": "Short summary" },
           { "title": "Chapter 6", "description": "Short summary" },
           { "title": "Chapter 7", "description": "Short summary" },
           { "title": "Chapter 8", "description": "Short summary" },
           { "title": "Chapter 9", "description": "Short summary" },
           { "title": "Chapter 10", "description": "Short summary" }
        ],
        "localResources": ${isSkill ? "[]" : '[{"name": "Example Place", "type": "Type", "rating": 4.5}]'} 
      }
    `;

    // 3. Call Gemini Pro
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "Gemini API Error");
    
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini returned empty text");

    const jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const structure = JSON.parse(jsonStr);

    // 4. Fetch Cover Image (Smart Search)
    let coverImageUrl = null;
    if (pexelsApiKey) {
      try {
        // Search: "Tokyo Luxury Travel city landmark"
        const query = `${cleanTopic} ${isSkill ? '' : 'city landmark'}`.trim();
        const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
          headers: { Authorization: pexelsApiKey }
        });
        const pexelsData = await pexelsRes.json();
        if (pexelsData.photos?.[0]) coverImageUrl = pexelsData.photos[0].src.large2x;
      } catch (e) { console.error("Pexels Error:", e); }
    }

    return new Response(JSON.stringify({
      title: structure.title,
      subtitle: "A Curated Guide",
      coverImage: coverImageUrl,
      chapters: structure.chapters,
      localResources: structure.localResources || [],
      language
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
