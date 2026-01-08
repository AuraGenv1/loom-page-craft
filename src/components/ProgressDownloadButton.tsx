import { Download, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

interface ProgressDownloadButtonProps {
  completedChapters: number;
  totalChapters?: number;
  onClick: () => void;
  disabled?: boolean;
  isPurchased?: boolean;
  isCompiling?: boolean;
}

const ProgressDownloadButton = ({
  completedChapters,
  totalChapters = 10,
  onClick,
  disabled = false,
  isPurchased = false,
  isCompiling = false,
}: ProgressDownloadButtonProps) => {
  const progress = useMemo(() => {
    return Math.round((completedChapters / totalChapters) * 100);
  }, [completedChapters, totalChapters]);

  const isComplete = completedChapters >= totalChapters;
  const isWeaving = completedChapters < totalChapters;

  // For purchased users: must wait for all 10 chapters
  const canDownload = isPurchased ? isComplete && !isCompiling : !disabled;
  
  // Button label based on state
  const getButtonLabel = () => {
    if (isCompiling) {
      return 'Compiling your high-quality PDF...';
    }
    if (isPurchased && !isComplete) {
      return `Weaving... ${completedChapters}/${totalChapters} chapters`;
    }
    return 'Download Full Guide (PDF)';
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress Button with left-to-right fill */}
      <button
        onClick={onClick}
        disabled={!canDownload}
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
        
        {/* Button text - use mix-blend-mode for automatic contrast */}
        <span 
          className="relative z-10 flex items-center justify-center gap-2 h-full px-6 font-serif"
          style={{
            mixBlendMode: 'difference',
            color: 'white',
          }}
        >
          {isCompiling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="font-medium">{getButtonLabel()}</span>
        </span>
      </button>
      
      {/* Elegant italic status text - centered below button */}
      {isWeaving && !isCompiling && (
        <p className="text-sm text-muted-foreground font-serif italic text-center">
          {isPurchased 
            ? `Please wait while we weave all ${totalChapters} chapters...`
            : 'Our Artisan is weaving your custom details...'
          }
        </p>
      )}
      
      {isCompiling && (
        <p className="text-sm text-muted-foreground font-serif italic text-center">
          Preparing your premium PDF with all diagrams and formatting...
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
