import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram";

// Fallback placeholder image (subtle gradient)
const FALLBACK_IMAGE = "https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2";

// More permissive location extraction
const extractGeographicLocation = (topic: string): string | null => {
  const patterns = [
    /\b(?:in|to|of|about|for|visiting|exploring)\s+([A-Z][\w''\-\.]+(?:\s+[A-Z][\w''\-\.]+)*(?:,\s*[A-Z][\w''\-\.]+(?:\s+[A-Z][\w''\-\.]+)*)?)/i,
    /^([A-Z][\w''\-\.]+(?:,?\s+[A-Z][\w''\-\.]+)*)/,
  ];

  for (const p of patterns) {
    const m = topic.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
};

const isTravelTopic = (topic: string): boolean => {
  const travelPatterns = /\b(travel|trip|vacation|tour|visit|guide|destination|city|country|explore|journey|getaway|resort|hotel|tourism|itinerary)\b/i;
  return travelPatterns.test(topic);
};

const buildSearchQuery = (variant: Variant, topicOrTitle: string, caption?: string): string => {
  const location = extractGeographicLocation(topicOrTitle);
  const isTravel = isTravelTopic(topicOrTitle);

  if (variant === "diagram" && caption) {
    const locationSuffix = location ? ` ${location}` : "";
    return `${caption}${locationSuffix}`;
  }

  // Cover image: prioritize location grounding for travel topics
  if (isTravel && location) {
    return `${location} landmark architecture`;
  }

  return topicOrTitle;
};

/**
 * Fetch images from Pexels API
 * Returns array of validated image URLs for frontend fallback cycling.
 */
async function fetchPexelsImages(query: string, apiKey: string): Promise<string[]> {
  try {
    console.log("Pexels search query:", query);

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pexels API error:", response.status, errorText);
      return [];
    }

    const data = await response.json();
    const photos = data.photos ?? [];

    if (!photos.length) {
      console.log("Pexels returned no results");
      return [];
    }

    // Extract large2x or large image URLs
    const imageUrls = photos
      .slice(0, 5) // Limit to 5 images
      .map((photo: { src?: { large2x?: string; large?: string; original?: string } }) => {
        return photo.src?.large2x || photo.src?.large || photo.src?.original;
      })
      .filter((url: string | undefined): url is string => typeof url === "string" && url.length > 0);

    console.log(`Returning ${imageUrls.length} Pexels image URLs`);
    return imageUrls;
  } catch (error) {
    console.error("Pexels fetch error:", error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption } = await req.json();

    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid or missing sessionId:", sessionId);
      return new Response(JSON.stringify({ error: "Valid session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MAX_INPUT_LENGTH = 200;
    const rawSubject = (topic || title || "").toString();
    if (!rawSubject || rawSubject.length > MAX_INPUT_LENGTH) {
      return new Response(JSON.stringify({ error: `Input must be ${MAX_INPUT_LENGTH} characters or less` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedVariant: Variant = variant === "diagram" ? "diagram" : "cover";

    // Use PEXELS_API_KEY from Supabase secrets
    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");

    if (!PEXELS_API_KEY) {
      console.error("PEXELS_API_KEY not configured in Supabase secrets");
      // Return fallback image instead of error to prevent app crashes
      console.log("Returning fallback image due to missing API key");
      return new Response(JSON.stringify({ 
        imageUrl: FALLBACK_IMAGE,
        imageUrls: [FALLBACK_IMAGE],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For cover: use topic first (more accurate), then title as fallback
    const coverSubject = (topic || title || "").toString();
    const subjectForQuery = resolvedVariant === "cover" ? coverSubject : rawSubject;

    const searchQuery = buildSearchQuery(resolvedVariant, subjectForQuery, caption);
    
    let imageUrls: string[] = [];
    
    try {
      imageUrls = await fetchPexelsImages(searchQuery, PEXELS_API_KEY);
    } catch (fetchError) {
      console.error("Error fetching from Pexels:", fetchError);
      // Continue with empty array, will use fallback below
    }

    // If no images found, return fallback
    if (imageUrls.length === 0) {
      console.log("No images found, using fallback");
      return new Response(JSON.stringify({ 
        imageUrl: FALLBACK_IMAGE,
        imageUrls: [FALLBACK_IMAGE],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return both array (for fallback) and single URL (for backward compatibility)
    return new Response(JSON.stringify({ 
      imageUrl: imageUrls[0],  // Primary URL (backward compatible)
      imageUrls: imageUrls,    // Full array for fallback cycling
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in generate-cover-image:", error);
    // Even on error, return fallback image to prevent app crashes
    return new Response(JSON.stringify({ 
      imageUrl: FALLBACK_IMAGE,
      imageUrls: [FALLBACK_IMAGE],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
