import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
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
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Button
          onClick={onClick}
          size="lg"
          disabled={disabled || !isComplete}
          className="relative overflow-hidden gap-2 font-serif min-w-[260px] transition-all duration-500"
          style={{
            background: isComplete 
              ? undefined 
              : `linear-gradient(to right, hsl(var(--foreground)) ${progress}%, hsl(var(--muted)) ${progress}%)`,
            color: isComplete ? undefined : progress > 50 ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
          }}
        >
          {isWeaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Weaving Guide...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download Full Guide (PDF)</span>
            </>
          )}
        </Button>
      </div>
      
      {/* Status text - clearly separated below button */}
      {isWeaving && (
        <p className="text-sm text-amber-600 dark:text-amber-400 font-medium animate-pulse">
          ✨ {completedChapters} of {totalChapters} chapters ready
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
