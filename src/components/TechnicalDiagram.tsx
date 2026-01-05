import { getTopicIcon } from '@/lib/iconMap';
import { LucideIcon } from 'lucide-react';
import WeavingLoader from './WeavingLoader';
import { useState, useEffect } from 'react';

interface TechnicalDiagramProps {
  caption: string;
  plateNumber?: string;
  topic?: string;
}

const TechnicalDiagram = ({ caption, plateNumber = "1.1", topic = "" }: TechnicalDiagramProps) => {
  const TopicIcon = getTopicIcon(topic);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate image loading (in real implementation this would be an actual image load)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500 + Math.random() * 1000); // 1.5-2.5 seconds

    return () => clearTimeout(timer);
  }, [topic]);

  return (
    <div className="w-full my-12 relative">
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
            <WeavingLoader text="Weaving diagram..." />
          ) : (
            <>
              {/* Blueprint grid background */}
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `
                  linear-gradient(to right, currentColor 1px, transparent 1px),
                  linear-gradient(to bottom, currentColor 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px'
              }} />
              
              {/* Blueprint-styled topic icon */}
              <div className="relative animate-fade-in">
                {/* Outer measurement circle */}
                <div className="absolute -inset-8 rounded-full border border-dashed border-foreground/10" />
                <div className="absolute -inset-4 rounded-full border border-foreground/8" />
                
                {/* Main icon container */}
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-foreground/15 flex items-center justify-center bg-secondary/30">
                  <TopicIcon className="w-10 h-10 md:w-12 md:h-12 text-foreground/20 stroke-[0.5]" />
                </div>
                
                {/* Corner measurement marks */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[1px] h-4 bg-foreground/10" />
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-[1px] h-4 bg-foreground/10" />
                <div className="absolute top-1/2 -left-12 -translate-y-1/2 w-4 h-[1px] bg-foreground/10" />
                <div className="absolute top-1/2 -right-12 -translate-y-1/2 w-4 h-[1px] bg-foreground/10" />
              </div>

              {/* Connecting annotation lines */}
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                <div className="text-[8px] uppercase tracking-widest text-foreground/20">REF: {plateNumber}</div>
                <div className="text-[8px] uppercase tracking-widest text-foreground/20">SCALE: 1:1</div>
              </div>
            </>
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
};

export default TechnicalDiagram;
