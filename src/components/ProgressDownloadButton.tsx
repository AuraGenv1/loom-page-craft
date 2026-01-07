import { Download } from 'lucide-react';
import { useMemo } from 'react';

interface ProgressDownloadButtonProps {
  completedChapters: number;
  totalChapters?: number;
  onClick: () => void;
  disabled?: boolean;
}

const ProgressDownloadButton = ({
  completedChapters,
  totalChapters = 10,
  onClick,
  disabled = false,
}: ProgressDownloadButtonProps) => {
  const progress = useMemo(() => {
    return Math.round((completedChapters / totalChapters) * 100);
  }, [completedChapters, totalChapters]);

  const isComplete = completedChapters >= totalChapters;
  const isWeaving = completedChapters < totalChapters;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress Button with left-to-right fill */}
      <button
        onClick={onClick}
        disabled={disabled || !isComplete}
        className="relative overflow-hidden min-w-[280px] h-12 rounded border border-foreground/20 font-serif text-base transition-all duration-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-90"
        style={{
          background: 'hsl(var(--muted))',
        }}
      >
        {/* Progress fill bar - moves left to right */}
        <div 
          className="absolute inset-0 bg-foreground transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
          }}
        />
        
        {/* Button text with mix-blend for contrast */}
        <span 
          className="relative z-10 flex items-center justify-center gap-2 h-full px-6"
          style={{
            mixBlendMode: 'difference',
            color: 'hsl(var(--muted))',
          }}
        >
          <Download className="w-4 h-4" />
          <span>Download Full Guide (PDF)</span>
        </span>
      </button>
      
      {/* Elegant italic status text - centered below button */}
      {isWeaving && (
        <p className="text-sm text-muted-foreground font-serif italic text-center">
          Our Artisan is weaving your custom details...
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
