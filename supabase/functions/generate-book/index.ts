import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, language = 'en' } = await req.json();
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');

    // 1. CLEAN TOPIC & DETECT SKILL
    // Example: "New York Luxury Travel Guide" -> "New York Luxury Travel"
    const cleanTopic = topic.replace(/guide|manual|book|how to|learn/gi, '').trim();
    const isSkill = /how to|learn|planting|cooking|gardening|self-help|knitting/i.test(topic);

    // 2. GEMINI PROMPT (STRICT TITLES)
    const promptText = `
      You are a professional author. Write a book outline in ${language}.
      Topic: ${topic}
      
      CRITICAL RULES:
      1. The "chapters" array MUST match the Table of Contents exactly. 
      2. Do NOT create a separate "Introduction" chapter unless it is explicitly listed as Chapter 1 in the Table of Contents.
      3. Ensure Chapter Titles are identical in both the TOC and the content body.
      
      Output strictly valid JSON.
      Structure:
      {
        "title": "Main Title",
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
        ],
        "localResources": ${isSkill ? "[]" : '[{"name": "Name", "type": "Type", "rating": 4.5}]'} 
      }
    `;

    console.log("Calling Gemini 1.5 Flash-001...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "Gemini API Error");
    
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini returned empty text");

    // Clean JSON string
    const jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const structure = JSON.parse(jsonStr);

    // 3. IMAGE SEARCH (STRICT & SPECIFIC)
    let coverImageUrl = null;
    
    // Helper function to fetch images
    const fetchImage = async (query: string) => {
      if (!pexelsApiKey) return null;
      try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
          headers: { Authorization: pexelsApiKey }
        });
        const d = await res.json();
        return d.photos?.[0] ? d.photos[0].src.large2x : null;
      } catch (e) {
        console.error("Pexels Error:", e);
        return null;
      }
    };

    if (pexelsApiKey) {
      // A. Cover Image: Force "Skyline/Architecture" and exclude people
      // This stops the "Random Hat Lady" issue.
      const coverQuery = `${cleanTopic} ${isSkill ? '' : 'city skyline architecture'} -woman -man -model -people`.trim();
      coverImageUrl = await fetchImage(coverQuery);

      // B. Chapter Images: Fetch a specific image for EACH chapter
      // This ensures Chapter 1 (Airport) gets an Airport photo, not a random city photo.
      console.log("Fetching chapter images...");
      for (const chapter of structure.chapters) {
        // Query: "New York Luxury Travel Arriving in Style"
        const chapterQuery = `${cleanTopic} ${chapter.title} ${isSkill ? '' : 'landmark'}`.trim();
        chapter.image = await fetchImage(chapterQuery);
      }
    }

    // 4. RETURN RESPONSE
    return new Response(JSON.stringify({
      title: structure.title,
      subtitle: "A Curated Guide",
      coverImage: coverImageUrl,
      chapters: structure.chapters, 
      localResources: structure.localResources || [],
      language
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Backend Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
