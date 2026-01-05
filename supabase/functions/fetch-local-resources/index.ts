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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, materials, topic } = await req.json();

    console.log('Fetching local resources:', { latitude, longitude, materials, topic });

    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!GOOGLE_PLACES_API_KEY) {
      console.log('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ resources: [], error: 'Places API not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search query from materials or topic
    const materialsList = Array.isArray(materials) ? materials.slice(0, 3) : [];
    const searchTerms = materialsList.length > 0 
      ? materialsList.join(' OR ') + ' supplies store'
      : `${topic} supplies materials store`;

    console.log('Search terms:', searchTerms);

    const results: PlaceResult[] = [];

    // Try Places API (New) with location bias
    try {
      console.log('Attempting Places API (New) with location bias...');
      
      const requestBody: Record<string, unknown> = {
        textQuery: searchTerms,
        maxResultCount: 5,
      };

      // Add location bias if coordinates provided
      if (latitude && longitude) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: latitude,
              longitude: longitude,
            },
            radius: 25000, // 25km radius
          },
        };
      }

      const response = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.formattedAddress,places.rating,places.userRatingCount,places.id',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Places API (New) response:', JSON.stringify(data).substring(0, 500));

        if (data.places && data.places.length > 0) {
          for (const place of data.places.slice(0, 3)) {
            results.push({
              name: place.displayName?.text || 'Local Business',
              type: place.primaryType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Retail Store',
              address: place.formattedAddress || 'Address not available',
              rating: place.rating || null,
              reviewCount: place.userRatingCount || null,
              placeId: place.id || '',
            });
          }
        }
      } else {
        const errorText = await response.text();
        console.log('Places API (New) failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Places API (New) error:', error);
    }

    // Fallback to Legacy Nearby Search if we have coordinates and no results
    if (results.length === 0 && latitude && longitude) {
      try {
        console.log('Attempting Legacy Nearby Search...');
        
        const nearbyResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=25000&keyword=${encodeURIComponent(searchTerms)}&key=${GOOGLE_PLACES_API_KEY}`
        );

        if (nearbyResponse.ok) {
          const data = await nearbyResponse.json();
          console.log('Legacy Nearby Search status:', data.status);

          if (data.results && data.results.length > 0) {
            for (const place of data.results.slice(0, 3)) {
              results.push({
                name: place.name || 'Local Business',
                type: place.types?.[0]?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Retail Store',
                address: place.vicinity || place.formatted_address || 'Address not available',
                rating: place.rating || null,
                reviewCount: place.user_ratings_total || null,
                placeId: place.place_id || '',
              });
            }
          }
        }
      } catch (error) {
        console.error('Legacy Nearby Search error:', error);
      }
    }

    // Final fallback to Legacy Text Search
    if (results.length === 0) {
      try {
        console.log('Attempting Legacy Text Search...');
        
        let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchTerms)}&key=${GOOGLE_PLACES_API_KEY}`;
        
        if (latitude && longitude) {
          url += `&location=${latitude},${longitude}&radius=25000`;
        }

        const textResponse = await fetch(url);

        if (textResponse.ok) {
          const data = await textResponse.json();
          console.log('Legacy Text Search status:', data.status);

          if (data.results && data.results.length > 0) {
            for (const place of data.results.slice(0, 3)) {
              results.push({
                name: place.name || 'Local Business',
                type: place.types?.[0]?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Retail Store',
                address: place.formatted_address || 'Address not available',
                rating: place.rating || null,
                reviewCount: place.user_ratings_total || null,
                placeId: place.place_id || '',
              });
            }
          }
        }
      } catch (error) {
        console.error('Legacy Text Search error:', error);
      }
    }

    console.log(`Returning ${results.length} places`);

    return new Response(
      JSON.stringify({ resources: results }),
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
