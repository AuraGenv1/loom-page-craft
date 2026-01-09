import { forwardRef, useEffect, useState } from 'react';

const LoadingAnimation = forwardRef<HTMLDivElement>((_, ref) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Gathering threads...');

  useEffect(() => {
    const stages = [
      { progress: 15, text: 'Gathering threads...' },
      { progress: 35, text: 'Setting up the loom...' },
      { progress: 55, text: 'Weaving chapters...' },
      { progress: 75, text: 'Adding finishing touches...' },
      { progress: 90, text: 'Almost ready...' },
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        setProgress(stages[currentStage].progress);
        setStatusText(stages[currentStage].text);
        currentStage++;
      }
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={ref} className="min-h-[60vh] flex flex-col items-center justify-center py-24 animate-fade-in">
      {/* Weaving loom animation */}
      <div className="flex items-end gap-2 h-16 mb-10">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-1.5 bg-foreground/80 rounded-full animate-weave"
            style={{
              height: '100%',
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <h2 className="font-serif text-2xl md:text-3xl text-foreground tracking-tight mb-3">
        Weaving your masterpiece...
      </h2>

      {/* Status text */}
      <p className="text-sm text-muted-foreground mb-8 h-5 transition-opacity duration-300">
        {statusText}
      </p>

      {/* Progress bar */}
      <div className="w-64 md:w-80 h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground/70 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Decorative element */}
      <div className="mt-12 flex items-center gap-3 opacity-40">
        <div className="w-8 h-[1px] bg-foreground/30" />
        <div className="flex items-center gap-[2px]">
          <div className="w-[1.5px] h-3 bg-foreground/40 rounded-full" />
          <div className="w-[1.5px] h-3 bg-foreground/40 rounded-full" />
          <div className="w-[1.5px] h-3 bg-foreground/40 rounded-full" />
        </div>
        <div className="w-8 h-[1px] bg-foreground/30" />
      </div>
    </div>
  );
});

LoadingAnimation.displayName = 'LoadingAnimation';

export default LoadingAnimation;

