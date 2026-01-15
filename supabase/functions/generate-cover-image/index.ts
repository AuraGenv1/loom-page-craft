import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram" | "back-cover";

// Fallback placeholder image - always works, never crashes
const FALLBACK_IMAGE = "https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2";

// Successful response helper - always returns valid image(s)
const successResponse = (imageUrl: string, imageUrls: string[] = [imageUrl]) => {
  return new Response(JSON.stringify({ imageUrl, imageUrls }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

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

/**
 * Build search query for Pexels
 * PRIORITY: customPrompt takes precedence over auto-generated queries
 */
const buildSearchQuery = (variant: Variant, topicOrTitle: string, caption?: string, customPrompt?: string): string => {
  // CUSTOM PROMPT OVERRIDE: If provided, use it directly with quality enhancers
  if (customPrompt && customPrompt.trim().length > 0) {
    // Return the custom prompt as-is - Pexels will search for it
    console.log("Using custom prompt for search:", customPrompt);
    return customPrompt.trim();
  }

  const location = extractGeographicLocation(topicOrTitle);
  const isTravel = isTravelTopic(topicOrTitle);

  // Back cover variant: minimalist texture-focused backgrounds
  if (variant === "back-cover") {
    // Abstract textures and backgrounds for back covers
    const textureKeywords = ["texture", "abstract", "pattern", "background", "marble", "gradient"];
    if (location) {
      return `${location} texture abstract background`;
    }
    return `abstract texture background minimalist`;
  }

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
 * Fetch images from Pexels API with full error handling
 * NEVER throws - always returns array (empty on failure)
 */
async function fetchPexelsImages(query: string, apiKey: string, orientation: string = "landscape"): Promise<string[]> {
  try {
    console.log("Pexels search query:", query, "orientation:", orientation);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=${orientation}`,
      {
        headers: { Authorization: apiKey },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pexels API error:", response.status, errorText);
      return [];
    }

    const data = await response.json();
    const photos = data.photos ?? [];

    if (!photos.length) {
      console.log("Pexels returned no results for query:", query);
      return [];
    }

    // Extract large2x or large image URLs
    const imageUrls = photos
      .slice(0, 5)
      .map((photo: { src?: { large2x?: string; large?: string; original?: string } }) => {
        return photo.src?.large2x || photo.src?.large || photo.src?.original;
      })
      .filter((url: string | undefined): url is string => typeof url === "string" && url.length > 0);

    console.log(`Returning ${imageUrls.length} Pexels image URLs`);
    return imageUrls;
  } catch (error) {
    // Catch ALL errors - timeout, network, parsing, etc.
    console.error("Pexels fetch error (handled gracefully):", error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption, customPrompt } = await req.json();

    // Session validation
    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid or missing sessionId:", sessionId);
      // Return fallback instead of error to prevent crashes
      console.log("Returning fallback due to invalid session");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    const MAX_INPUT_LENGTH = 500; // Increased for custom prompts
    const rawSubject = (customPrompt || topic || title || "").toString();
    if (!rawSubject || rawSubject.length > MAX_INPUT_LENGTH) {
      console.log("Input too long or empty, using fallback");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    const resolvedVariant: Variant = variant === "diagram" ? "diagram" : variant === "back-cover" ? "back-cover" : "cover";

    // ============ PEXELS API KEY - CRITICAL ============
    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");

    if (!PEXELS_API_KEY) {
      // Log clearly but DO NOT crash - return fallback
      console.error("⚠️ PEXELS_API_KEY not configured in Supabase secrets");
      console.log("Returning fallback image due to missing API key");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    // Build search query - customPrompt takes priority
    const coverSubject = (topic || title || "").toString();
    const subjectForQuery = resolvedVariant === "cover" ? coverSubject : rawSubject;
    const searchQuery = buildSearchQuery(resolvedVariant, subjectForQuery, caption, customPrompt);

    // Determine orientation based on variant
    const orientation = resolvedVariant === "back-cover" ? "portrait" : "landscape";

    // Attempt to fetch images - wrapped in try/catch
    let imageUrls: string[] = [];
    try {
      imageUrls = await fetchPexelsImages(searchQuery, PEXELS_API_KEY, orientation);
    } catch (fetchError) {
      console.error("Outer catch for Pexels fetch:", fetchError);
      // Continue with empty array
    }

    // If no images found, return fallback (not error)
    if (imageUrls.length === 0) {
      console.log("No images found, returning fallback");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    // Success - return images
    return successResponse(imageUrls[0], imageUrls);

  } catch (error: unknown) {
    // GLOBAL catch - NEVER return 500, always return fallback
    console.error("Error in generate-cover-image (handled):", error);
    return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
  }
});
