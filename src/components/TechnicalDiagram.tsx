import { forwardRef } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import WeavingLoader from './WeavingLoader';

interface TechnicalDiagramProps {
  caption: string;
  plateNumber?: string;
  topic?: string;
  isGenerating?: boolean;
  imageUrl?: string | null;
  imageDescription?: string;
}

const TechnicalDiagram = forwardRef<HTMLDivElement, TechnicalDiagramProps>(
  ({ caption, plateNumber = '1.1', topic = '', isGenerating = false, imageUrl, imageDescription }, ref) => {
    const TopicIcon = getTopicIcon(topic);
    // Always show loading state if no image URL yet
    const isLoading = isGenerating || !imageUrl;

    return (
      <div ref={ref} className="w-full my-12 relative">
        {/* Plate container - no padding for full-bleed images */}
        <div className="bg-secondary/20 border border-border/50 shadow-sm overflow-hidden">
        {/* Plate header */}
        <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-border/30">
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium">
            Plate {plateNumber}
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Illustration
          </span>
        </div>

          {/* Full-width image container - completely fills width, no margins */}
          <div className="w-full aspect-video bg-background/50 flex flex-col items-center justify-center relative overflow-hidden">
            {isLoading ? (
              /* ALWAYS show weaving animation when loading */
              <div className="w-full h-full flex flex-col items-center justify-center px-6 gap-4">
                <WeavingLoader text="Weaving..." className="w-full max-w-md" />
                {/* Faint topic icon behind loader */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/10">
                    <TopicIcon className="w-10 h-10 md:w-12 md:h-12 text-foreground/30 stroke-[0.5]" />
                  </div>
                </div>
              </div>
            ) : (
              <img
                src={imageUrl}
                alt={imageDescription || `Instructional diagram: ${caption}`}
                className="w-full h-full object-cover animate-fade-in"
                loading="lazy"
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>

          {/* Stylized caption box - light gray background */}
          <div className="bg-secondary/50 border-t border-border/30 px-4 py-4 md:px-6">
            <p className="text-sm text-muted-foreground italic font-serif text-center">
              Plate {plateNumber} — {caption}
            </p>
            {/* AI-generated image description caption */}
            {imageDescription && !isLoading && (
              <div className="mt-3 pt-3 border-t border-border/20">
                <p className="text-xs text-muted-foreground/80 text-center leading-relaxed max-w-2xl mx-auto">
                  {imageDescription}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

TechnicalDiagram.displayName = 'TechnicalDiagram';

export default TechnicalDiagram;
