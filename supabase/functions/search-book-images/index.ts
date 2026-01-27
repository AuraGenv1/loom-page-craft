import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum width for KDP print quality (hidden filter)
const MIN_WIDTH_FILTER = 1200;
// Width threshold for "Print Ready" badge
const PRINT_READY_WIDTH = 1800;

interface ImageResult {
  imageUrl: string;        // Full/Regular resolution for database
  thumbnailUrl: string;    // Small version for preview
  attribution?: string;
  source: 'unsplash' | 'wikimedia';
  id: string;
  width: number;           // Image width for quality filtering
  height: number;          // Image height
  isPrintReady: boolean;   // True if width >= 1800px
}

// AI-generated negative prompts to remove
const NOISE_PHRASES = [
  'no people',
  'no faces',
  'no humans',
  'without people',
];

function cleanQuery(rawQuery: string): string {
  let cleaned = rawQuery.toLowerCase();
  for (const phrase of NOISE_PHRASES) {
    cleaned = cleaned.replace(new RegExp(phrase, 'gi'), '');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  console.log(`[QueryCleaner] "${rawQuery}" -> "${cleaned}"`);
  return cleaned;
}

// Search Unsplash and return multiple results (max 30 per request)
async function searchUnsplashMultiple(
  query: string, 
  orientation: 'landscape' | 'portrait' = 'landscape',
  perPage: number = 30,
  page: number = 1
): Promise<ImageResult[]> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) {
    console.log('[Unsplash] No API key configured');
    return [];
  }

  try {
    const params = new URLSearchParams({
      query: query,
      orientation: orientation,
      per_page: String(Math.min(perPage, 30)), // Unsplash max is 30
      page: String(page),
    });

    const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
      },
    });

    if (!response.ok) {
      console.error('[Unsplash] API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log('[Unsplash] No results for query:', query);
      return [];
    }

    const results: ImageResult[] = [];
    
    for (const photo of data.results) {
      const width = photo.width || 0;
      const height = photo.height || 0;
      
      // HIDDEN FILTER: Skip images below minimum print quality
      if (width < MIN_WIDTH_FILTER) {
        continue;
      }
      
      results.push({
        id: `unsplash-${photo.id}`,
        // IMPORTANT: Use 'regular' or 'full' for database storage (high-res)
        imageUrl: photo.urls?.regular || photo.urls?.full,
        // Use 'small' for thumbnail preview only
        thumbnailUrl: photo.urls?.small || photo.urls?.thumb,
        source: 'unsplash' as const,
        width,
        height,
        isPrintReady: width >= PRINT_READY_WIDTH,
      });
    }

    console.log(`[Unsplash] Found ${results.length} high-res images for query (page ${page}, filtered from ${data.results.length}):`, query);
    return results;
  } catch (error) {
    console.error('[Unsplash] Fetch error:', error);
    return [];
  }
}

// Search Wikimedia Commons and return multiple results
async function searchWikimediaMultiple(query: string, limit: number = 20): Promise<ImageResult[]> {
  try {
    // Use simpler search without filetype (filetype: syntax not supported in gsrsearch)
    const searchParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6', // File namespace
      gsrsearch: query, // Plain query without filetype syntax
      gsrlimit: String(Math.min(limit, 50)), // Wikimedia allows up to 50
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: '1200',
      origin: '*',
    });

    const searchUrl = `https://commons.wikimedia.org/w/api.php?${searchParams}`;
    console.log('[Wikimedia] Searching:', query, 'URL:', searchUrl);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'LoomPageBookGenerator/1.0 (https://loom-page-craft.lovable.app; contact@lovable.dev) Deno/1.0',
      },
    });

    if (!response.ok) {
      console.error('[Wikimedia] API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    console.log('[Wikimedia] Raw response pages count:', data.query?.pages ? Object.keys(data.query.pages).length : 0);
    
    if (!data.query?.pages) {
      console.log('[Wikimedia] No results for query:', query);
      return [];
    }

    const results: ImageResult[] = [];
    const pages = Object.values(data.query.pages) as any[];
    
    for (const page of pages) {
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo) continue;
      
      // Filter only image types
      const mime = imageInfo.mime || '';
      if (!mime.startsWith('image/')) continue;
      
      const width = imageInfo.width || 0;
      const height = imageInfo.height || 0;
      
      // HIDDEN FILTER: Skip images below minimum print quality (1200px)
      if (width < MIN_WIDTH_FILTER) continue;

      const metadata = imageInfo.extmetadata || {};
      const artist = metadata.Artist?.value?.replace(/<[^>]*>/g, '').trim() || 'Unknown';
      const license = metadata.LicenseShortName?.value || metadata.License?.value || 'CC';
      
      results.push({
        id: `wikimedia-${page.pageid}`,
        // Use the ORIGINAL URL for high-res (not thumburl)
        imageUrl: imageInfo.url || imageInfo.thumburl,
        thumbnailUrl: imageInfo.thumburl || imageInfo.url,
        attribution: `${artist} / ${license}`,
        source: 'wikimedia',
        width,
        height,
        isPrintReady: width >= PRINT_READY_WIDTH,
      });
    }

    console.log(`[Wikimedia] Found ${results.length} high-res images for query:`, query);
    return results;
  } catch (error) {
    console.error('[Wikimedia] Fetch error:', error);
    return [];
  }
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

// Anchor the query to the book's topic for geographic/topical relevance
function anchorQueryToTopic(query: string, topic: string | undefined): string {
  const anchor = extractTopicAnchor(topic);
  if (!anchor) return query;
  
  if (query.toLowerCase().includes(anchor.toLowerCase())) {
    return query;
  }
  
  console.log(`[TopicAnchor] Grounding query with "${anchor}": "${anchor} ${query}"`);
  return `${anchor} ${query}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, orientation = 'landscape', limit = 100, bookTopic } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[search-book-images] Query: "${query}", Orientation: ${orientation}, Limit: ${limit}, Topic: "${bookTopic || 'none'}"`);

    const cleanedQuery = cleanQuery(query);
    
    if (!cleanedQuery || cleanedQuery.length < 2) {
      return new Response(
        JSON.stringify({ images: [], message: 'Query too short after cleaning' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Anchor the query to the book's topic for relevance
    const anchoredQuery = anchorQueryToTopic(cleanedQuery, bookTopic);

    // Search both sources in parallel - get more results from each (using anchored query)
    // Unsplash: 3 pages of 30 = 90 results max (before filtering)
    // Wikimedia: 50 results (before filtering)
    const [unsplashPage1, unsplashPage2, unsplashPage3, wikimediaResults] = await Promise.all([
      searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
      searchUnsplashMultiple(anchoredQuery, orientation, 30, 2),
      searchUnsplashMultiple(anchoredQuery, orientation, 30, 3),
      searchWikimediaMultiple(anchoredQuery, 50),
    ]);

    // Combine results, prioritizing Unsplash but interleaving for variety
    const unsplashResults = [...unsplashPage1, ...unsplashPage2, ...unsplashPage3];
    
    // Interleave: 3 Unsplash, 1 Wikimedia pattern for variety
    const allResults: ImageResult[] = [];
    let uIdx = 0, wIdx = 0;
    while (allResults.length < limit && (uIdx < unsplashResults.length || wIdx < wikimediaResults.length)) {
      // Add up to 3 Unsplash
      for (let i = 0; i < 3 && uIdx < unsplashResults.length && allResults.length < limit; i++) {
        allResults.push(unsplashResults[uIdx++]);
      }
      // Add 1 Wikimedia
      if (wIdx < wikimediaResults.length && allResults.length < limit) {
        allResults.push(wikimediaResults[wIdx++]);
      }
    }

    // Count print-ready images
    const printReadyCount = allResults.filter(img => img.isPrintReady).length;

    console.log(`[search-book-images] Total results: ${allResults.length} (Unsplash: ${unsplashResults.length}, Wikimedia: ${wikimediaResults.length}, Print-Ready: ${printReadyCount})`);

    return new Response(
      JSON.stringify({ 
        images: allResults,
        query: cleanedQuery,
        sources: {
          unsplash: unsplashResults.length,
          wikimedia: wikimediaResults.length,
        },
        printReadyCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[search-book-images] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ images: [], error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
