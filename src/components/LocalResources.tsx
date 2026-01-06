import { MapPin, Star, ExternalLink, Package } from "lucide-react";
import { LocalResource } from "@/lib/bookTypes";

interface LocalResourcesProps {
  topic: string;
  resources?: LocalResource[]; // Made optional with '?'
  materials?: string[];
}

const LocalResources = ({ topic, resources = [], materials = [] }: LocalResourcesProps) => {
  // If there is absolutely no data, show a graceful empty state
  if ((!resources || resources.length === 0) && (!materials || materials.length === 0)) {
    return (
      <div className="w-full py-12 text-center border-t border-black/5">
        <p className="text-serif italic text-muted-foreground">Additional resources for {topic} are being curated.</p>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <div className="mb-10 text-center">
        <h2 className="font-serif text-3xl italic mb-2">Curated Resources</h2>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Artisan Series • {topic}</p>
      </div>

      {/* Materials Section */}
      {materials && materials.length > 0 && (
        <div className="mb-12 p-6 bg-secondary/5 rounded-sm border border-black/5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-primary" />
            <h3 className="font-serif text-lg uppercase tracking-tight">Essential Materials</h3>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {materials.map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="w-1 h-1 bg-black/20 rounded-full" />
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
