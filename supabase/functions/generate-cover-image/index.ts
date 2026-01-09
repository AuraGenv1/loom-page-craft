import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram";

// Geographic extraction helper - finds city/state/country from topic
const extractGeographicLocation = (topic: string): string | null => {
  const patterns = [
    /\b(?:in|to|of|about|for|visiting|exploring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?)/i,
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

// Detect if topic is travel-related
const isTravelTopic = (topic: string): boolean => {
  const travelPatterns = /\b(travel|trip|vacation|tour|visit|guide|destination|city|country|explore|journey|getaway|resort|hotel|tourism)\b/i;
  return travelPatterns.test(topic);
};

// Build search query for Google Custom Search
const buildSearchQuery = (variant: Variant, topicOrTitle: string, caption?: string): string => {
  const location = extractGeographicLocation(topicOrTitle);
  const isTravel = isTravelTopic(topicOrTitle);
  
  if (variant === "diagram" && caption) {
    // Use caption for inline images
    const locationSuffix = location ? ` ${location}` : '';
    return `${caption}${locationSuffix} photograph`;
  }

  // Cover image: search for the location/topic as editorial photograph
  if (isTravel && location) {
    return `${location} landmark architecture photograph editorial`;
  }
  
  return `${topicOrTitle} professional photograph`;
};

// Fetch image from Google Custom Search JSON API
async function fetchGoogleImage(
  query: string, 
  apiKey: string, 
  cx: string
): Promise<string | null> {
  try {
    console.log("Google CSE search query:", query);
    
    const params = new URLSearchParams({
      key: apiKey,
      cx: cx,
      q: query,
      searchType: "image",
      num: "5", // Get top 5 results for variety
      imgSize: "xlarge",
      imgType: "photo",
      safe: "active",
    });

    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google CSE API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      // Return the first high-quality image link
      const imageUrl = data.items[0].link;
      console.log("Google CSE found image:", imageUrl);
      return imageUrl;
    }

    console.log("Google CSE returned no results");
    return null;
  } catch (error) {
    console.error("Google CSE fetch error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption } = await req.json();

    // Validate session_id
    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid or missing session_id:", sessionId);
      return new Response(JSON.stringify({ error: "Valid session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Limit input length
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

    console.log(`Fetching ${resolvedVariant} image for: ${subject}`);

    // Get Google CSE credentials
    const GOOGLE_CSE_API_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
    const GOOGLE_CSE_CX = Deno.env.get("GOOGLE_CSE_CX");
    
    if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) {
      console.error("Google CSE credentials not configured");
      return new Response(JSON.stringify({ error: "Image service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build search query
    const searchQuery = buildSearchQuery(resolvedVariant, subject, caption);
    
    // Fetch from Google Custom Search
    const imageUrl = await fetchGoogleImage(searchQuery, GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX);

    if (!imageUrl) {
      console.error("No image found for query:", searchQuery);
      return new Response(JSON.stringify({ error: "No suitable image found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Image fetched successfully:", imageUrl);

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
