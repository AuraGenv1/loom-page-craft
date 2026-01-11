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

// Generic retailers to filter out - expanded list
const BLOCKED_NAMES = [
  'target', 'walmart', 'costco', 'amazon', 'best buy', 'home depot', 'lowes',
  'staples', 'office depot', 'dollar general', 'dollar tree', 'family dollar',
  'big lots', 'five below', 'ross', 'marshalls', 'tj maxx', 'kohl\'s', 'jcpenney',
  'macy\'s', 'nordstrom', 'sears', 'cvs', 'walgreens', 'rite aid', 'kroger',
  'safeway', 'publix', 'whole foods', 'trader joe\'s', 'aldi', 'lidl',
  'autozone', 'o\'reilly', 'advance auto', 'pep boys', 'jiffy lube', 'valvoline',
  'firestone', 'discount tire', 'big o tires', 'les schwab',
  'hobby lobby', 'michaels', 'joann', 'ace hardware', 'true value', 'menards',
  'harbor freight', 'northern tool', 'tractor supply', 'rural king',
  'sam\'s club', 'bj\'s', 'big 5', 'dick\'s sporting', 'bass pro', 'cabela\'s',
  'bed bath', 'pier 1', 'pottery barn', 'crate barrel', 'ikea', 'wayfair',
  'sephora', 'ulta', 'bath body works', 'victoria secret', 'gap', 'old navy',
  'banana republic', 'h&m', 'zara', 'forever 21', 'aeropostale', 'american eagle',
  'foot locker', 'finish line', 'champs', 'gamestop', 'barnes noble'
];

// Blocked place types (generic retail)
const BLOCKED_TYPES = [
  'department_store', 'electronics_store', 'discount_store', 'supermarket',
  'grocery_or_supermarket', 'convenience_store', 'drugstore', 'pharmacy',
  'clothing_store', 'shoe_store', 'shopping_mall', 'home_goods_store',
  'hardware_store', 'sporting_goods_store', 'pet_store', 'book_store'
];

// Specialty keywords that indicate high-quality artisan results
const SPECIALTY_KEYWORDS = [
  'restoration', 'artisan', 'boutique', 'specialty', 'custom', 'professional',
  'vintage', 'antique', 'classic', 'handcraft', 'bespoke', 'luxury', 'premium',
  'master', 'expert', 'specialist', 'workshop', 'studio', 'atelier', 'guild'
];

// Topic-specific search configurations (instructional resources prioritized)
const TOPIC_CONFIGS: Record<string, { keywords: string[]; types: string[]; relevantTerms: string[] }> = {
  'fly': {
    keywords: ['flight school', 'flying lessons', 'pilot training', 'aviation academy'],
    types: ['school', 'airport'],
    relevantTerms: ['flight', 'flying', 'aviation', 'pilot', 'lessons', 'school', 'training', 'academy', 'aero', 'aircraft']
  },
  'airplane': {
    keywords: ['flight school', 'pilot training academy', 'learn to fly', 'aviation school'],
    types: ['school', 'airport'],
    relevantTerms: ['flight', 'airplane', 'aviation', 'pilot', 'lessons', 'school', 'training', 'academy', 'aero']
  },
  'pilot': {
    keywords: ['pilot training', 'flight school', 'aviation academy', 'certified flight instructor'],
    types: ['school', 'airport'],
    relevantTerms: ['pilot', 'flight', 'aviation', 'training', 'lessons', 'school', 'certificate', 'instructor']
  },
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
    keywords: ['motorcycle training course', 'motorcycle riding school', 'motorcycle shop', 'custom motorcycle builder'],
    types: ['car_repair', 'store', 'school'],
    relevantTerms: ['motorcycle', 'cycle', 'harley', 'honda', 'yamaha', 'custom', 'parts', 'riding', 'training']
  },
  'wood': {
    keywords: ['woodworking classes', 'lumber yard', 'hardwood supplier', 'woodworking supply'],
    types: ['home_improvement_store', 'furniture_store', 'school'],
    relevantTerms: ['lumber', 'hardwood', 'wood', 'cabinet', 'millwork', 'timber', 'classes', 'workshop']
  },
  'leather': {
    keywords: ['leatherworking classes', 'leather supply', 'upholstery shop', 'leather craft'],
    types: ['store', 'home_goods_store', 'school'],
    relevantTerms: ['leather', 'upholstery', 'craft', 'hide', 'tannery', 'classes', 'workshop']
  },
  'sew': {
    keywords: ['sewing classes', 'fabric store', 'quilting classes', 'sewing machine dealer'],
    types: ['store', 'home_goods_store', 'school'],
    relevantTerms: ['fabric', 'sewing', 'quilt', 'textile', 'notions', 'thread', 'classes', 'lessons']
  },
  'bread': {
    keywords: ['bread baking classes', 'baking school', 'artisan bakery supply', 'culinary school'],
    types: ['store', 'bakery', 'school'],
    relevantTerms: ['baking', 'flour', 'bakery', 'artisan', 'pastry', 'supply', 'classes', 'school']
  },
  'cook': {
    keywords: ['cooking classes', 'culinary school', 'cooking lessons', 'chef training'],
    types: ['school', 'restaurant'],
    relevantTerms: ['cooking', 'culinary', 'chef', 'classes', 'lessons', 'school', 'kitchen']
  },
  'garden': {
    keywords: ['gardening classes', 'nursery plants', 'garden center', 'master gardener program'],
    types: ['florist', 'store', 'home_improvement_store', 'school'],
    relevantTerms: ['nursery', 'garden', 'plant', 'landscape', 'seed', 'greenhouse', 'classes', 'workshop']
  },
  'paint': {
    keywords: ['painting classes', 'art school', 'art supply store', 'artist studio'],
    types: ['store', 'art_gallery', 'school'],
    relevantTerms: ['art', 'paint', 'artist', 'canvas', 'brush', 'supply', 'classes', 'studio', 'lessons']
  },
  'pottery': {
    keywords: ['pottery classes', 'ceramics studio', 'pottery wheel lessons', 'clay studio'],
    types: ['school', 'art_gallery'],
    relevantTerms: ['pottery', 'ceramic', 'clay', 'wheel', 'studio', 'classes', 'lessons', 'workshop']
  },
  'jewelry': {
    keywords: ['jewelry making classes', 'jewelry supply', 'metalsmith workshop', 'bead store'],
    types: ['jewelry_store', 'store', 'school'],
    relevantTerms: ['jewelry', 'gem', 'bead', 'metal', 'silver', 'gold', 'craft', 'classes', 'workshop']
  },
  'music': {
    keywords: ['music lessons', 'music school', 'instrument store', 'music teacher'],
    types: ['school', 'store'],
    relevantTerms: ['music', 'lessons', 'instrument', 'teacher', 'school', 'studio', 'academy']
  },
  'dance': {
    keywords: ['dance classes', 'dance studio', 'dance lessons', 'dance academy'],
    types: ['school', 'gym'],
    relevantTerms: ['dance', 'studio', 'lessons', 'classes', 'ballet', 'academy', 'instructor']
  },
  'yoga': {
    keywords: ['yoga studio', 'yoga classes', 'yoga teacher training', 'meditation center'],
    types: ['gym', 'health'],
    relevantTerms: ['yoga', 'studio', 'classes', 'meditation', 'wellness', 'instructor', 'training']
  }
};

// Extract location/city from topic for dynamic geocoding
function extractLocationFromTopic(topic: string): string | null {
  // Common city/country patterns
  const patterns = [
    /(?:trip to|visit|guide to|exploring|discover|travel to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:travel|vacation|adventure|guide|trip|tour)/i,
    /^(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:bible|secrets|insider|experience)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/,
  ];
  
  for (const pattern of patterns) {
    const match = topic.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      const nonLocations = ['the', 'guide', 'bible', 'book', 'secrets', 'complete', 'ultimate', 'best'];
      if (!nonLocations.includes(location.toLowerCase())) {
        return location;
      }
    }
  }
  
  // Extract any capitalized proper nouns
  const properNouns = topic.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g);
  if (properNouns && properNouns.length > 0) {
    const potentialLocation = properNouns[0];
    const nonLocations = ['The', 'Guide', 'Bible', 'Book', 'Secrets', 'Complete', 'Ultimate', 'Best', 'Pro', 'Master'];
    if (!nonLocations.includes(potentialLocation)) {
      return potentialLocation;
    }
  }
  
  return null;
}

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
    console.log(`Blocked (name match): ${placeName}`);
    return false;
  }
  
  // Block generic retail types
  if (BLOCKED_TYPES.some(blocked => lowerType.includes(blocked.replace(/_/g, ' ')))) {
    console.log(`Blocked (type match): ${placeName} - ${placeType}`);
    return false;
  }
  
  // Prioritize places with specialty keywords
  const hasSpecialtyKeyword = SPECIALTY_KEYWORDS.some(kw => lowerName.includes(kw));
  
  // Must contain at least one relevant term OR have a specialty keyword
  const hasRelevantTerm = relevantTerms.some(term => lowerName.includes(term) || lowerType.includes(term));
  
  if (hasSpecialtyKeyword) {
    console.log(`Accepted (specialty): ${placeName}`);
    return true;
  }
  
  if (hasRelevantTerm) {
    console.log(`Accepted (relevant): ${placeName}`);
    return true;
  }
  
  console.log(`Filtered out (no match): ${placeName}`);
  return false;
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

    // SECURITY: Limit topic length to prevent abuse
    const MAX_TOPIC_LENGTH = 200;
    if (topic && typeof topic === 'string' && topic.length > MAX_TOPIC_LENGTH) {
      console.error('Topic too long:', topic.length, 'chars');
      return new Response(
        JSON.stringify({ error: `Topic must be ${MAX_TOPIC_LENGTH} characters or less` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Extract location from topic for dynamic geocoding
    const extractedLocation = extractLocationFromTopic(topic || '');
    console.log('Extracted location from topic:', extractedLocation);

    // Combine topic keywords with any extracted materials
    const materialsList = Array.isArray(materials) ? materials.slice(0, 3) : [];
    const allRelevantTerms = [...topicConfig.relevantTerms, ...materialsList.map(m => m.toLowerCase())];
    
    let allResults: PlaceResult[] = [];
    
    // DYNAMIC GEOCODING: If we extracted a location from the topic, search there
    // instead of using the user's physical location
    const useExtractedLocation = extractedLocation && (!latitude || !longitude);
    
    // Search with each specialty keyword
    for (const keyword of topicConfig.keywords.slice(0, 2)) {
      // Append extracted location to keyword if available
      const searchKeyword = extractedLocation 
        ? `${keyword} in ${extractedLocation}` 
        : keyword;
      
      // First try 16km (~10 miles)
      const nearResults = await searchPlaces(
        GOOGLE_PLACES_API_KEY,
        searchKeyword,
        useExtractedLocation ? null : latitude,
        useExtractedLocation ? null : longitude,
        16000,
        allRelevantTerms
      );
      
      if (nearResults.length > 0) {
        allResults.push(...nearResults);
      }
    }
    
    // If we don't have enough results, expand to 80km (~50 miles)
    if (allResults.length < 3) {
      console.log('Expanding search radius to 50 miles...');
      
      for (const keyword of topicConfig.keywords) {
        const searchKeyword = extractedLocation 
          ? `${keyword} in ${extractedLocation}` 
          : keyword;
        
        const wideResults = await searchPlaces(
          GOOGLE_PLACES_API_KEY,
          searchKeyword,
          useExtractedLocation ? null : latitude,
          useExtractedLocation ? null : longitude,
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
