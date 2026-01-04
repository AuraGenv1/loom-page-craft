import { MapPin, Star, Phone } from 'lucide-react';
import { LocalResource } from '@/lib/bookTypes';

interface LocalResourcesProps {
  topic: string;
  resources?: LocalResource[];
}

interface LocalBusiness {
  name: string;
  type: string;
  address: string;
  rating: number;
  reviewCount: number;
  phone: string;
}

const LocalResources = ({ topic, resources }: LocalResourcesProps) => {
  // Use AI-generated resources or fallback to defaults
  const businesses: LocalBusiness[] = resources?.length
    ? resources.map((res, idx) => ({
        name: res.name,
        type: res.type,
        address: `${123 + idx * 111} Main Street, Your City, ST 12345`,
        rating: 4.7 + (idx * 0.1),
        reviewCount: 100 + idx * 50,
        phone: `(555) ${123 + idx}-${4567 + idx}`,
      }))
    : [
        {
          name: `${topic} Learning Center`,
          type: 'Educational Institution',
          address: '123 Main Street, Your City, ST 12345',
          rating: 4.8,
          reviewCount: 127,
          phone: '(555) 123-4567',
        },
        {
          name: `Expert ${topic} Studio`,
          type: 'Professional Services',
          address: '456 Oak Avenue, Your City, ST 12345',
          rating: 4.9,
          reviewCount: 89,
          phone: '(555) 234-5678',
        },
        {
          name: `Community ${topic} Workshop`,
          type: 'Community Center',
          address: '789 Elm Boulevard, Your City, ST 12345',
          rating: 4.7,
          reviewCount: 203,
          phone: '(555) 345-6789',
        },
      ];

  return (
    <section className="mt-16 pt-10 border-t border-border">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-4 h-4 text-accent" />
        <p className="text-xs uppercase tracking-[0.15em] text-accent font-medium">
          Local Grounding
        </p>
      </div>
      <h2 className="font-serif text-2xl font-semibold mb-6">
        Local Resources for {topic}
      </h2>
      <p className="text-muted-foreground mb-8">
        Connect with these trusted local providers to enhance your learning journey.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {businesses.map((business, index) => (
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
            <div className="flex items-center gap-1 mb-3">
              <Star className="w-3.5 h-3.5 fill-accent text-accent" />
              <span className="text-sm font-medium">{business.rating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">
                ({business.reviewCount} reviews)
              </span>
            </div>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{business.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5" />
                <span>{business.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default LocalResources;
