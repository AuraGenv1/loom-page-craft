import { MapPin, Star, ExternalLink } from "lucide-react";
import { LocalResource } from "@/lib/bookTypes";

interface LocalResourcesProps {
  topic: string;
  resources: LocalResource[];
}

const LocalResources = ({ topic, resources }: LocalResourcesProps) => {
  return (
    <div className="w-full py-8">
      <div className="mb-10 text-center">
        <h2 className="font-serif text-3xl italic mb-2">Curated Resources</h2>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Premium Providers for {topic}</p>
      </div>

      <div className="grid gap-8">
        {resources.map((resource, index) => (
          <div key={index} className="border-b border-black/5 pb-8 last:border-0">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-serif text-xl mb-1">{resource.name}</h3>
                <p className="text-[10px] uppercase tracking-widest text-primary/70 font-medium">{resource.type}</p>
              </div>
              {resource.rating && (
                <div className="flex items-center gap-1 bg-secondary/30 px-2 py-1 rounded">
                  <Star className="w-3 h-3 fill-primary text-primary" />
                  <span className="text-xs font-medium">{resource.rating}</span>
                </div>
              )}
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground mb-4">{resource.description}</p>

            {resource.address && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                <MapPin className="w-3 h-3" />
                <span>{resource.address}</span>
              </div>
            )}

            {resource.placeId && (
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${resource.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-[10px] uppercase tracking-tighter font-bold hover:text-primary transition-colors"
              >
                View on Map <ExternalLink className="w-2 h-2" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LocalResources;
