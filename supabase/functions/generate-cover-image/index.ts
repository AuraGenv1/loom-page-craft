import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fallback placeholder image - elegant abstract gradient (never crashes)
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=1200&q=80";

// Successful response helper - always returns valid image(s)
const successResponse = (imageUrl: string, imageUrls: string[] = [imageUrl]) => {
  return new Response(JSON.stringify({ imageUrl, imageUrls }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

/**
 * TOPIC ANCHORING: Extract the core subject/location from a book topic
 * "Aspen Luxury Travel Guide" → "Aspen Colorado"
 * "London Travel Guide" → "London"
 */
const extractTopicAnchor = (topic: string): string => {
  const stopWords = ['guide', 'travel', 'comprehensive', 'complete', 'ultimate', 'luxury', 
                     'artisan', 'curated', 'definitive', 'essential', 'peak', 'indulgence',
                     'a', 'the', 'to', 'for', 'of', 'in', 'about', 'hotel', 'resort'];
  
  const words = topic.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => !stopWords.includes(w) && w.length > 2);
  
  // Return first 2 significant words (usually location + descriptor)
  return words.slice(0, 2).join(' ');
};

/**
 * Fetch images from Unsplash API (higher quality, better relevance)
 */
async function fetchUnsplashImages(query: string, accessKey: string): Promise<string[]> {
  try {
    console.log("Unsplash search query:", query);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=squarish`,
      {
        headers: { Authorization: `Client-ID ${accessKey}` },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error("Unsplash API error:", response.status);
      return [];
    }
    
    const data = await response.json();
    const results = data.results ?? [];
    
    if (!results.length) {
      console.log("Unsplash returned no results for query:", query);
      return [];
    }
    
    // Get regular-sized images (suitable for covers)
    const imageUrls = results
      .slice(0, 5)
      .map((photo: { urls?: { regular?: string; full?: string } }) => 
        photo.urls?.regular || photo.urls?.full
      )
      .filter((url: string | undefined): url is string => typeof url === "string");
    
    console.log(`Returning ${imageUrls.length} Unsplash image URLs`);
    return imageUrls;
  } catch (error) {
    console.error("Unsplash fetch error:", error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption, customPrompt } = await req.json();

    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid sessionId");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    const rawSubject = (customPrompt || topic || title || "").toString();
    if (!rawSubject || rawSubject.length > 500) {
      console.log("Input invalid, using fallback");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    // ============ UNSPLASH API KEY ============
    const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY");
    
    if (!UNSPLASH_ACCESS_KEY) {
      console.error("⚠️ UNSPLASH_ACCESS_KEY not configured");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    // Build topic-anchored search query for covers
    const coverSubject = topic || title || "";
    const topicAnchor = extractTopicAnchor(coverSubject);
    
    // Primary search: Topic anchor + "landmark scenic"
    let searchQuery = `${topicAnchor} landmark scenic architecture`;
    console.log("Cover search query (anchored):", searchQuery);
    
    let imageUrls = await fetchUnsplashImages(searchQuery, UNSPLASH_ACCESS_KEY);
    
    // Retry 1: Just the topic anchor + "landscape"
    if (imageUrls.length === 0) {
      searchQuery = `${topicAnchor} landscape beautiful`;
      console.log("Retry 1:", searchQuery);
      imageUrls = await fetchUnsplashImages(searchQuery, UNSPLASH_ACCESS_KEY);
    }
    
    // Retry 2: Broader - just topic anchor
    if (imageUrls.length === 0) {
      searchQuery = topicAnchor;
      console.log("Retry 2:", searchQuery);
      imageUrls = await fetchUnsplashImages(searchQuery, UNSPLASH_ACCESS_KEY);
    }
    
    // Retry 3: Abstract luxury fallback
    if (imageUrls.length === 0) {
      searchQuery = "luxury resort mountain landscape";
      console.log("Retry 3 (fallback):", searchQuery);
      imageUrls = await fetchUnsplashImages(searchQuery, UNSPLASH_ACCESS_KEY);
    }

    if (imageUrls.length === 0) {
      console.log("No images found after retries, returning fallback");
      return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
    }

    return successResponse(imageUrls[0], imageUrls);

  } catch (error: unknown) {
    console.error("Error in generate-cover-image:", error);
    return successResponse(FALLBACK_IMAGE, [FALLBACK_IMAGE]);
  }
});
