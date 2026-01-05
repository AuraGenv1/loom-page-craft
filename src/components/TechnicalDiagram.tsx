import { forwardRef } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import WeavingLoader from './WeavingLoader';

interface TechnicalDiagramProps {
  caption: string;
  plateNumber?: string;
  topic?: string;
  isGenerating?: boolean;
  imageUrl?: string | null;
}

const TechnicalDiagram = forwardRef<HTMLDivElement, TechnicalDiagramProps>(
  ({ caption, plateNumber = '1.1', topic = '', isGenerating = false, imageUrl }, ref) => {
    const TopicIcon = getTopicIcon(topic);
    const isLoading = isGenerating || !imageUrl;

    return (
      <div ref={ref} className="w-full my-12 relative">
        {/* Plate container with deckle edge effect */}
        <div className="bg-secondary/20 border border-border/50 p-8 md:p-12 shadow-sm">
          {/* Plate header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/30">
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium">
              Technical Plate {plateNumber}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
              Instructional Diagram
            </span>
          </div>

          {/* Aspect-video diagram container with blueprint styling */}
          <div className="aspect-video w-full bg-background/50 border border-dashed border-foreground/10 flex flex-col items-center justify-center gap-6 rounded-sm relative overflow-hidden">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center px-6">
                <WeavingLoader text="Weaving..." className="w-full max-w-md" />
              </div>
            ) : (
              <>
                {/* Blueprint grid background */}
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, currentColor 1px, transparent 1px),
                      linear-gradient(to bottom, currentColor 1px, transparent 1px)
                    `,
                    backgroundSize: '20px 20px',
                  }}
                />

                <img
                  src={imageUrl}
                  alt={`Instructional diagram: ${caption}`}
                  className="relative z-10 w-full h-full object-contain p-6 md:p-8 animate-fade-in"
                  loading="lazy"
                  crossOrigin="anonymous"
                />

                {/* Connecting annotation lines */}
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                  <div className="text-[8px] uppercase tracking-widest text-foreground/20">REF: {plateNumber}</div>
                  <div className="text-[8px] uppercase tracking-widest text-foreground/20">SCALE: 1:1</div>
                </div>
              </>
            )}

            {/* If we have no image yet, still show a faint topic mark behind loader (never blank) */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/10">
                  <TopicIcon className="w-10 h-10 md:w-12 md:h-12 text-foreground/10 stroke-[0.5]" />
                </div>
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="mt-6 pt-4 border-t border-border/30 text-center">
            <p className="text-sm text-muted-foreground italic font-serif">
              Plate {plateNumber} — {caption}
            </p>
          </div>
        </div>
      </div>
    );
  }
);

TechnicalDiagram.displayName = 'TechnicalDiagram';

export default TechnicalDiagram;

