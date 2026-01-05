import { cn } from '@/lib/utils';

interface WeavingLoaderProps {
  text?: string;
  className?: string;
}

const WeavingLoader = ({ text = 'Weaving...', className }: WeavingLoaderProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      {/* Weaving animation container */}
      <div className="relative w-full h-12 overflow-hidden rounded-lg bg-secondary/30">
        {/* Animated weaving bars */}
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-foreground/30 rounded-full animate-weave"
              style={{
                height: '70%',
                animationDelay: `${i * 80}ms`,
                animationDuration: '1s',
              }}
            />
          ))}
        </div>
        
        {/* Horizontal traveling pulse */}
        <div 
          className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-foreground/10 to-transparent animate-pulse-travel"
          style={{
            animation: 'pulse-travel 2s ease-in-out infinite',
          }}
        />
      </div>
      
      {/* Weaving text */}
      <p className="text-xs text-muted-foreground/70 italic font-serif tracking-wide animate-pulse">
        {text}
      </p>
    </div>
  );
};

export default WeavingLoader;
