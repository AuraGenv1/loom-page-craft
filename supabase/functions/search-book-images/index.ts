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
  source: 'unsplash' | 'wikimedia' | 'pexels' | 'pixabay';
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
// Now uses raw URL with high-res params for KDP print quality
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
      const errorText = await response.text();
      console.error('[Unsplash] API error:', response.status, errorText);
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
      
      // HIGH-RES: Use raw URL with explicit 2000px width and 80% quality for KDP
      let imageUrl = photo.urls?.raw;
      if (imageUrl) {
        imageUrl = `${imageUrl}&w=2000&q=80&fm=jpg`;
      } else {
        imageUrl = photo.urls?.full || photo.urls?.regular;
      }
      
      // Capture photographer name for attribution
      const photographerName = photo.user?.name || photo.user?.username || 'Unknown';
      
      results.push({
        id: `unsplash-${photo.id}`,
        imageUrl: imageUrl || photo.urls?.regular,
        thumbnailUrl: photo.urls?.small || photo.urls?.thumb,
        attribution: `Photo by ${photographerName} on Unsplash`,
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

// Search Pexels and return multiple results
async function searchPexelsMultiple(
  query: string,
  orientation: 'landscape' | 'portrait' = 'landscape',
  perPage: number = 30,
  page: number = 1
): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) {
    console.log('[Pexels] No API key configured');
    return [];
  }

  try {
    const params = new URLSearchParams({
      query: query,
      orientation: orientation,
      per_page: String(Math.min(perPage, 80)), // Pexels max is 80
      page: String(page),
    });

    const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      console.error('[Pexels] API error:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data.photos || data.photos.length === 0) {
      console.log('[Pexels] No results for query:', query);
      return [];
    }

    const results: ImageResult[] = [];

    for (const photo of data.photos) {
      const width = photo.width || 0;
      const height = photo.height || 0;

      // HIDDEN FILTER: Skip images below minimum print quality (1200px)
      if (width < MIN_WIDTH_FILTER) {
        continue;
      }

      // Pexels provides multiple sizes - use 'large2x' or 'original' for high-res
      const imageUrl = photo.src?.large2x || photo.src?.original || photo.src?.large;
      const thumbnailUrl = photo.src?.medium || photo.src?.small;

      if (!imageUrl) continue;

      results.push({
        id: `pexels-${photo.id}`,
        imageUrl,
        thumbnailUrl: thumbnailUrl || imageUrl,
        attribution: photo.photographer ? `Photo by ${photo.photographer} on Pexels` : 'Pexels',
        source: 'pexels' as const,
        width,
        height,
        isPrintReady: width >= PRINT_READY_WIDTH,
      });
    }

    console.log(`[Pexels] Found ${results.length} high-res images for query (page ${page}, filtered from ${data.photos.length}):`, query);
    return results;
  } catch (error) {
    console.error('[Pexels] Fetch error:', error);
    return [];
  }
}

// Licenses that are NOT safe for commercial cover use (require ShareAlike derivative distribution)
const UNSAFE_COVER_LICENSES = [
  'cc by-sa',
  'cc-by-sa',
  'sharealike',
  'sa',
  'gfdl', // GNU Free Documentation License - also requires ShareAlike-like terms
];

// Check if a license is safe for commercial cover use
function isCoverSafeLicense(license: string): boolean {
  const lowerLicense = license.toLowerCase();
  return !UNSAFE_COVER_LICENSES.some(unsafe => lowerLicense.includes(unsafe));
}

// Search Pixabay and return multiple results
async function searchPixabayMultiple(
  query: string,
  orientation: 'landscape' | 'portrait' = 'landscape',
  perPage: number = 40,
  page: number = 1
): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) {
    console.log('[Pixabay] No API key configured');
    return [];
  }

  try {
    // Pixabay orientation mapping
    const pixabayOrientation = orientation === 'portrait' ? 'vertical' : 'horizontal';
    
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      orientation: pixabayOrientation,
      per_page: String(Math.min(perPage, 200)), // Pixabay max is 200
      page: String(page),
      image_type: 'photo',
      safesearch: 'true',
    });

    const response = await fetch(`https://pixabay.com/api/?${params}`);

    if (!response.ok) {
      console.error('[Pixabay] API error:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data.hits || data.hits.length === 0) {
      console.log('[Pixabay] No results for query:', query);
      return [];
    }

    const results: ImageResult[] = [];

    for (const photo of data.hits) {
      // Pixabay: use imageWidth (original) for quality check, not webformatWidth (resized)
      const width = photo.imageWidth || 0;
      const height = photo.imageHeight || 0;

      // HIDDEN FILTER: Skip images below minimum print quality (1200px) based on ORIGINAL size
      if (width < MIN_WIDTH_FILTER) {
        continue;
      }

      // Use largeImageURL for high-res, webformatURL for thumbnail
      const imageUrl = photo.largeImageURL || photo.webformatURL;
      const thumbnailUrl = photo.webformatURL || photo.previewURL;

      if (!imageUrl) continue;

      results.push({
        id: `pixabay-${photo.id}`,
        imageUrl,
        thumbnailUrl: thumbnailUrl || imageUrl,
        attribution: photo.user ? `Photo by ${photo.user} on Pixabay` : 'Pixabay',
        source: 'pixabay' as const,
        width,
        height,
        isPrintReady: width >= PRINT_READY_WIDTH,
      });
    }

    console.log(`[Pixabay] Found ${results.length} high-res images for query (page ${page}, filtered from ${data.hits.length}):`, query);
    return results;
  } catch (error) {
    console.error('[Pixabay] Fetch error:', error);
    return [];
  }
}

// Search Wikimedia Commons and return multiple results
async function searchWikimediaMultiple(query: string, limit: number = 20, filterForCover: boolean = false): Promise<ImageResult[]> {
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
      
      // COVER LICENSE FILTER: Exclude CC BY-SA and similar ShareAlike licenses for covers
      if (filterForCover && !isCoverSafeLicense(license)) {
        console.log(`[Wikimedia] Skipping image with restrictive license for cover: ${license}`);
        continue;
      }
      
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

    console.log(`[Wikimedia] Found ${results.length} high-res images for query${filterForCover ? ' (cover-safe only)' : ''}:`, query);
    return results;
  } catch (error) {
    console.error('[Wikimedia] Fetch error:', error);
    return [];
  }
}

// SMART WIKIPEDIA SEARCH: Find the main image from a Wikipedia article
// This is for specific locations/landmarks (e.g., "The Ritz London", "Hotel Jerome")
// Returns the verified, official photo with proper licensing
async function searchWikipediaArticleImage(query: string, filterForCover: boolean = false): Promise<ImageResult | null> {
  try {
    console.log(`[WikipediaArticle] Searching for article: "${query}"`);
    
    // Step 1: Search for the Wikipedia article
    const searchParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'search',
      srsearch: query,
      srlimit: '3', // Get top 3 matches
      origin: '*',
    });

    const searchUrl = `https://en.wikipedia.org/w/api.php?${searchParams}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'LoomPageBookGenerator/1.0 (https://loom-page-craft.lovable.app; contact@lovable.dev)',
      },
    });

    if (!searchResponse.ok) {
      console.error('[WikipediaArticle] Search API error:', searchResponse.status);
      return null;
    }

    const searchData = await searchResponse.json();
    const articles = searchData.query?.search || [];
    
    if (articles.length === 0) {
      console.log('[WikipediaArticle] No articles found for:', query);
      return null;
    }

    // Step 2: Get the page images for the best matching article
    const articleTitle = articles[0].title;
    console.log(`[WikipediaArticle] Found article: "${articleTitle}"`);

    const imageParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: articleTitle,
      prop: 'pageimages|images',
      piprop: 'original', // Get original (full-res) image
      pithumbsize: '2000', // Request high-res thumbnail as fallback
      imlimit: '10',
      origin: '*',
    });

    const imageUrl = `https://en.wikipedia.org/w/api.php?${imageParams}`;
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'LoomPageBookGenerator/1.0 (https://loom-page-craft.lovable.app; contact@lovable.dev)',
      },
    });

    if (!imageResponse.ok) {
      console.error('[WikipediaArticle] Image API error:', imageResponse.status);
      return null;
    }

    const imageData = await imageResponse.json();
    const pages = imageData.query?.pages;
    
    if (!pages) {
      console.log('[WikipediaArticle] No pages returned for:', articleTitle);
      return null;
    }

    const page = Object.values(pages)[0] as any;
    const originalImage = page?.original;
    
    if (!originalImage?.source) {
      console.log('[WikipediaArticle] No main image for article:', articleTitle);
      return null;
    }

    // Step 3: Get detailed image info from Wikimedia Commons for licensing
    const imageName = originalImage.source.split('/').pop()?.split('?')[0];
    if (!imageName) {
      console.log('[WikipediaArticle] Could not extract image name');
      return null;
    }

    // Decode the filename for the API query
    const decodedName = decodeURIComponent(imageName);
    
    const infoParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: `File:${decodedName}`,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      origin: '*',
    });

    const infoUrl = `https://commons.wikimedia.org/w/api.php?${infoParams}`;
    const infoResponse = await fetch(infoUrl, {
      headers: {
        'User-Agent': 'LoomPageBookGenerator/1.0 (https://loom-page-craft.lovable.app; contact@lovable.dev)',
      },
    });

    let width = originalImage.width || 0;
    let height = originalImage.height || 0;
    let artist = 'Wikipedia';
    let license = 'Wikipedia License';
    let finalImageUrl = originalImage.source;

    if (infoResponse.ok) {
      const infoData = await infoResponse.json();
      const infoPages = infoData.query?.pages;
      
      if (infoPages) {
        const infoPage = Object.values(infoPages)[0] as any;
        const imageInfo = infoPage?.imageinfo?.[0];
        
        if (imageInfo) {
          // Use Commons metadata for proper licensing
          width = imageInfo.width || width;
          height = imageInfo.height || height;
          finalImageUrl = imageInfo.url || finalImageUrl;
          
          const metadata = imageInfo.extmetadata || {};
          artist = metadata.Artist?.value?.replace(/<[^>]*>/g, '').trim() || 'Wikipedia';
          license = metadata.LicenseShortName?.value || metadata.License?.value || 'Wikipedia';
        }
      }
    }

    // KDP QUALITY GATE: Must be 1800px+ for print
    if (width < PRINT_READY_WIDTH) {
      console.log(`[WikipediaArticle] Image too small for print (${width}px < ${PRINT_READY_WIDTH}px), discarding`);
      return null;
    }

    // COVER LICENSE FILTER
    if (filterForCover && !isCoverSafeLicense(license)) {
      console.log(`[WikipediaArticle] License not safe for cover: ${license}`);
      return null;
    }

    console.log(`[WikipediaArticle] SUCCESS: Found verified image for "${articleTitle}" (${width}x${height}px, ${license})`);

    return {
      id: `wikipedia-article-${articleTitle.replace(/\s+/g, '-').toLowerCase()}`,
      imageUrl: finalImageUrl,
      thumbnailUrl: originalImage.source, // Use the Wikipedia-provided URL for thumbnail
      attribution: `${artist} / ${license}`,
      source: 'wikimedia', // Use wikimedia source type for consistency
      width,
      height,
      isPrintReady: width >= PRINT_READY_WIDTH,
    };
  } catch (error) {
    console.error('[WikipediaArticle] Fetch error:', error);
    return null;
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
    const { query, orientation = 'landscape', limit = 300, bookTopic, forCover = false } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[search-book-images] Query: "${query}", Orientation: ${orientation}, Limit: ${limit}, Topic: "${bookTopic || 'none'}", ForCover: ${forCover}`);

    const cleanedQuery = cleanQuery(query);
    
    if (!cleanedQuery || cleanedQuery.length < 2) {
      return new Response(
        JSON.stringify({ images: [], message: 'Query too short after cleaning' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Anchor the query to the book's topic for relevance
    const anchoredQuery = anchorQueryToTopic(cleanedQuery, bookTopic);

    // SMART WIKIPEDIA ARTICLE SEARCH: Try to find the verified main image first
    // This works best for specific locations, landmarks, hotels, etc.
    const wikipediaArticleResult = await searchWikipediaArticleImage(cleanedQuery, forCover);

    // Search all sources in parallel - OPTIMIZED for rate limits
    // Unsplash: 2 pages of 30 = 60 results max (reduced from 4 to stay within 50 req/hr limit)
    // Pexels: 2 pages of 80 = 160 results max (before filtering)
    // Pixabay: 1 page of 200 = 200 results max (before filtering)
    // Wikimedia: 2 queries of 50 = 100 results max (before filtering) - apply cover license filter if needed
    const [
      unsplashPage1, unsplashPage2,
      pexelsPage1, pexelsPage2,
      pixabayPage1,
      wikimediaResults1, wikimediaResults2
    ] = await Promise.all([
      searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
      searchUnsplashMultiple(anchoredQuery, orientation, 30, 2),
      searchPexelsMultiple(anchoredQuery, orientation, 80, 1),
      searchPexelsMultiple(anchoredQuery, orientation, 80, 2),
      searchPixabayMultiple(anchoredQuery, orientation, 200, 1),
      searchWikimediaMultiple(anchoredQuery, 50, forCover),
      searchWikimediaMultiple(`${anchoredQuery} scenic`, 50, forCover),
    ]);

    // Combine results
    const unsplashResults = [...unsplashPage1, ...unsplashPage2];
    const pexelsResults = [...pexelsPage1, ...pexelsPage2];
    const pixabayResults = [...pixabayPage1];
    const wikimediaResults = [...wikimediaResults1, ...wikimediaResults2];
    
    // Build final results array
    const allResults: ImageResult[] = [];
    
    // PRIORITY: If Wikipedia article image found and is high-quality, add it FIRST
    if (wikipediaArticleResult) {
      allResults.push(wikipediaArticleResult);
      console.log(`[search-book-images] Added verified Wikipedia article image as first result`);
    }
    
    // Interleave remaining sources: 3 Unsplash, 2 Pexels, 2 Pixabay, 1 Wikimedia pattern for variety
    let uIdx = 0, pIdx = 0, xIdx = 0, wIdx = 0;
    while (allResults.length < limit && (uIdx < unsplashResults.length || pIdx < pexelsResults.length || xIdx < pixabayResults.length || wIdx < wikimediaResults.length)) {
      // Add up to 3 Unsplash
      for (let i = 0; i < 3 && uIdx < unsplashResults.length && allResults.length < limit; i++) {
        allResults.push(unsplashResults[uIdx++]);
      }
      // Add up to 2 Pexels
      for (let i = 0; i < 2 && pIdx < pexelsResults.length && allResults.length < limit; i++) {
        allResults.push(pexelsResults[pIdx++]);
      }
      // Add up to 2 Pixabay
      for (let i = 0; i < 2 && xIdx < pixabayResults.length && allResults.length < limit; i++) {
        allResults.push(pixabayResults[xIdx++]);
      }
      // Add 1 Wikimedia
      if (wIdx < wikimediaResults.length && allResults.length < limit) {
        allResults.push(wikimediaResults[wIdx++]);
      }
    }

    // Count print-ready images
    const printReadyCount = allResults.filter(img => img.isPrintReady).length;

    console.log(`[search-book-images] Total results: ${allResults.length} (WikiArticle: ${wikipediaArticleResult ? 1 : 0}, Unsplash: ${unsplashResults.length}, Pexels: ${pexelsResults.length}, Pixabay: ${pixabayResults.length}, Wikimedia: ${wikimediaResults.length}, Print-Ready: ${printReadyCount})`);

    return new Response(
      JSON.stringify({ 
        images: allResults,
        query: cleanedQuery,
        sources: {
          unsplash: unsplashResults.length,
          pexels: pexelsResults.length,
          pixabay: pixabayResults.length,
          wikimedia: wikimediaResults.length + (wikipediaArticleResult ? 1 : 0),
        },
        printReadyCount,
        hasVerifiedArticleImage: !!wikipediaArticleResult,
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
