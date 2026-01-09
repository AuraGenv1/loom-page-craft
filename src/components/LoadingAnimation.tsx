import { forwardRef, useEffect, useState } from 'react';

const LoadingAnimation = forwardRef<HTMLDivElement>((_, ref) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simple, steady progress animation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 8 + 2;
      });
    }, 800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={ref} className="min-h-[60vh] flex flex-col items-center justify-center py-24 animate-fade-in">
      {/* Simple loading bar */}
      <div className="w-64 md:w-80 mb-8">
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground/70 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(progress, 95)}%` }}
          />
        </div>
      </div>

      {/* Simple status text */}
      <p className="font-serif text-lg text-muted-foreground">
        Generating your guide...
      </p>
    </div>
  );
});

LoadingAnimation.displayName = 'LoadingAnimation';

export default LoadingAnimation;
