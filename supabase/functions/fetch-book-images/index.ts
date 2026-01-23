import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageResult {
  imageUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia';
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

    console.log(`[fetch-book-images] Query: "${query}", Orientation: ${orientation}`);

    // Attempt 1: Unsplash (The "Luxury" Layer)
    let result = await searchUnsplash(query, orientation);

    // Attempt 2: Wikimedia Commons (The "Fact" Layer)
    if (!result) {
      console.log('[fetch-book-images] Unsplash failed, trying Wikimedia...');
      result = await searchWikimedia(query);
    }

    if (!result) {
      console.log('[fetch-book-images] No images found from any source');
      return new Response(
        JSON.stringify({ 
          error: 'No images found',
          query 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
