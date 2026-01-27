import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageResult {
  imageUrl: string;
  thumbnailUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia';
  id: string;
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

// Search Unsplash and return multiple results
async function searchUnsplashMultiple(
  query: string, 
  orientation: 'landscape' | 'portrait' = 'landscape',
  perPage: number = 20
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
      per_page: String(perPage),
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

    const results: ImageResult[] = data.results.map((photo: any) => ({
      id: `unsplash-${photo.id}`,
      imageUrl: photo.urls?.regular || photo.urls?.full,
      thumbnailUrl: photo.urls?.small || photo.urls?.thumb,
      source: 'unsplash' as const,
    }));

    console.log(`[Unsplash] Found ${results.length} images for query:`, query);
    return results;
  } catch (error) {
    console.error('[Unsplash] Fetch error:', error);
    return [];
  }
}

// Search Wikimedia and return multiple results
async function searchWikimediaMultiple(query: string, limit: number = 10): Promise<ImageResult[]> {
  try {
    const searchParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${query} filetype:jpg OR filetype:png`,
      gsrlimit: String(limit),
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
      return [];
    }

    const data = await response.json();
    
    if (!data.query?.pages) {
      console.log('[Wikimedia] No results for query:', query);
      return [];
    }

    const results: ImageResult[] = [];
    const pages = Object.values(data.query.pages) as any[];
    
    for (const page of pages) {
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo) continue;
      if (imageInfo.width < 600 || imageInfo.height < 400) continue;

      const metadata = imageInfo.extmetadata || {};
      const artist = metadata.Artist?.value?.replace(/<[^>]*>/g, '').trim() || 'Unknown';
      const license = metadata.LicenseShortName?.value || metadata.License?.value || 'CC';
      
      results.push({
        id: `wikimedia-${page.pageid}`,
        imageUrl: imageInfo.thumburl || imageInfo.url,
        thumbnailUrl: imageInfo.thumburl || imageInfo.url,
        attribution: `Photo: ${artist} / ${license}`,
        source: 'wikimedia',
      });
    }

    console.log(`[Wikimedia] Found ${results.length} images for query:`, query);
    return results;
  } catch (error) {
    console.error('[Wikimedia] Fetch error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, orientation = 'landscape', limit = 30 } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[search-book-images] Query: "${query}", Orientation: ${orientation}, Limit: ${limit}`);

    const cleanedQuery = cleanQuery(query);
    
    if (!cleanedQuery || cleanedQuery.length < 2) {
      return new Response(
        JSON.stringify({ images: [], message: 'Query too short after cleaning' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search both sources in parallel
    const [unsplashResults, wikimediaResults] = await Promise.all([
      searchUnsplashMultiple(cleanedQuery, orientation, Math.min(limit, 20)),
      searchWikimediaMultiple(cleanedQuery, Math.min(limit, 10)),
    ]);

    // Combine results, prioritizing Unsplash
    const allResults = [...unsplashResults, ...wikimediaResults].slice(0, limit);

    console.log(`[search-book-images] Total results: ${allResults.length}`);

    return new Response(
      JSON.stringify({ 
        images: allResults,
        query: cleanedQuery,
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
