import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram";

const NEGATIVE_PROMPT = "text, letters, words, labels, gibberish, alphabet, watermark, blurry, signature, numbers, captions, titles, book, cover, book mockup, frame, bar graph, tropical, palm trees, generic resort, sports car, luxury car, hyper-realistic, 8k, CGI, digital art, illustration";

// Geographic extraction helper - finds city/state/country from topic
// Returns "City, State/Country" format for geographic grounding
const extractGeographicLocation = (topic: string): string | null => {
  // Match patterns like "Aspen Colorado", "Paris France", "Tokyo Japan"
  const patterns = [
    // "travel to Paris, France" or "guide to Aspen, Colorado"
    /\b(?:in|to|of|about|for|visiting|exploring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?)/i,
    // "Paris Travel Guide" or "Aspen Colorado Guide"
    /^([A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*)/,
  ];
  
  for (const pattern of patterns) {
    const match = topic.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
};

// Detect if topic is travel-related for geographic locking
const isTravelTopic = (topic: string): boolean => {
  const travelPatterns = /\b(travel|trip|vacation|tour|visit|guide|destination|city|country|explore|journey|getaway|resort|hotel|tourism)\b/i;
  return travelPatterns.test(topic);
};

const buildPrompt = (variant: Variant, topicOrTitle: string, caption?: string) => {
  const location = extractGeographicLocation(topicOrTitle);
  const isTravel = isTravelTopic(topicOrTitle);
  
  // GEOGRAPHIC LOCK: For travel, MUST include specific city/state
  // Explicitly forbid generic tropical/resort elements
  const locationClause = location 
    ? `authentic ${location} landmarks and scenery, specific to ${location}, ` 
    : '';
  
  const antiGenericClause = isTravel 
    ? 'NOT tropical, NOT palm trees, NOT generic resort, authentic local architecture, ' 
    : '';
  
  if (variant === "diagram") {
    // Candid 35mm film photography for [IMAGE:] tags - with geographic grounding and known landmarks
    return `Candid photography, shot on 35mm film, natural sunlight, unpolished, authentic everyday scene: ${caption || topicOrTitle}. ${locationClause}${antiGenericClause}Architectural landmark visible. Editorial magazine quality. Strictly NO text, NO diagrams, NO illustrations, NO people, NO sports cars.`;
  }

  // COVER PROMPT: Full-bleed authentic location photograph
  // Uses candid 35mm film style - NOT hyper-realistic or 8k (which look like AI)
  return `A full-bleed, professional editorial photograph of ${topicOrTitle}. ${locationClause}${antiGenericClause}Candid photography, shot on 35mm film, natural sunlight, unpolished, authentic everyday scene, known local architectural landmark. Strictly NO text, NO book mockups, NO frames, NO bar graphs, NO diagrams, NO people, NO illustrations, NO sports cars.`;
};

async function fetchWithRetry(url: string, init: RequestInit, retries = 2) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;

      // Retry transient upstream errors
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const waitMs = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Unknown error");
      if (attempt < retries) {
        const waitMs = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Unknown error");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption } = await req.json();

    // Validate session_id to prevent bot abuse
    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid or missing session_id:", sessionId);
      return new Response(JSON.stringify({ error: "Valid session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Limit input length to prevent cost abuse
    const MAX_INPUT_LENGTH = 200;
    const rawSubject = (topic || title || "").toString();
    if (rawSubject.length > MAX_INPUT_LENGTH) {
      console.error("Input too long:", rawSubject.length, "chars");
      return new Response(JSON.stringify({ error: `Input must be ${MAX_INPUT_LENGTH} characters or less` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedVariant: Variant = variant === "diagram" ? "diagram" : "cover";
    const subject = rawSubject;

    console.log(`Generating ${resolvedVariant} image for: ${subject}`);

    const prompt = buildPrompt(resolvedVariant, subject, caption);
    
    // Use FAL.AI directly with FAL_KEY
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      console.error("FAL_KEY not configured");
      return new Response(JSON.stringify({ error: "Image service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Calling FAL.AI flux/dev endpoint...");

    const response = await fetchWithRetry(
      "https://fal.run/fal-ai/flux/dev",
      {
        method: "POST",
        headers: {
          "Authorization": `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: NEGATIVE_PROMPT,
          image_size: "square_hd",
          num_inference_steps: 28,
          num_images: 1,
          enable_safety_checker: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FAL.AI API error:", response.status, errorText);
      throw new Error(`FAL.AI API error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.images?.[0]?.url;

    if (!imageUrl) {
      console.error("No image URL in FAL.AI response:", data);
      throw new Error("No image generated");
    }

    console.log("FAL.AI image generated successfully");

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error generating image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

