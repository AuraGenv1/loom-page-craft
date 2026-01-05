import { useState, useEffect } from 'react';
import { MapPin, Star, ExternalLink, Loader2, MapPinOff } from 'lucide-react';
import { LocalResource } from '@/lib/bookTypes';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface LocalResourcesProps {
  topic: string;
  resources?: LocalResource[];
  materials?: string[];
}

interface FetchedResource {
  name: string;
  type: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  placeId: string;
}

const LocalResources = ({ topic, resources, materials }: LocalResourcesProps) => {
  const [fetchedResources, setFetchedResources] = useState<FetchedResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);

  const fetchLocalResources = async (latitude: number, longitude: number) => {
    setIsLoading(true);
    setLocationError(null);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-local-resources', {
        body: { 
          latitude, 
          longitude, 
          materials: materials || [],
          topic 
        }
      });

      if (error) {
        console.error('Error fetching local resources:', error);
        setLocationError('Unable to find local resources');
        return;
      }

      if (data?.resources && data.resources.length > 0) {
        setFetchedResources(data.resources);
      } else {
        setLocationError('No local suppliers found in your area');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setLocationError('Failed to fetch local resources');
    } finally {
      setIsLoading(false);
      setHasAttemptedFetch(true);
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setHasAttemptedFetch(true);
      return;
    }

    setIsLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchLocalResources(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setIsLoading(false);
        setHasAttemptedFetch(true);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access denied. Enable location to see nearby suppliers.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  // Use fetched resources if available, otherwise show placeholder UI
  const displayResources = fetchedResources.length > 0 ? fetchedResources : null;

  // Fallback to AI-generated resources with placeholder addresses
  const fallbackResources = resources?.map((res, idx) => ({
    name: res.name,
    type: res.type,
    address: res.address || res.description || 'Address available after location access',
    rating: res.rating ?? null,
    reviewCount: res.reviewCount ?? null,
    placeId: res.placeId || '',
  }));

  return (
    <section className="mt-16 pt-10 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-accent" />
          <p className="text-xs uppercase tracking-[0.15em] text-accent font-medium">
            Local Grounding
          </p>
        </div>
      </div>
      <h2 className="font-serif text-2xl font-semibold mb-6">
        Local Resources for {topic}
      </h2>
      
      {!hasAttemptedFetch && !displayResources && (
        <div className="bg-secondary/30 border border-border rounded-lg p-6 text-center mb-8">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            Find material suppliers and workshops near you
          </p>
          <Button 
            onClick={requestLocation} 
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Finding nearby places...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                Enable Location
              </>
            )}
          </Button>
        </div>
      )}

      {locationError && !displayResources && (
        <div className="bg-secondary/30 border border-border rounded-lg p-6 text-center mb-8">
          <MapPinOff className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">{locationError}</p>
          <Button 
            onClick={requestLocation} 
            variant="outline"
            disabled={isLoading}
            className="gap-2"
          >
            Try Again
          </Button>
        </div>
      )}

      {isLoading && hasAttemptedFetch && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Searching nearby...</span>
        </div>
      )}

      {displayResources && displayResources.length > 0 && (
        <>
          <p className="text-muted-foreground mb-8">
            Connect with these trusted local providers to enhance your learning journey.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            {displayResources.map((business, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-lg p-5 hover:shadow-card transition-shadow"
              >
                <div className="mb-3">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {business.type}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground mb-2 leading-tight">
                  {business.name}
                </h3>
                {(business.rating !== null && business.rating > 0) && (
                  <div className="flex items-center gap-1 mb-3">
                    <Star className="w-3.5 h-3.5 fill-accent text-accent" />
                    <span className="text-sm font-medium">{business.rating.toFixed(1)}</span>
                    {business.reviewCount !== null && business.reviewCount > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({business.reviewCount.toLocaleString()} reviews)
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{business.address}</span>
                  </div>
                </div>
                {business.placeId && (
                  <a
                    href={`https://www.google.com/maps/place/?q=place_id:${business.placeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-3"
                  >
                    View on Maps
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Show AI-generated fallback if location not enabled and we have resources */}
      {!displayResources && fallbackResources && fallbackResources.length > 0 && hasAttemptedFetch && !isLoading && (
        <>
          <p className="text-muted-foreground mb-8">
            Enable location access to see real suppliers near you. Here are some general recommendations:
          </p>

          <div className="grid gap-4 md:grid-cols-3 opacity-70">
            {fallbackResources.map((business, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-lg p-5"
              >
                <div className="mb-3">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {business.type}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground mb-2 leading-tight">
                  {business.name}
                </h3>
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span className="italic">{business.address}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Google Attribution */}
      <div className="flex items-center justify-end mt-6 gap-2">
        <span className="text-[10px] text-muted-foreground/60">Powered by</span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 272 92" 
          className="h-4 opacity-60"
          aria-label="Google"
        >
          <path fill="#4285F4" d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"/>
          <path fill="#EA4335" d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"/>
          <path fill="#FBBC05" d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z"/>
          <path fill="#4285F4" d="M225 3v65h-9.5V3h9.5z"/>
          <path fill="#34A853" d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z"/>
          <path fill="#EA4335" d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z"/>
        </svg>
      </div>
    </section>
  );
};

export default LocalResources;
