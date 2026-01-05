import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlaceResult {
  name: string;
  type: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  placeId: string;
}

// Generic retailers to filter out
const BLOCKED_NAMES = [
  'target', 'walmart', 'costco', 'amazon', 'best buy', 'home depot', 'lowes',
  'staples', 'office depot', 'dollar general', 'dollar tree', 'family dollar',
  'big lots', 'five below', 'ross', 'marshalls', 'tj maxx', 'kohl\'s', 'jcpenney',
  'macy\'s', 'nordstrom', 'sears', 'cvs', 'walgreens', 'rite aid', 'kroger',
  'safeway', 'publix', 'whole foods', 'trader joe\'s', 'aldi', 'lidl',
  'autozone', 'o\'reilly', 'advance auto', 'pep boys', 'jiffy lube', 'valvoline',
  'firestone', 'discount tire', 'big o tires', 'les schwab'
];

// Blocked place types (generic retail)
const BLOCKED_TYPES = [
  'department_store', 'electronics_store', 'discount_store', 'supermarket',
  'grocery_or_supermarket', 'convenience_store', 'drugstore', 'pharmacy',
  'clothing_store', 'shoe_store'
];

// Topic-specific search configurations
const TOPIC_CONFIGS: Record<string, { keywords: string[]; types: string[]; relevantTerms: string[] }> = {
  'car': {
    keywords: ['classic car restoration', 'automotive machine shop', 'auto body shop', 'car parts specialty'],
    types: ['car_repair', 'car_dealer', 'auto_parts_store'],
    relevantTerms: ['auto', 'motors', 'automotive', 'restoration', 'classic', 'vintage', 'body shop', 'machine shop', 'parts']
  },
  'ferrari': {
    keywords: ['Ferrari specialist shop', 'exotic car restoration shop', 'Italian sports car service', 'specialty automotive restoration'],
    types: ['car_repair', 'car_dealer'],
    relevantTerms: ['ferrari', 'exotic', 'italian', 'lamborghini', 'maserati', 'porsche', 'luxury auto', 'restoration', 'specialty', 'european', 'supercar', 'collector']
  },
  'porsche': {
    keywords: ['Porsche specialist', 'German car restoration', 'sports car service center'],
    types: ['car_repair', 'car_dealer'],
    relevantTerms: ['porsche', 'german', 'sports car', 'restoration', 'specialty', 'european', 'collector']
  },
  'classic': {
    keywords: ['classic car restoration', 'vintage auto shop', 'antique car specialist', 'collector car service'],
    types: ['car_repair', 'car_dealer'],
    relevantTerms: ['classic', 'vintage', 'antique', 'restoration', 'collector', 'muscle car', 'specialty']
  },
  'restoration': {
    keywords: ['specialty automotive restoration', 'custom car builder', 'restoration shop', 'classic auto restoration'],
    types: ['car_repair'],
    relevantTerms: ['restoration', 'custom', 'rebuild', 'specialty', 'collector', 'vintage', 'classic']
  },
  'motorcycle': {
    keywords: ['motorcycle shop', 'motorcycle parts', 'custom motorcycle builder'],
    types: ['car_repair', 'store'],
    relevantTerms: ['motorcycle', 'cycle', 'harley', 'honda', 'yamaha', 'custom', 'parts']
  },
  'wood': {
    keywords: ['lumber yard', 'hardwood supplier', 'woodworking supply', 'cabinet shop'],
    types: ['home_improvement_store', 'furniture_store'],
    relevantTerms: ['lumber', 'hardwood', 'wood', 'cabinet', 'millwork', 'timber']
  },
  'leather': {
    keywords: ['leather supply', 'upholstery shop', 'leather craft', 'tannery'],
    types: ['store', 'home_goods_store'],
    relevantTerms: ['leather', 'upholstery', 'craft', 'hide', 'tannery']
  },
  'sew': {
    keywords: ['fabric store', 'sewing machine dealer', 'quilting shop', 'textile supplier'],
    types: ['store', 'home_goods_store'],
    relevantTerms: ['fabric', 'sewing', 'quilt', 'textile', 'notions', 'thread']
  },
  'bread': {
    keywords: ['baking supply store', 'restaurant supply', 'specialty flour', 'artisan bakery supply'],
    types: ['store', 'bakery'],
    relevantTerms: ['baking', 'flour', 'bakery', 'artisan', 'pastry', 'supply']
  },
  'garden': {
    keywords: ['nursery plants', 'garden center', 'landscape supply', 'seed supplier'],
    types: ['florist', 'store', 'home_improvement_store'],
    relevantTerms: ['nursery', 'garden', 'plant', 'landscape', 'seed', 'greenhouse']
  },
  'paint': {
    keywords: ['art supply store', 'paint supplier', 'artist materials'],
    types: ['store', 'art_gallery'],
    relevantTerms: ['art', 'paint', 'artist', 'canvas', 'brush', 'supply']
  },
  'jewelry': {
    keywords: ['jewelry supply', 'gemstone dealer', 'metalsmith supply', 'bead store'],
    types: ['jewelry_store', 'store'],
    relevantTerms: ['jewelry', 'gem', 'bead', 'metal', 'silver', 'gold', 'craft']
  }
};

function getTopicConfig(topic: string): { keywords: string[]; types: string[]; relevantTerms: string[] } {
  const lowerTopic = topic.toLowerCase();
  
  for (const [key, config] of Object.entries(TOPIC_CONFIGS)) {
    if (lowerTopic.includes(key)) {
      return config;
    }
  }
  
  // Default config for unknown topics
  return {
    keywords: [`${topic} specialty shop`, `${topic} supplies`, `${topic} professional`],
    types: ['store', 'establishment'],
    relevantTerms: topic.toLowerCase().split(' ').filter(w => w.length > 3)
  };
}

function isRelevantPlace(placeName: string, placeType: string, relevantTerms: string[]): boolean {
  const lowerName = placeName.toLowerCase();
  const lowerType = placeType.toLowerCase();
  
  // Block generic retailers by name
  if (BLOCKED_NAMES.some(blocked => lowerName.includes(blocked))) {
    return false;
  }
  
  // Block generic retail types
  if (BLOCKED_TYPES.some(blocked => lowerType.includes(blocked.replace(/_/g, ' ')))) {
    return false;
  }
  
  // Must contain at least one relevant term
  return relevantTerms.some(term => lowerName.includes(term) || lowerType.includes(term));
}

async function searchPlaces(
  apiKey: string,
  query: string,
  latitude: number | null,
  longitude: number | null,
  radiusMeters: number,
  relevantTerms: string[]
): Promise<PlaceResult[]> {
  const results: PlaceResult[] = [];
  
  // Try Places API (New) with location bias
  try {
    console.log(`Searching: "${query}" within ${radiusMeters / 1000}km...`);
    
    const requestBody: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: 10, // Get more results to filter
    };

    if (latitude && longitude) {
      requestBody.locationBias = {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      };
    }

    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.formattedAddress,places.rating,places.userRatingCount,places.id',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (response.ok) {
      const data = await response.json();
      
      if (data.places && data.places.length > 0) {
        for (const place of data.places) {
          const name = place.displayName?.text || 'Local Business';
          const type = place.primaryType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Specialty Store';
          
          // Filter out irrelevant places
          if (isRelevantPlace(name, type, relevantTerms)) {
            results.push({
              name,
              type,
              address: place.formattedAddress || 'Address not available',
              rating: place.rating || null,
              reviewCount: place.userRatingCount || null,
              placeId: place.id || '',
            });
          } else {
            console.log(`Filtered out: ${name} (${type})`);
          }
        }
      }
    } else {
      const errorText = await response.text();
      console.log('Places API (New) failed:', response.status, errorText);
    }
  } catch (error) {
    console.error('Places API (New) error:', error);
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, materials, topic, sessionId } = await req.json();
    
    // Validate session_id to prevent bot abuse
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
      console.error('Invalid or missing session_id:', sessionId);
      return new Response(
        JSON.stringify({ error: 'Valid session required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching local resources:', { latitude, longitude, materials, topic });

    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!GOOGLE_PLACES_API_KEY) {
      console.log('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ resources: [], error: 'Places API not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get topic-specific configuration
    const topicConfig = getTopicConfig(topic || '');
    console.log('Topic config:', topicConfig);

    // Combine topic keywords with any extracted materials
    const materialsList = Array.isArray(materials) ? materials.slice(0, 3) : [];
    const allRelevantTerms = [...topicConfig.relevantTerms, ...materialsList.map(m => m.toLowerCase())];
    
    let allResults: PlaceResult[] = [];
    
    // Search with each specialty keyword
    for (const keyword of topicConfig.keywords.slice(0, 2)) {
      // First try 16km (~10 miles)
      const nearResults = await searchPlaces(
        GOOGLE_PLACES_API_KEY,
        keyword,
        latitude,
        longitude,
        16000,
        allRelevantTerms
      );
      
      if (nearResults.length > 0) {
        allResults.push(...nearResults);
      }
    }
    
    // If we don't have enough results, expand to 80km (~50 miles)
    if (allResults.length < 3 && latitude && longitude) {
      console.log('Expanding search radius to 50 miles...');
      
      for (const keyword of topicConfig.keywords) {
        const wideResults = await searchPlaces(
          GOOGLE_PLACES_API_KEY,
          keyword,
          latitude,
          longitude,
          80000,
          allRelevantTerms
        );
        
        if (wideResults.length > 0) {
          allResults.push(...wideResults);
        }
        
        if (allResults.length >= 5) break;
      }
    }
    
    // Deduplicate by placeId
    const uniqueResults = allResults.reduce<PlaceResult[]>((acc, place) => {
      if (!acc.find(p => p.placeId === place.placeId || p.name === place.name)) {
        acc.push(place);
      }
      return acc;
    }, []);
    
    // Sort by rating (higher first), then take top 3
    const sortedResults = uniqueResults
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 3);

    console.log(`Returning ${sortedResults.length} filtered places`);

    return new Response(
      JSON.stringify({ resources: sortedResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error fetching local resources:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ resources: [], error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
