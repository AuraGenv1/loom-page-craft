import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageResult {
  imageUrl: string | null;
  attribution?: string;
  source: 'unsplash' | 'wikimedia' | 'none';
}

// AI-generated negative prompts AND face/people keywords to remove
const NOISE_PHRASES = [
  'no people',
  'no faces',
  'no humans',
  'without people',
  // Actively filter out face/people terms to ensure KDP compliance
  'person',
  'people',
  'man',
  'woman',
  'face',
  'portrait',
  'crowd',
  'selfie',
  'human',
  'model',
];

// Clean the query by removing AI-specific phrases AND face/people terms
function cleanQuery(rawQuery: string): string {
  let cleaned = rawQuery.toLowerCase();
  
  // Remove noise phrases and face/people keywords
  for (const phrase of NOISE_PHRASES) {
    // Match whole words only to avoid "woman" matching "snowman" etc.
    cleaned = cleaned.replace(new RegExp(`\\b${phrase}s?\\b`, 'gi'), '');
  }
  
  // Remove extra whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  console.log(`[QueryCleaner] "${rawQuery}" -> "${cleaned}"`);
  return cleaned;
}

// Generate fallback queries by progressively simplifying
function generateFallbackQueries(query: string): string[] {
  const words = query.split(' ').filter(w => w.length > 2);
  const fallbacks: string[] = [];
  
  // Try first 3 words
  if (words.length > 3) {
    fallbacks.push(words.slice(0, 3).join(' '));
  }
  
  // Try first 2 words
  if (words.length > 2) {
    fallbacks.push(words.slice(0, 2).join(' '));
  }
  
  // Try just the first word if it's meaningful
  if (words.length > 1 && words[0].length > 3) {
    fallbacks.push(words[0]);
  }
  
  console.log(`[FallbackQueries] Generated ${fallbacks.length} fallbacks:`, fallbacks);
  return fallbacks;
}

// Attempt 1: Unsplash - The "Luxury" Layer
// excludeUrls: list of already-used image URLs to skip (deduplication)
async function searchUnsplash(
  query: string, 
  orientation: 'landscape' | 'portrait' = 'landscape',
  excludeUrls: Set<string> = new Set()
): Promise<ImageResult | null> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) {
    console.log('[Unsplash] No API key configured');
    return null;
  }

  try {
    // Request multiple results so we can deduplicate
    const params = new URLSearchParams({
      query: query,
      orientation: orientation,
      per_page: '10',
    });

    const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
      },
    });

    if (!response.ok) {
      console.error('[Unsplash] API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      // Find first result that isn't in excludeUrls
      for (const photo of data.results) {
        const imageUrl = photo.urls?.regular || photo.urls?.full;
        if (!imageUrl) continue;
        
        // Check if this URL is already used (dedupe)
        if (excludeUrls.has(imageUrl)) {
          console.log('[Unsplash] Skipping duplicate:', imageUrl.substring(0, 60));
          continue;
        }
        
        console.log('[Unsplash] Found unique image:', imageUrl.substring(0, 60));
        return { imageUrl, source: 'unsplash' };
      }
      
      console.log('[Unsplash] All results were duplicates');
      return null;
    }

    console.log('[Unsplash] No results for query:', query);
    return null;
  } catch (error) {
    console.error('[Unsplash] Fetch error:', error);
    return null;
  }
}

// Try Unsplash with fallback queries + deduplication
async function searchUnsplashWithFallbacks(
  query: string, 
  orientation: 'landscape' | 'portrait' = 'landscape',
  excludeUrls: Set<string> = new Set()
): Promise<ImageResult | null> {
  // Try the main query first
  let result = await searchUnsplash(query, orientation, excludeUrls);
  if (result) return result;

  // Try fallback queries
  const fallbacks = generateFallbackQueries(query);
  for (const fallbackQuery of fallbacks) {
    console.log(`[Unsplash] Trying fallback: "${fallbackQuery}"`);
    result = await searchUnsplash(fallbackQuery, orientation, excludeUrls);
    if (result) return result;
  }

  return null;
}

// Attempt 2: Wikimedia Commons - The "Fact" Layer
async function searchWikimedia(query: string): Promise<ImageResult | null> {
  try {
    // Step 1: Search for images
    const searchParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6', // File namespace
      gsrsearch: `${query} filetype:jpg OR filetype:png`,
      gsrlimit: '5',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      iiurlwidth: '1200',
    });

    const searchUrl = `https://commons.wikimedia.org/w/api.php?${searchParams}`;
    console.log('[Wikimedia] Searching:', query);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'LovableBookGenerator/1.0 (https://lovable.dev; contact@lovable.dev)',
      },
    });

    if (!response.ok) {
      console.error('[Wikimedia] API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (!data.query?.pages) {
      console.log('[Wikimedia] No results for query:', query);
      return null;
    }

    // Find the best image (prefer larger, landscape images)
    const pages = Object.values(data.query.pages) as any[];
    
    for (const page of pages) {
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo) continue;

      // Skip small images
      if (imageInfo.width < 800 || imageInfo.height < 600) continue;

      const imageUrl = imageInfo.thumburl || imageInfo.url;
      const metadata = imageInfo.extmetadata || {};

      // Extract attribution info
      const artist = metadata.Artist?.value?.replace(/<[^>]*>/g, '').trim() || 'Unknown';
      const license = metadata.LicenseShortName?.value || metadata.License?.value || 'CC';
      
      // Format clean attribution
      const attribution = `Photo: ${artist} / ${license}`;

      console.log('[Wikimedia] Found image:', imageUrl, 'Attribution:', attribution);

      return {
        imageUrl,
        attribution,
        source: 'wikimedia',
      };
    }

    console.log('[Wikimedia] No suitable images found');
    return null;
  } catch (error) {
    console.error('[Wikimedia] Fetch error:', error);
    return null;
  }
}

// Try Wikimedia with fallback queries
async function searchWikimediaWithFallbacks(query: string): Promise<ImageResult | null> {
  // Try the main query first
  let result = await searchWikimedia(query);
  if (result) return result;

  // Try fallback queries
  const fallbacks = generateFallbackQueries(query);
  for (const fallbackQuery of fallbacks) {
    console.log(`[Wikimedia] Trying fallback: "${fallbackQuery}"`);
    result = await searchWikimedia(fallbackQuery);
    if (result) return result;
  }

  return null;
}

// Extract location/topic for grounding searches
function extractTopicAnchor(topic: string | undefined): string | null {
  if (!topic) return null;
  
  // Common patterns to extract location from book titles
  // "London Travel Guide" → "London"
  // "A Comprehensive Guide to Paris" → "Paris"
  // "Exploring Tokyo: A Culinary Journey" → "Tokyo"
  // "aspen luxury travel guide" → "Aspen"
  
  const lowerTopic = topic.toLowerCase();
  
  // Skip generic words
  const skipWords = ['the', 'a', 'an', 'guide', 'to', 'of', 'comprehensive', 'ultimate', 'complete', 'exploring', 'travel', 'luxury', 'best', 'top'];
  
  // Split and find first meaningful word (likely the location/subject)
  const words = topic.split(/[\s:,\-]+/).filter(w => w.length > 2);
  
  for (const word of words) {
    if (!skipWords.includes(word.toLowerCase())) {
      // Capitalize first letter for proper noun treatment
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }
  
  return null;
}

// Anchor the query to the book's topic for geographic/topical relevance
function anchorQueryToTopic(query: string, topic: string | undefined): string {
  const anchor = extractTopicAnchor(topic);
  if (!anchor) return query;
  
  // Check if query already contains the anchor (case-insensitive)
  if (query.toLowerCase().includes(anchor.toLowerCase())) {
    return query;
  }
  
  // Prepend the anchor to ground the search
  console.log(`[TopicAnchor] Grounding query with "${anchor}": "${anchor} ${query}"`);
  return `${anchor} ${query}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, orientation = 'landscape', excludeUrls = [], bookTopic } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fetch-book-images] Raw query: "${query}", Orientation: ${orientation}, Exclude: ${excludeUrls.length} URLs, Topic: "${bookTopic || 'none'}"`);

    // Build exclusion set for deduplication
    const excludeSet = new Set<string>(excludeUrls);

    // STEP 1: Clean the query by removing AI noise phrases AND face/people keywords
    const cleanedQuery = cleanQuery(query);
    
    if (!cleanedQuery || cleanedQuery.length < 2) {
      console.log('[fetch-book-images] Query too short after cleaning, returning null');
      return new Response(
        JSON.stringify({ 
          imageUrl: null,
          source: 'none',
          message: 'Query too short after cleaning'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // STEP 1.5: Anchor the query to the book's topic for relevance
    const anchoredQuery = anchorQueryToTopic(cleanedQuery, bookTopic);

    // STEP 2: Try Unsplash with fallbacks + deduplication (using anchored query)
    let result = await searchUnsplashWithFallbacks(anchoredQuery, orientation, excludeSet);

    // STEP 3: Retry with "wallpaper" suffix if first attempt failed
    if (!result) {
      const wallpaperQuery = `${anchoredQuery} wallpaper`;
      console.log(`[fetch-book-images] First attempt failed, trying with wallpaper: "${wallpaperQuery}"`);
      result = await searchUnsplashWithFallbacks(wallpaperQuery, orientation, excludeSet);
    }

    // STEP 4: Retry with just first 2 words if wallpaper also failed
    if (!result) {
      const words = anchoredQuery.split(' ').filter(w => w.length > 2);
      if (words.length >= 2) {
        const twoWordQuery = words.slice(0, 2).join(' ');
        console.log(`[fetch-book-images] Wallpaper failed, trying first 2 words: "${twoWordQuery}"`);
        result = await searchUnsplashWithFallbacks(twoWordQuery, orientation, excludeSet);
      }
    }

    // STEP 5: Try Wikimedia with fallbacks as last resort (use anchored query)
    if (!result) {
      console.log('[fetch-book-images] Unsplash exhausted, trying Wikimedia...');
      result = await searchWikimediaWithFallbacks(anchoredQuery);
    }

    // STEP 6: Return gracefully even if no images found (NO 404!)
    if (!result) {
      console.log('[fetch-book-images] No images found from any source, returning null gracefully');
      return new Response(
        JSON.stringify({ 
          imageUrl: null,
          source: 'none',
          query: cleanedQuery,
          message: 'No images found after exhaustive search'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fetch-book-images] Success from ${result.source}:`, result.imageUrl?.substring(0, 60));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[fetch-book-images] Error:', errorMessage);
    
    // Even on error, return 200 with null to prevent frontend crashes
    return new Response(
      JSON.stringify({ 
        imageUrl: null, 
        source: 'none',
        error: errorMessage 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
