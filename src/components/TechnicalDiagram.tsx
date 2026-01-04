import { Lightbulb } from 'lucide-react';

interface TechnicalDiagramProps {
  caption: string;
}

const TechnicalDiagram = ({ caption }: TechnicalDiagramProps) => {
  return (
    <div className="w-full my-8 p-8 bg-secondary/30 rounded-lg border border-border">
      {/* Minimalist technical diagram placeholder */}
      <div className="aspect-video max-w-md mx-auto flex flex-col items-center justify-center gap-6">
        {/* Abstract geometric representation */}
        <div className="relative w-full h-32">
          {/* Center node */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-foreground/30 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-foreground/50" />
          </div>
          {/* Connecting lines */}
          <div className="absolute left-1/4 top-1/2 w-1/4 h-[1px] bg-foreground/20" />
          <div className="absolute right-1/4 top-1/2 w-1/4 h-[1px] bg-foreground/20" />
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[1px] h-1/4 bg-foreground/20" />
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[1px] h-1/4 bg-foreground/20" />
          {/* Outer nodes */}
          <div className="absolute left-1/4 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground/10" />
          <div className="absolute right-1/4 top-1/2 translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground/10" />
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-6 h-6 rounded-full bg-foreground/10" />
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-6 h-6 rounded-full bg-foreground/10" />
        </div>
        {/* Caption */}
        <p className="text-sm text-muted-foreground italic text-center">
          Fig 1.1 — {caption}
        </p>
      </div>
    </div>
  );
};

export default TechnicalDiagram;
