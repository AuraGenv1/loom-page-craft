import { MapPin, Star, ExternalLink, Package } from "lucide-react";
import { LocalResource } from "@/lib/bookTypes";

interface LocalResourcesProps {
  topic: string;
  resources: LocalResource[];
  materials?: string[]; // Added this to fix the TS2322 error
}

const LocalResources = ({ topic, resources, materials }: LocalResourcesProps) => {
  return (
    <div className="w-full py-8">
      <div className="mb-10 text-center">
        <h2 className="font-serif text-3xl italic mb-2">Curated Resources</h2>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Premium Providers & Materials for {topic}
        </p>
      </div>

      {/* Materials Section - If provided */}
      {materials && materials.length > 0 && (
        <div className="mb-12 p-6 bg-secondary/10 rounded-lg border border-black/5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-primary" />
            <h3 className="font-serif text-lg">Essential Materials</h3>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {materials.map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="w-1 h-1 bg-primary rounded-full" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resources Grid */}
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default LocalResources;
