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
  source: 'unsplash' | 'wikimedia' | 'pexels' | 'pixabay' | 'openverse';
  id: string;
  width: number;           // Image width for quality filtering
  height: number;          // Image height
  isPrintReady: boolean;   // True if width >= 1800px
  license?: string;        // License type for metadata tracking
  imageType?: 'photo' | 'vector' | 'illustration'; // Type for frontend filtering
}

// ============== OPENVERSE OAUTH2 TOKEN MANAGEMENT ==============
// In-memory token cache (resets on cold start, but that's fine for edge functions)
let openverseAccessToken: string | null = null;
let openverseTokenExpiry: number = 0;

// Obtain or refresh the Openverse OAuth2 access token
async function getOpenverseAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('OPENVERSE_CLIENT_ID');
  const clientSecret = Deno.env.get('OPENVERSE_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    console.log('[Openverse] No API credentials configured (OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET)');
    return null;
  }
  
  // Check if we have a valid cached token (with 60s buffer)
  const now = Date.now();
  if (openverseAccessToken && openverseTokenExpiry > now + 60000) {
    console.log('[Openverse] Using cached access token');
    return openverseAccessToken;
  }
  
  console.log('[Openverse] Fetching new access token...');
  
  try {
    const response = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Openverse] Token fetch error:', response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.access_token) {
      console.error('[Openverse] No access_token in response');
      return null;
    }
    
    // Cache the token with expiry (Openverse tokens typically last 12 hours)
    openverseAccessToken = data.access_token;
    // Default to 11 hours if expires_in not provided
    const expiresInMs = (data.expires_in || 39600) * 1000;
    openverseTokenExpiry = now + expiresInMs;
    
    console.log(`[Openverse] Access token obtained, expires in ${Math.round(expiresInMs / 3600000)}h`);
    return openverseAccessToken;
  } catch (error) {
    console.error('[Openverse] Token fetch exception:', error);
    return null;
  }
}

// ============== SPECIFIC LOCATION DETECTION ==============
// Detect if a query is a "specific entity" (proper noun, location, hotel, landmark)
function isSpecificLocationQuery(query: string): boolean {
  // Patterns that indicate specific locations
  const specificPatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+/, // Two capitalized words: "Lake Como", "Hotel Jerome"
    /\b(hotel|inn|resort|lodge|villa|palace|castle|manor|chateau)\b/i,
    /\b(lake|mountain|river|valley|bay|island|beach|peak|falls)\s+[A-Z]/i,
    /\b(city|town|village|district)\s+of\b/i,
    /^(the\s+)?[A-Z][a-z]+\s+(restaurant|cafe|bar|club|museum|gallery|theater|theatre|church|cathedral|temple|mosque|synagogue)\b/i,
    /\b(avenue|street|road|plaza|square|park|garden|boulevard)\b/i,
    /\b(airport|station|terminal|port|harbor|harbour)\b/i,
    /^[A-Z][a-z]+,?\s+[A-Z][a-z]+$/, // "Courchevel, France" or "Courchevel France"
  ];
  
  // Check for proper noun indicators (capitalized words beyond first)
  const words = query.split(/\s+/);
  const capitalizedWordCount = words.filter((w, i) => i > 0 && /^[A-Z]/.test(w)).length;
  
  // If multiple capitalized words OR matches specific patterns, it's likely a specific location
  if (capitalizedWordCount >= 1) {
    console.log(`[SpecificLocation] Query "${query}" has ${capitalizedWordCount} proper nouns - treating as specific`);
    return true;
  }
  
  for (const pattern of specificPatterns) {
    if (pattern.test(query)) {
      console.log(`[SpecificLocation] Query "${query}" matches specific pattern - treating as specific`);
      return true;
    }
  }
  
  return false;
}

// AI-generated negative prompts to remove
const NOISE_PHRASES = [
  'no people',
  'no faces',
  'no humans',
  'without people',
];

// SMART SEARCH: Keywords that indicate abstract/symbolic content (prefer vectors/illustrations)
const ABSTRACT_KEYWORDS = [
  'astrology', 'zodiac', 'horoscope', 'tarot', 'chakra', 'spiritual', 'mystical',
  'psychology', 'mindset', 'meditation', 'wellness', 'self-help', 'mental health',
  'symbol', 'icon', 'diagram', 'chart', 'infographic', 'concept', 'abstract',
  'geometric', 'mandala', 'sacred geometry', 'esoteric', 'metaphysical',
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces', 'constellation',
];

// REALISTIC: Keywords that indicate photo-based content (prefer Unsplash/Pexels)
const REALISTIC_KEYWORDS = [
  'travel', 'city', 'landmark', 'hotel', 'restaurant', 'beach', 'mountain',
  'architecture', 'building', 'street', 'landscape', 'nature', 'food', 'cuisine',
  'portrait', 'people', 'lifestyle', 'interior', 'exterior', 'skyline', 'view',
  'history', 'historical', 'biography', 'person', 'place', 'destination',
];

type SearchMode = 'abstract' | 'realistic' | 'mixed';

// Determine search mode based on query content
function detectSearchMode(query: string, bookTopic?: string): SearchMode {
  const combined = `${query} ${bookTopic || ''}`.toLowerCase();
  
  const abstractScore = ABSTRACT_KEYWORDS.filter(kw => combined.includes(kw)).length;
  const realisticScore = REALISTIC_KEYWORDS.filter(kw => combined.includes(kw)).length;
  
  console.log(`[SearchMode] Abstract score: ${abstractScore}, Realistic score: ${realisticScore}`);
  
  if (abstractScore > realisticScore && abstractScore >= 1) {
    return 'abstract';
  }
  if (realisticScore > abstractScore && realisticScore >= 1) {
    return 'realistic';
  }
  return 'mixed';
}

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
// Supports both 'photo' and 'vector'/'illustration' image types for context-aware search
async function searchPixabayMultiple(
  query: string,
  orientation: 'landscape' | 'portrait' = 'landscape',
  perPage: number = 40,
  page: number = 1,
  imageType: 'photo' | 'vector' | 'illustration' | 'all' = 'photo'
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
      image_type: imageType,
      safesearch: 'true',
    });

    const response = await fetch(`https://pixabay.com/api/?${params}`);

    if (!response.ok) {
      console.error('[Pixabay] API error:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data.hits || data.hits.length === 0) {
      console.log(`[Pixabay] No ${imageType} results for query:`, query);
      return [];
    }

    const results: ImageResult[] = [];

    for (const photo of data.hits) {
      // Pixabay: use imageWidth (original) for quality check, not webformatWidth (resized)
      const width = photo.imageWidth || 0;
      const height = photo.imageHeight || 0;

      // HIDDEN FILTER: Skip images below minimum print quality (1200px) based on ORIGINAL size
      // Exception: Vector images are resolution-independent, so allow smaller sizes
      const isVector = imageType === 'vector' || photo.type === 'vector/svg';
      if (width < MIN_WIDTH_FILTER && !isVector) {
        continue;
      }

      // Use largeImageURL for high-res, webformatURL for thumbnail
      const imageUrl = photo.largeImageURL || photo.webformatURL;
      const thumbnailUrl = photo.webformatURL || photo.previewURL;

      if (!imageUrl) continue;

      // SAFETY NET: Always have attribution - never blank
      // photo.user = username, photo.pageURL = source link
      const artistName = photo.user || null;
      const sourceUrl = photo.pageURL || null;
      const typeLabel = isVector ? 'Vector' : 'Image';
      
      // Build attribution string - NEVER blank
      let attribution: string;
      if (artistName) {
        attribution = `${typeLabel} by ${artistName} on Pixabay`;
      } else {
        attribution = `Source: Pixabay`; // Fallback for null artist
      }

      results.push({
        id: `pixabay-${photo.id}`,
        imageUrl,
        thumbnailUrl: thumbnailUrl || imageUrl,
        attribution, // VERIFIED: Never blank
        source: 'pixabay' as const,
        width,
        height,
        isPrintReady: width >= PRINT_READY_WIDTH || isVector, // Vectors are always print-ready
        // Extended metadata for data mapping verification
        license: 'Pixabay License', // All Pixabay images use the same license
        // NEW: Type field for frontend filtering
        imageType: isVector ? 'vector' : (imageType === 'illustration' ? 'illustration' : 'photo'),
      });
    }

    console.log(`[Pixabay] Found ${results.length} high-res ${imageType} images for query (page ${page}, filtered from ${data.hits.length}):`, query);
    return results;
  } catch (error) {
    console.error('[Pixabay] Fetch error:', error);
    return [];
  }
}

// ============== OPENVERSE IMAGE SEARCH ==============
// Search Openverse (Flickr, Wikipedia, other CC sources) with commercial-safe license filtering
// Prioritized for SPECIFIC LOCATIONS where Unsplash/Pexels fail
async function searchOpenverseMultiple(
  query: string,
  orientation: 'landscape' | 'portrait' = 'landscape',
  limit: number = 50,
  filterForCover: boolean = false
): Promise<ImageResult[]> {
  const accessToken = await getOpenverseAccessToken();
  
  if (!accessToken) {
    console.log('[Openverse] No access token available, skipping search');
    return [];
  }

  try {
    // Openverse orientation mapping
    const aspectRatio = orientation === 'portrait' ? 'tall' : 'wide';
    
    // COMMERCIAL SAFETY: Only fetch commercially usable images
    // license_type=commercial,modification ensures safe licensing
    const params = new URLSearchParams({
      q: query,
      license_type: 'commercial,modification', // CRITICAL: Only commercially safe images
      aspect_ratio: aspectRatio,
      page_size: String(Math.min(limit, 50)), // Openverse max is 50 per page
      mature: 'false', // Safe search
    });

    console.log(`[Openverse] Searching: "${query}" with commercial license filter`);

    const response = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'LoomPageBookGenerator/1.0 (https://loom-page-craft.lovable.app)',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Openverse] API error:', response.status, errorText);
      return [];
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      console.log('[Openverse] No results for query:', query);
      return [];
    }

    console.log(`[Openverse] Raw results: ${data.results.length}`);

    const results: ImageResult[] = [];

    for (const result of data.results) {
      // Extract dimensions
      const width = result.width || 0;
      const height = result.height || 0;
      
      // HIDDEN FILTER: Skip images below minimum print quality (1200px)
      if (width < MIN_WIDTH_FILTER) {
        continue;
      }

      // COVER LICENSE FILTER: For covers, apply stricter license filtering
      const license = result.license || '';
      const licenseVersion = result.license_version || '';
      const fullLicense = `${license} ${licenseVersion}`.trim();
      
      if (filterForCover && !isCoverSafeLicense(fullLicense)) {
        console.log(`[Openverse] Skipping image with restrictive license for cover: ${fullLicense}`);
        continue;
      }

      // ATTRIBUTION EXTRACTION: Map Openverse fields to our attribution system
      // result.creator -> credit_name
      // result.license_url -> source_url (for legal docs)
      // result.title -> caption context
      const creatorName = result.creator || null;
      const sourceProvider = result.source || 'Openverse'; // e.g., "flickr", "wikimedia"
      const title = result.title || '';
      const licenseUrl = result.license_url || '';
      
      // Build attribution - NEVER blank (as per Pixabay pattern)
      let attribution: string;
      if (creatorName) {
        attribution = `${title ? `"${title}" by ` : 'Photo by '}${creatorName} via ${sourceProvider}`;
      } else {
        attribution = `Source: ${sourceProvider}`; // Fallback for null creator
      }

      // Get best URL - prefer full-size
      const imageUrl = result.url || result.thumbnail || '';
      const thumbnailUrl = result.thumbnail || result.url || '';

      if (!imageUrl) continue;

      results.push({
        id: `openverse-${result.id}`,
        imageUrl,
        thumbnailUrl,
        attribution,
        source: 'openverse' as const,
        width,
        height,
        isPrintReady: width >= PRINT_READY_WIDTH,
        license: `${fullLicense} (${sourceProvider})`, // Full license info for legal tracking
      });
    }

    console.log(`[Openverse] Found ${results.length} high-res commercial images for query (filtered from ${data.results.length}):`, query);
    return results;
  } catch (error) {
    console.error('[Openverse] Fetch error:', error);
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
    const { query, orientation = 'landscape', limit = 300, bookTopic, forCover = false, searchAllSources = false } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[search-book-images] Query: "${query}", Orientation: ${orientation}, Limit: ${limit}, Topic: "${bookTopic || 'none'}", ForCover: ${forCover}, SearchAllSources: ${searchAllSources}`);

    const cleanedQuery = cleanQuery(query);
    
    if (!cleanedQuery || cleanedQuery.length < 2) {
      return new Response(
        JSON.stringify({ images: [], message: 'Query too short after cleaning' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Anchor the query to the book's topic for relevance
    const anchoredQuery = anchorQueryToTopic(cleanedQuery, bookTopic);

    // SMART SEARCH MODE DETECTION: Categorize as abstract vs realistic
    // When searchAllSources is true (manual gallery), we ignore smart routing
    const searchMode = searchAllSources ? 'mixed' : detectSearchMode(cleanedQuery, bookTopic);
    console.log(`[search-book-images] Detected search mode: ${searchMode}${searchAllSources ? ' (searchAllSources override)' : ''}`);

    // COVER SAFETY: Explicitly block Wikimedia for covers due to complex attribution requirements
    const skipWikimedia = forCover;
    if (skipWikimedia) {
      console.log(`[search-book-images] COVER MODE: Wikimedia blocked for cover safety`);
    }

    // ============== SMART ROUTER: SPECIFIC LOCATION DETECTION ==============
    // Check if this is a specific location query (proper nouns, hotels, landmarks)
    // Priority 1: Openverse for specific locations (better quantity for niche places)
    // Priority 2: Unsplash/Pexels for generic vibes (better aesthetic quality)
    // Priority 3: Pixabay for vectors/symbols
    const isSpecificLocation = isSpecificLocationQuery(query); // Use original query for case detection
    console.log(`[search-book-images] Specific location detection: ${isSpecificLocation}`);

    // SMART WIKIPEDIA ARTICLE SEARCH: Only for realistic mode and non-cover
    // This works best for specific locations, landmarks, hotels, etc.
    let wikipediaArticleResult = null;
    if (searchMode === 'realistic' && !skipWikimedia) {
      wikipediaArticleResult = await searchWikipediaArticleImage(cleanedQuery, forCover);
    }

    // Build search promises based on mode AND specificity
    const searchPromises: Promise<ImageResult[]>[] = [];
    
    if (searchMode === 'abstract') {
      // ABSTRACT MODE: Prioritize Pixabay vectors/illustrations (NO CHANGE)
      console.log(`[search-book-images] ABSTRACT MODE: Prioritizing Pixabay vectors and illustrations`);
      searchPromises.push(
        // Pixabay vectors (primary for abstract)
        searchPixabayMultiple(anchoredQuery, orientation, 100, 1, 'vector'),
        searchPixabayMultiple(anchoredQuery, orientation, 100, 2, 'vector'),
        // Pixabay illustrations (secondary for abstract)
        searchPixabayMultiple(anchoredQuery, orientation, 100, 1, 'illustration'),
        // Still include some photos as fallback
        searchPixabayMultiple(anchoredQuery, orientation, 50, 1, 'photo'),
        searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
        searchPexelsMultiple(anchoredQuery, orientation, 40, 1),
      );
    } else if (searchMode === 'realistic') {
      // REALISTIC MODE: Branch based on specificity
      if (isSpecificLocation) {
        // ========= PRIORITY 1: OPENVERSE for SPECIFIC LOCATIONS =========
        // Openverse excels at finding niche places Unsplash misses (small towns, hotels, landmarks)
        console.log(`[search-book-images] SPECIFIC LOCATION MODE: Prioritizing Openverse for specificity`);
        searchPromises.push(
          // Openverse FIRST - best for specific locations
          searchOpenverseMultiple(anchoredQuery, orientation, 50, forCover),
          searchOpenverseMultiple(cleanedQuery, orientation, 50, forCover), // Also try unanchored
          // Then standard high-quality sources
          searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
          searchPexelsMultiple(anchoredQuery, orientation, 80, 1),
          searchPixabayMultiple(anchoredQuery, orientation, 50, 1, 'photo'),
        );
        // Add Wikimedia for additional specific content (not for covers)
        if (!skipWikimedia) {
          searchPromises.push(
            searchWikimediaMultiple(anchoredQuery, 50, forCover),
          );
        }
      } else {
        // ========= PRIORITY 2: UNSPLASH/PEXELS for VIBES =========
        // For generic/aesthetic queries, prioritize high-quality photo platforms
        console.log(`[search-book-images] VIBE/GENERIC MODE: Prioritizing Unsplash and Pexels photos`);
        searchPromises.push(
          searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
          searchUnsplashMultiple(anchoredQuery, orientation, 30, 2),
          searchPexelsMultiple(anchoredQuery, orientation, 80, 1),
          searchPexelsMultiple(anchoredQuery, orientation, 80, 2),
          searchPixabayMultiple(anchoredQuery, orientation, 100, 1, 'photo'),
          // Include some Openverse as variety
          searchOpenverseMultiple(anchoredQuery, orientation, 30, forCover),
        );
        // Add Wikimedia only if not cover mode
        if (!skipWikimedia) {
          searchPromises.push(
            searchWikimediaMultiple(anchoredQuery, 50, forCover),
            searchWikimediaMultiple(`${anchoredQuery} scenic`, 50, forCover),
          );
        }
      }
    } else {
      // MIXED MODE or searchAllSources=true: Balanced approach searching ALL sources
      // This ensures the manual gallery always has content for every tab
      console.log(`[search-book-images] ${searchAllSources ? 'ALL SOURCES' : 'MIXED'} MODE: Balanced source distribution`);
      searchPromises.push(
        // Photos from all primary sources
        searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
        searchUnsplashMultiple(anchoredQuery, orientation, 30, 2),
        searchPexelsMultiple(anchoredQuery, orientation, 80, 1),
        searchPexelsMultiple(anchoredQuery, orientation, 80, 2),
        searchPixabayMultiple(anchoredQuery, orientation, 100, 1, 'photo'),
        // ALWAYS include vectors for the Vectors tab
        searchPixabayMultiple(anchoredQuery, orientation, 100, 1, 'vector'),
        searchPixabayMultiple(anchoredQuery, orientation, 100, 2, 'vector'),
        // ALWAYS include Openverse for the Locations tab
        searchOpenverseMultiple(anchoredQuery, orientation, 50, forCover),
        searchOpenverseMultiple(cleanedQuery, orientation, 50, forCover), // Unanchored too
      );
      // ALWAYS include Wikimedia for the Locations tab (unless cover mode)
      if (!skipWikimedia) {
        searchPromises.push(
          searchWikimediaMultiple(anchoredQuery, 50, forCover),
          searchWikimediaMultiple(cleanedQuery, 50, forCover), // Unanchored too
        );
      }
    }

    // Execute all searches in parallel
    const searchResults = await Promise.all(searchPromises);
    
    // Categorize results by source
    const unsplashResults: ImageResult[] = [];
    const pexelsResults: ImageResult[] = [];
    const pixabayResults: ImageResult[] = [];
    const wikimediaResults: ImageResult[] = [];
    const openverseResults: ImageResult[] = [];
    
    for (const results of searchResults) {
      for (const img of results) {
        // COVER SAFETY: Double-check no Wikimedia/Openverse-Wikimedia images slip through for covers
        if (forCover && (img.source === 'wikimedia' || (img.source === 'openverse' && img.license?.toLowerCase().includes('wikimedia')))) {
          console.log(`[search-book-images] BLOCKED image for cover: ${img.id}`);
          continue;
        }
        
        switch (img.source) {
          case 'unsplash': unsplashResults.push(img); break;
          case 'pexels': pexelsResults.push(img); break;
          case 'pixabay': pixabayResults.push(img); break;
          case 'wikimedia': wikimediaResults.push(img); break;
          case 'openverse': openverseResults.push(img); break;
        }
      }
    }
    
    // Build final results array
    const allResults: ImageResult[] = [];
    
    // PRIORITY: If Wikipedia article image found and is high-quality, add it FIRST (non-cover only)
    if (wikipediaArticleResult && !forCover) {
      allResults.push(wikipediaArticleResult);
      console.log(`[search-book-images] Added verified Wikipedia article image as first result`);
    }
    
    // Interleave based on search mode AND specificity
    let uIdx = 0, pIdx = 0, xIdx = 0, wIdx = 0, oIdx = 0;
    
    if (searchMode === 'abstract') {
      // ABSTRACT MODE: Pixabay first, then photos
      while (allResults.length < limit && (uIdx < unsplashResults.length || pIdx < pexelsResults.length || xIdx < pixabayResults.length)) {
        // Add up to 4 Pixabay (vectors/illustrations prioritized)
        for (let i = 0; i < 4 && xIdx < pixabayResults.length && allResults.length < limit; i++) {
          allResults.push(pixabayResults[xIdx++]);
        }
        // Add 1 Unsplash
        if (uIdx < unsplashResults.length && allResults.length < limit) {
          allResults.push(unsplashResults[uIdx++]);
        }
        // Add 1 Pexels
        if (pIdx < pexelsResults.length && allResults.length < limit) {
          allResults.push(pexelsResults[pIdx++]);
        }
      }
    } else if (isSpecificLocation) {
      // SPECIFIC LOCATION MODE: Openverse FIRST, then quality sources
      console.log(`[search-book-images] Interleaving with Openverse priority for specific location`);
      while (allResults.length < limit && (oIdx < openverseResults.length || uIdx < unsplashResults.length || pIdx < pexelsResults.length || xIdx < pixabayResults.length || wIdx < wikimediaResults.length)) {
        // Add up to 3 Openverse (primary for specific locations)
        for (let i = 0; i < 3 && oIdx < openverseResults.length && allResults.length < limit; i++) {
          allResults.push(openverseResults[oIdx++]);
        }
        // Add 2 Unsplash
        for (let i = 0; i < 2 && uIdx < unsplashResults.length && allResults.length < limit; i++) {
          allResults.push(unsplashResults[uIdx++]);
        }
        // Add 2 Pexels
        for (let i = 0; i < 2 && pIdx < pexelsResults.length && allResults.length < limit; i++) {
          allResults.push(pexelsResults[pIdx++]);
        }
        // Add 1 Pixabay
        if (xIdx < pixabayResults.length && allResults.length < limit) {
          allResults.push(pixabayResults[xIdx++]);
        }
        // Add 1 Wikimedia (only if not cover mode)
        if (!forCover && wIdx < wikimediaResults.length && allResults.length < limit) {
          allResults.push(wikimediaResults[wIdx++]);
        }
      }
    } else {
      // REALISTIC/MIXED MODE: Photos first, Openverse as variety
      while (allResults.length < limit && (uIdx < unsplashResults.length || pIdx < pexelsResults.length || xIdx < pixabayResults.length || wIdx < wikimediaResults.length || oIdx < openverseResults.length)) {
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
        // Add 1 Openverse
        if (oIdx < openverseResults.length && allResults.length < limit) {
          allResults.push(openverseResults[oIdx++]);
        }
        // Add 1 Wikimedia (only if not cover mode)
        if (!forCover && wIdx < wikimediaResults.length && allResults.length < limit) {
          allResults.push(wikimediaResults[wIdx++]);
        }
      }
    }

    // Count print-ready images
    const printReadyCount = allResults.filter(img => img.isPrintReady).length;

    console.log(`[search-book-images] Total results: ${allResults.length} (Mode: ${searchMode}, Specific: ${isSpecificLocation}, WikiArticle: ${wikipediaArticleResult ? 1 : 0}, Openverse: ${openverseResults.length}, Unsplash: ${unsplashResults.length}, Pexels: ${pexelsResults.length}, Pixabay: ${pixabayResults.length}, Wikimedia: ${wikimediaResults.length}, Print-Ready: ${printReadyCount})`);

    return new Response(
      JSON.stringify({ 
        images: allResults,
        query: cleanedQuery,
        searchMode, // Expose detected mode for debugging
        isSpecificLocation, // Expose specificity detection for debugging
        sources: {
          openverse: openverseResults.length,
          unsplash: unsplashResults.length,
          pexels: pexelsResults.length,
          pixabay: pixabayResults.length,
          wikimedia: wikimediaResults.length + (wikipediaArticleResult ? 1 : 0),
        },
        printReadyCount,
        hasVerifiedArticleImage: !!wikipediaArticleResult,
        coverSafe: forCover, // Confirm cover-safe filtering was applied
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
