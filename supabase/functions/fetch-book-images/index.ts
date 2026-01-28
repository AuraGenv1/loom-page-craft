import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageResult {
  imageUrl: string | null;
  attribution: string;
  source: 'unsplash' | 'pexels' | 'pixabay' | 'wikimedia' | 'none';
}

// ==== BUSINESS RULE 2: Universal Credit Format ====
// Always return "Photo by [Name] via [Source]" or "Source: [Source]" as fallback
function formatAttribution(photographerName: string | null, source: string): string {
  if (photographerName && photographerName !== 'Unknown' && photographerName.trim()) {
    return `Photo by ${photographerName} via ${source}`;
  }
  return `Source: ${source}`;
}

function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

// AI-generated negative prompts AND face/people keywords to remove
const NOISE_PHRASES = [
  'no people',
  'no faces',
  'no humans',
  'without people',
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

function cleanQuery(rawQuery: string): string {
  let cleaned = rawQuery.toLowerCase();
  
  for (const phrase of NOISE_PHRASES) {
    cleaned = cleaned.replace(new RegExp(`\\b${phrase}s?\\b`, 'gi'), '');
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  console.log(`[QueryCleaner] "${rawQuery}" -> "${cleaned}"`);
  return cleaned;
}

const GENERIC_TOKENS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'at', 'to', 'for',
  'aspen', 'colorado', 'hotel', 'resort', 'restaurant', 'tavern', 'bistro',
  'mountain', 'landscape', 'scenic', 'view', 'views',
  'architecture', 'architectural', 'building', 'exterior', 'interior',
  'downtown', 'street', 'patio', 'lobby', 'room',
  'luxury', 'travel', 'guide', 'beautiful', 'elegant',
]);

function extractSignificantTokens(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => t.length >= 4)
    .filter(t => !GENERIC_TOKENS.has(t));

  return [...new Set(tokens)].slice(0, 6);
}

function generateFallbackQueries(query: string): string[] {
  const words = query.split(' ').filter(w => w.length > 2);
  const fallbacks: string[] = [];
  
  if (words.length > 3) {
    fallbacks.push(words.slice(0, 3).join(' '));
  }
  
  if (words.length > 2) {
    fallbacks.push(words.slice(0, 2).join(' '));
  }
  
  if (words.length > 1 && words[0].length > 3) {
    fallbacks.push(words[0]);
  }
  
  console.log(`[FallbackQueries] Generated ${fallbacks.length} fallbacks:`, fallbacks);
  return fallbacks;
}

// ==== BUSINESS RULE 3: Wikipedia Quality Control - 1800px minimum ====
const KDP_MIN_WIDTH = 1600;
const KDP_PREFERRED_WIDTH = 1800; // Wikipedia MUST be at least this

// ==== WATERFALL STEP 1: Unsplash (Primary) ====
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
    const significantTokens = extractSignificantTokens(query);
    const shouldFilterByTokens = significantTokens.length > 0;

    const params = new URLSearchParams({
      query: query,
      orientation: orientation,
      per_page: '20',
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
      for (const photo of data.results) {
        const width = photo.width || 0;
        if (width < KDP_MIN_WIDTH) {
          console.log(`[Unsplash] Skipping low-res image (${width}px):`, photo.id);
          continue;
        }

        let imageUrl = photo.urls?.raw;
        if (imageUrl) {
          imageUrl = `${imageUrl}&w=2000&q=80&fm=jpg`;
        } else {
          imageUrl = photo.urls?.full || photo.urls?.regular;
        }
        if (!imageUrl) continue;

        if (shouldFilterByTokens) {
          const haystack = `${photo.alt_description || ''} ${photo.description || ''} ${photo.slug || ''}`
            .toLowerCase();
          const matched = significantTokens.some(t => haystack.includes(t));
          if (!matched) {
            continue;
          }
        }
        
        const candidateKey = normalizeUrlForCompare(imageUrl);
        if (excludeUrls.has(candidateKey) || excludeUrls.has(imageUrl)) {
          console.log('[Unsplash] Skipping duplicate:', imageUrl.substring(0, 60));
          continue;
        }
        
        // RULE 2: Universal Credit
        const photographerName = photo.user?.name || photo.user?.username || null;
        const attribution = formatAttribution(photographerName, 'Unsplash');
        
        console.log(`[Unsplash] Found high-res image (${width}px):`, imageUrl.substring(0, 80));
        return { imageUrl, attribution, source: 'unsplash' };
      }
      
      console.log('[Unsplash] All results were duplicates or too low-res');
      return null;
    }

    console.log('[Unsplash] No results for query:', query);
    return null;
  } catch (error) {
    console.error('[Unsplash] Fetch error:', error);
    return null;
  }
}

// ==== WATERFALL STEP 2: Pixabay (First Fallback) ====
async function searchPixabay(
  query: string,
  orientation: 'landscape' | 'portrait' = 'landscape',
  excludeUrls: Set<string> = new Set()
): Promise<ImageResult | null> {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) {
    console.log('[Pixabay] No API key configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: 'photo',
      orientation: orientation === 'landscape' ? 'horizontal' : 'vertical',
      min_width: String(KDP_MIN_WIDTH),
      per_page: '50',
      safesearch: 'true',
    });

    const response = await fetch(`https://pixabay.com/api/?${params}`);

    if (!response.ok) {
      console.error('[Pixabay] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const hits: any[] = data?.hits || [];
    
    if (hits.length === 0) {
      console.log('[Pixabay] No results for query:', query);
      return null;
    }

    for (const photo of hits) {
      const width = photo.imageWidth || 0;
      if (width < KDP_MIN_WIDTH) {
        continue;
      }

      const imageUrl = photo.largeImageURL || photo.webformatURL;
      if (!imageUrl) continue;

      const candidateKey = normalizeUrlForCompare(imageUrl);
      if (excludeUrls.has(candidateKey) || excludeUrls.has(imageUrl)) {
        continue;
      }

      // RULE 2: Universal Credit
      const photographerName = photo.user || null;
      const attribution = formatAttribution(photographerName, 'Pixabay');
      
      console.log(`[Pixabay] Found high-res image (${width}px):`, imageUrl.substring(0, 60));
      return { imageUrl, attribution, source: 'pixabay' };
    }

    console.log('[Pixabay] All results were duplicates or too low-res');
    return null;
  } catch (error) {
    console.error('[Pixabay] Fetch error:', error);
    return null;
  }
}

// ==== WATERFALL STEP 3: Pexels (Second Fallback) ====
async function searchPexels(
  query: string,
  orientation: 'landscape' | 'portrait' = 'landscape',
  excludeUrls: Set<string> = new Set()
): Promise<ImageResult | null> {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) {
    console.log('[Pexels] No API key configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      query,
      per_page: '30',
      orientation,
    });

    const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      console.error('[Pexels] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const photos: any[] = data?.photos || [];
    if (photos.length === 0) {
      console.log('[Pexels] No results for query:', query);
      return null;
    }

    for (const photo of photos) {
      const width = photo.width || 0;
      if (width < KDP_MIN_WIDTH) {
        console.log(`[Pexels] Skipping low-res image (${width}px):`, photo.id);
        continue;
      }

      const imageUrl = photo?.src?.original || photo?.src?.large2x;
      if (!imageUrl) continue;

      const candidateKey = normalizeUrlForCompare(imageUrl);
      if (excludeUrls.has(candidateKey) || excludeUrls.has(imageUrl)) {
        continue;
      }

      // RULE 2: Universal Credit
      const photographerName = photo.photographer || null;
      const attribution = formatAttribution(photographerName, 'Pexels');
      
      console.log(`[Pexels] Found high-res image (${width}px):`, imageUrl.substring(0, 60));
      return { imageUrl, attribution, source: 'pexels' };
    }

    console.log('[Pexels] All results were duplicates or too low-res');
    return null;
  } catch (error) {
    console.error('[Pexels] Fetch error:', error);
    return null;
  }
}

// ==== WATERFALL STEP 4: Wikimedia (For Landmarks - STRICT 1800px+) ====
async function searchWikimedia(query: string): Promise<ImageResult | null> {
  try {
    const searchParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: query,
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      origin: '*',
    });

    const searchUrl = `https://commons.wikimedia.org/w/api.php?${searchParams}`;
    console.log('[Wikimedia] Searching (strict 1800px+ for landmarks):', query);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'LoomPageBookGenerator/1.0 (https://loom-page-craft.lovable.app; contact@lovable.dev)',
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

    const pages = Object.values(data.query.pages) as any[];
    
    for (const page of pages) {
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo) continue;

      const width = imageInfo.width || 0;
      const height = imageInfo.height || 0;

      // RULE 3: Wikipedia Quality Control - STRICT 1800px minimum
      if (width < KDP_PREFERRED_WIDTH) {
        console.log(`[Wikimedia] Skipping low-res image (${width}px < 1800px required):`, page.title);
        continue;
      }

      // Skip non-landscape images
      if (height > width) {
        console.log(`[Wikimedia] Skipping portrait image:`, page.title);
        continue;
      }

      const imageUrl = imageInfo.url;
      if (!imageUrl) continue;

      const metadata = imageInfo.extmetadata || {};

      // RULE 2: Universal Credit
      const artist = metadata.Artist?.value?.replace(/<[^>]*>/g, '').trim() || null;
      const license = metadata.LicenseShortName?.value || metadata.License?.value || 'CC';
      const attribution = artist 
        ? `Photo by ${artist} via Wikimedia (${license})`
        : `Source: Wikimedia Commons (${license})`;

      console.log(`[Wikimedia] Found high-res image (${width}x${height}px):`, imageUrl.substring(0, 80));

      return { imageUrl, attribution, source: 'wikimedia' };
    }

    console.log('[Wikimedia] No suitable high-res images found (all below 1800px)');
    return null;
  } catch (error) {
    console.error('[Wikimedia] Fetch error:', error);
    return null;
  }
}

// Waterfall search with fallbacks
async function searchWithFallbacks(
  searchFn: (query: string, orientation: 'landscape' | 'portrait', excludeUrls: Set<string>) => Promise<ImageResult | null>,
  sourceName: string,
  query: string, 
  orientation: 'landscape' | 'portrait' = 'landscape',
  excludeUrls: Set<string> = new Set()
): Promise<ImageResult | null> {
  const lockTokens = extractSignificantTokens(query);

  // Try the main query first
  let result = await searchFn(query, orientation, excludeUrls);
  if (result) return result;

  // Try fallback queries
  const fallbacks = generateFallbackQueries(query).filter((fallbackQuery: string) => {
    if (lockTokens.length === 0) return true;
    const lower = fallbackQuery.toLowerCase();
    return lockTokens.some((t) => lower.includes(t));
  });
  
  for (const fallbackQuery of fallbacks) {
    console.log(`[${sourceName}] Trying fallback: "${fallbackQuery}"`);
    result = await searchFn(fallbackQuery, orientation, excludeUrls);
    if (result) return result;
  }

  return null;
}

// Wikimedia with fallbacks (no excludeUrls param)
async function searchWikimediaWithFallbacks(query: string): Promise<ImageResult | null> {
  const lockTokens = extractSignificantTokens(query);

  let result = await searchWikimedia(query);
  if (result) return result;

  const fallbacks = generateFallbackQueries(query).filter((fallbackQuery: string) => {
    if (lockTokens.length === 0) return true;
    const lower = fallbackQuery.toLowerCase();
    return lockTokens.some((t) => lower.includes(t));
  });
  
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
  
  const skipWords = ['the', 'a', 'an', 'guide', 'to', 'of', 'comprehensive', 'ultimate', 'complete', 'exploring', 'travel', 'luxury', 'best', 'top'];
  
  const words = topic.split(/[\s:,\-]+/).filter(w => w.length > 2);
  
  for (const word of words) {
    if (!skipWords.includes(word.toLowerCase())) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }
  
  return null;
}

// Anchor the query to the book's topic
function anchorQueryToTopic(query: string, topic: string | undefined): string {
  const anchor = extractTopicAnchor(topic);
  if (!anchor) return query;

  if (query.toLowerCase().startsWith(anchor.toLowerCase())) {
    return query;
  }

  console.log(`[TopicAnchor] Grounding query with "${anchor}": "${anchor} ${query}"`);
  return `${anchor} ${query}`;
}

// Detect if query is for a specific landmark/hotel (for Wikipedia priority)
function isLandmarkQuery(query: string): boolean {
  const landmarkPatterns = [
    /\b(hotel|inn|resort|lodge)\b/i,
    /\b(museum|gallery|palace|castle|cathedral|church|temple|shrine)\b/i,
    /\b(tower|bridge|monument|statue|memorial)\b/i,
    /\b(park|garden|square|plaza)\b/i,
  ];
  return landmarkPatterns.some(pattern => pattern.test(query));
}

serve(async (req) => {
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

    const excludeSet = new Set<string>((excludeUrls || []).map((u: string) => normalizeUrlForCompare(u)));

    // STEP 1: Clean the query
    const cleanedQuery = cleanQuery(query);
    
    if (!cleanedQuery || cleanedQuery.length < 2) {
      console.log('[fetch-book-images] Query too short after cleaning, returning null');
      return new Response(
        JSON.stringify({ 
          imageUrl: null,
          attribution: '',
          source: 'none',
          message: 'Query too short after cleaning'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // STEP 2: Anchor to topic
    const anchoredQuery = anchorQueryToTopic(cleanedQuery, bookTopic);

    let result: ImageResult | null = null;

    // ==== BUSINESS RULE 1: WATERFALL SEARCH ORDER ====
    // For landmarks, try Wikipedia first (only if 1800px+), then fall through
    const isLandmark = isLandmarkQuery(anchoredQuery);
    
    if (isLandmark) {
      console.log('[fetch-book-images] Landmark detected, trying Wikipedia first...');
      result = await searchWikimediaWithFallbacks(anchoredQuery);
      if (result) {
        console.log('[fetch-book-images] Wikipedia found high-res landmark image');
      }
    }

    // WATERFALL STEP 1: Unsplash
    if (!result) {
      console.log('[fetch-book-images] Trying Unsplash...');
      result = await searchWithFallbacks(searchUnsplash, 'Unsplash', anchoredQuery, orientation, excludeSet);
    }

    // WATERFALL STEP 2: Pixabay (first fallback)
    if (!result) {
      console.log('[fetch-book-images] Unsplash exhausted, trying Pixabay...');
      result = await searchWithFallbacks(searchPixabay, 'Pixabay', anchoredQuery, orientation, excludeSet);
    }

    // WATERFALL STEP 3: Pexels (second fallback)
    if (!result) {
      console.log('[fetch-book-images] Pixabay exhausted, trying Pexels...');
      result = await searchWithFallbacks(searchPexels, 'Pexels', anchoredQuery, orientation, excludeSet);
    }

    // WATERFALL STEP 4: Wikimedia (final fallback for non-landmarks)
    if (!result && !isLandmark) {
      console.log('[fetch-book-images] All paid sources exhausted, trying Wikimedia...');
      result = await searchWikimediaWithFallbacks(anchoredQuery);
    }

    // EMERGENCY FALLBACK: Broad topic search
    if (!result) {
      const anchor = extractTopicAnchor(bookTopic);
      if (anchor) {
        const broad = `${anchor} landscape`;
        console.log(`[fetch-book-images] Emergency fallback with broad query: "${broad}"`);
        result = 
          await searchWithFallbacks(searchUnsplash, 'Unsplash', broad, orientation, excludeSet) ||
          await searchWithFallbacks(searchPixabay, 'Pixabay', broad, orientation, excludeSet) ||
          await searchWithFallbacks(searchPexels, 'Pexels', broad, orientation, excludeSet) ||
          await searchWikimediaWithFallbacks(broad);
      }
    }

    // Return gracefully even if no images found
    if (!result) {
      console.log('[fetch-book-images] No images found from any source, returning null gracefully');
      return new Response(
        JSON.stringify({ 
          imageUrl: null,
          attribution: '',
          source: 'none',
          query: cleanedQuery,
          message: 'No images found after exhaustive waterfall search'
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
    
    return new Response(
      JSON.stringify({ 
        imageUrl: null, 
        attribution: '',
        source: 'none',
        error: errorMessage 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
