import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HIGH_RISK_KEYWORDS = [
  "medical",
  "health",
  "doctor",
  "medicine",
  "treatment",
  "diagnosis",
  "symptom",
  "legal",
  "law",
  "attorney",
  "lawyer",
  "court",
  "lawsuit",
  "contract",
  "sue",
];

const BLOCKED_KEYWORDS = [
  "weapon",
  "explosive",
  "bomb",
  "illegal",
  "hack",
  "narcotic",
  "kill",
  "murder",
  "assassin",
  "poison",
  "suicide",
  "self-harm",
  "terrorism",
];

const WELLNESS_ALLOWED = ["fasting", "diet", "nutrition", "fitness", "exercise", "yoga", "wellness"];

const SAFETY_ERROR = "This topic violates our safety guidelines.";

const SAFETY_DISCLAIMER = `⚠️ IMPORTANT NOTICE: This volume is for educational purposes only. Content does not constitute professional advice. ---`;

async function fetchLocalResources(topic: string, apiKey: string) {
  const searchQuery = `${topic} supplies store`;
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.primaryType,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: searchQuery, maxResultCount: 3 }),
    });
    if (response.ok) {
      const data = await response.json();
      return (
        data.places?.map((place: any) => ({
          name: place.displayName?.text || "Local Business",
          type: place.primaryType || "Retail",
          description: place.formattedAddress || "Local provider.",
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
    const { topic, sessionId, fullBook = false } = await req.json();
    const lowerTopic = topic.toLowerCase();

    // Safety Checks
    const isWellnessAllowed = WELLNESS_ALLOWED.some((keyword) => lowerTopic.includes(keyword));
    const isBlocked = !isWellnessAllowed && BLOCKED_KEYWORDS.some((keyword) => lowerTopic.includes(keyword));

    if (isBlocked) return new Response(JSON.stringify({ error: SAFETY_ERROR }), { status: 400, headers: corsHeaders });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

    const isAutomotive = /\b(car|ferrari|porsche|automotive|engine|vehicle)\b/i.test(topic);
    const chapterCount = fullBook ? 12 : 10;

    const systemPrompt = `You are the Lead Architect at Loom & Page, a publisher of ultra-luxury, high-end coffee table books. 

CRITICAL RULES:
1. Writing Style: Sophisticated, cinematic, and authoritative. NO conversational filler.
2. Tone: Like a luxury magazine (Vogue, Robb Report) or a premium automotive journal.
3. ABSOLUTELY NO mention of "Plates", "Figures", "Diagrams", or "Technical Illustrations".
4. Content: Each chapter must have at least 600 words of rich, instructional narrative.

IMAGE DESCRIPTION RULES:
- Every "imageDescription" MUST be a prompt for a breathtaking 8k realistic photograph.
- Use words like: "Professional studio lighting", "Cinematic rim light", "Shallow depth of field", "Reflective surfaces".
- For cars: Focus on "Macro shots of chrome", "Leather textures", or "Sleek side profiles".

JSON STRUCTURE REQUIRED:
{
  "title": "The Full Title",
  "displayTitle": "Short Title (5 words max)",
  "subtitle": "An elegant subtitle",
  "tableOfContents": [
    { "chapter": 1, "title": "...", "imageDescription": "A professional 8k studio photo of..." }
  ],
  "chapter1Content": "Markdown content here..."
}`;

    const userPrompt = `Generate the instructional volume for: "${topic}". Full book mode: ${fullBook}.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 15000 },
        }),
      },
    );

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonStr = rawContent.match(/```json\s+([\s\S]*?)\s+```/)?.[1] || rawContent;
    const bookData = JSON.parse(jsonStr);

    // Image Generation Logic
    if (FAL_KEY) {
      const aiImageDescription = bookData.tableOfContents[0].imageDescription;
      const falResponse = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${aiImageDescription}. Cinematic 8k photography, professional studio setup, ultra-high resolution.`,
          image_size: "square_hd",
        }),
      });

      if (falResponse.ok) {
        const falData = await falResponse.json();
        bookData.coverImageUrl = falData.images[0].url;
      }
    }

    if (GOOGLE_PLACES_API_KEY) {
      bookData.localResources = await fetchLocalResources(topic, GOOGLE_PLACES_API_KEY);
    }

    return new Response(JSON.stringify(bookData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
