import { forwardRef, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const LoadingAnimation = forwardRef<HTMLDivElement>((_, ref) => {
  const [progress, setProgress] = useState(0);
  const [currentStageKey, setCurrentStageKey] = useState('weaving_step1');
  const { t } = useLanguage();

  useEffect(() => {
    const stages = [
      { progress: 15, key: 'weaving_step1' },
      { progress: 35, key: 'weaving_step2' },
      { progress: 55, key: 'weaving_step3' },
      { progress: 75, key: 'weaving_step4' },
      { progress: 90, key: 'weaving_step5' },
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        setProgress(stages[currentStage].progress);
        setCurrentStageKey(stages[currentStage].key);
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

      {/* Title - uses translated 'weaving' key */}
      <h2 className="font-serif text-2xl md:text-3xl text-foreground tracking-tight mb-3">
        {t('weaving')}
      </h2>

      {/* Status text - translated */}
      <p className="text-sm text-muted-foreground mb-8 h-5 transition-opacity duration-300">
        {t(currentStageKey)}
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
