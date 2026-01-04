import { Lightbulb } from 'lucide-react';

interface TechnicalDiagramProps {
  caption: string;
  plateNumber?: string;
}

const TechnicalDiagram = ({ caption, plateNumber = "1.1" }: TechnicalDiagramProps) => {
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

        {/* Aspect-video diagram container */}
        <div className="aspect-video w-full bg-background/50 border border-dashed border-foreground/10 flex flex-col items-center justify-center gap-6 rounded-sm">
          {/* Abstract geometric representation */}
          <div className="relative w-full max-w-sm h-32">
            {/* Center node */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border border-foreground/20 flex items-center justify-center bg-secondary/30">
              <Lightbulb className="w-6 h-6 text-foreground/40 stroke-[1.5]" />
            </div>
            {/* Connecting lines */}
            <div className="absolute left-1/4 top-1/2 w-1/4 h-[1px] bg-foreground/15" />
            <div className="absolute right-1/4 top-1/2 w-1/4 h-[1px] bg-foreground/15" />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[1px] h-1/4 bg-foreground/15" />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[1px] h-1/4 bg-foreground/15" />
            {/* Outer nodes */}
            <div className="absolute left-1/4 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10" />
            <div className="absolute right-1/4 top-1/2 translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10" />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10" />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10" />
          </div>
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
