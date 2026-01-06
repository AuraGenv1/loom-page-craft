import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchLocalResources(topic: string, apiKey: string) {
  const searchQuery = `${topic} specialized expert service`;
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.primaryType,places.formattedAddress,places.id,places.rating",
      },
      body: JSON.stringify({ textQuery: searchQuery, maxResultCount: 4 }),
    });

    if (response.ok) {
      const data = await response.json();
      return (
        data.places?.map((place: any) => ({
          name: place.displayName?.text || "Specialist Provider",
          type: place.primaryType || "Artisan Service",
          description: `Premier local specialist offering bespoke services for ${topic}.`,
          address: place.formattedAddress,
          placeId: place.id,
          rating: place.rating,
        })) || []
      );
    }
  } catch (e) {
    console.error("Places API error", e);
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    const systemPrompt = `You are the Lead Architect at Loom & Page, a publisher of ultra-luxury, high-end coffee table books. 

CRITICAL RULES:
1. Writing Style: Sophisticated, cinematic, and authoritative. NO conversational filler.
2. Tone: Like a luxury magazine (Vogue, Robb Report) or a premium automotive journal.
3. Content: Each chapter must have at least 600 words of rich, instructional narrative.

IMAGE DESCRIPTION RULES:
- Every "imageDescription" MUST be a prompt for a breathtaking 8k realistic photograph.
- Use words like: "Professional studio lighting", "Cinematic rim light", "Shallow depth of field".

JSON STRUCTURE REQUIRED:
{
  "title": "The Full Title",
  "displayTitle": "Short Title (5 words max)",
  "subtitle": "An elegant luxury subtitle",
  "tableOfContents": [
    { "chapter": 1, "title": "...", "imageDescription": "A professional 8k studio photo of..." }
  ],
  "chapter1Content": "Detailed Markdown content here..."
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nGenerate for: ${topic}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 15000 },
        }),
      },
    );

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonStr = rawContent.match(/```json\s+([\s\S]*?)\s+```/)?.[1] || rawContent;
    const bookData = JSON.parse(jsonStr.trim());

    if (FAL_KEY && bookData.tableOfContents?.[0]?.imageDescription) {
      const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${bookData.tableOfContents[0].imageDescription}. Cinematic 8k photography, professional studio setup.`,
          image_size: "square_hd",
        }),
      });
      if (falRes.ok) {
        const falData = await falRes.json();
        bookData.coverImageUrl = falData.images[0].url;
      }
    }

    if (PLACES_KEY) {
      bookData.localResources = await fetchLocalResources(topic, PLACES_KEY);
    }

    return new Response(JSON.stringify(bookData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
