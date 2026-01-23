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

// AI-generated negative prompts and style keywords to remove
const NOISE_PHRASES = [
  'no people',
  'no faces',
  'no humans',
  'without people',
  'atmospheric',
  'architectural detail',
  'photorealistic',
  'ultra high resolution',
  'high quality',
  'professional photo',
  'stock photo',
  'editorial',
  'cinematic',
  'dramatic lighting',
  'moody',
  'vibrant colors',
  'texture',
  'macro',
  'close up',
  'detailed',
];

// Clean the query by removing AI-specific phrases
function cleanQuery(rawQuery: string): string {
  let cleaned = rawQuery.toLowerCase();
  
  // Remove noise phrases
  for (const phrase of NOISE_PHRASES) {
    cleaned = cleaned.replace(new RegExp(phrase, 'gi'), '');
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
async function searchUnsplash(query: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<ImageResult | null> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) {
    console.log('[Unsplash] No API key configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      query: query,
      orientation: orientation,
      per_page: '1',
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
      const photo = data.results[0];
      // Use regular size for book images (1080px wide)
      const imageUrl = photo.urls?.regular || photo.urls?.full;
      
      console.log('[Unsplash] Found image:', imageUrl);
      
      // Unsplash doesn't require attribution in the book per their license
      return {
        imageUrl,
        source: 'unsplash',
      };
    }

    console.log('[Unsplash] No results for query:', query);
    return null;
  } catch (error) {
    console.error('[Unsplash] Fetch error:', error);
    return null;
  }
}

// Try Unsplash with fallback queries
async function searchUnsplashWithFallbacks(query: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<ImageResult | null> {
  // Try the main query first
  let result = await searchUnsplash(query, orientation);
  if (result) return result;

  // Try fallback queries
  const fallbacks = generateFallbackQueries(query);
  for (const fallbackQuery of fallbacks) {
    console.log(`[Unsplash] Trying fallback: "${fallbackQuery}"`);
    result = await searchUnsplash(fallbackQuery, orientation);
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, orientation = 'landscape' } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fetch-book-images] Raw query: "${query}", Orientation: ${orientation}`);

    // STEP 1: Clean the query by removing AI noise phrases
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

    // STEP 2: Try Unsplash with fallbacks
    let result = await searchUnsplashWithFallbacks(cleanedQuery, orientation);

    // STEP 3: Try Wikimedia with fallbacks
    if (!result) {
      console.log('[fetch-book-images] Unsplash failed, trying Wikimedia...');
      result = await searchWikimediaWithFallbacks(cleanedQuery);
    }

    // STEP 4: Return gracefully even if no images found (NO 404!)
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

    console.log(`[fetch-book-images] Success from ${result.source}:`, result.imageUrl);

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
