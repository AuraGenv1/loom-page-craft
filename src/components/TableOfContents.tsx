import { Check, Lock } from 'lucide-react';
import { ChapterInfo } from '@/lib/bookTypes';

interface TableOfContentsProps {
  topic: string;
  chapters?: ChapterInfo[];
}

const TableOfContents = ({ topic, chapters }: TableOfContentsProps) => {
  // Use AI-generated chapters or fallback to defaults
  const displayChapters = chapters?.length
    ? chapters.map((ch, idx) => ({
        number: ch.chapter,
        title: ch.title,
        isUnlocked: idx === 0,
      }))
    : [
        { number: 1, title: `Introduction to ${topic}`, isUnlocked: true },
        { number: 2, title: 'Understanding the Fundamentals', isUnlocked: false },
        { number: 3, title: 'Essential Tools & Materials', isUnlocked: false },
        { number: 4, title: 'Getting Started: Step-by-Step', isUnlocked: false },
        { number: 5, title: 'Common Mistakes to Avoid', isUnlocked: false },
        { number: 6, title: 'Advanced Techniques', isUnlocked: false },
        { number: 7, title: 'Troubleshooting Guide', isUnlocked: false },
        { number: 8, title: 'Expert Tips & Tricks', isUnlocked: false },
        { number: 9, title: 'Real-World Applications', isUnlocked: false },
        { number: 10, title: 'Your Next Steps', isUnlocked: false },
      ];

  return (
    <div className="w-full max-w-2xl mx-auto py-12 animate-fade-up animation-delay-200">
      {/* Decorative header */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="w-16 h-[1px] bg-foreground/15" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
          <div className="w-16 h-[1px] bg-foreground/15" />
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Contents
        </p>
        <h2 className="font-serif text-3xl md:text-4xl font-medium text-foreground">
          Table of Contents
        </h2>
      </div>

      {/* Chapters list */}
      <div className="space-y-1 border-t border-b border-border/30 py-6">
        {displayChapters.map((chapter, idx) => (
          <div
            key={chapter.number}
            className={`group flex items-center justify-between py-4 px-5 rounded-lg transition-all duration-200 ${
              chapter.isUnlocked
                ? 'hover:bg-secondary/60 cursor-pointer'
                : 'opacity-60'
            }`}
          >
            <div className="flex items-center gap-5">
              <span className="font-serif text-xl md:text-2xl text-muted-foreground/60 w-10 tabular-nums">
                {chapter.number.toString().padStart(2, '0')}
              </span>
              <div className="flex flex-col">
                <span className={`font-serif text-base md:text-lg ${chapter.isUnlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {chapter.title}
                </span>
                {chapter.isUnlocked && (
                  <span className="text-[10px] uppercase tracking-widest text-accent mt-0.5">
                    Available
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Decorative dots leading to icon */}
              <div className="hidden md:flex items-center gap-1 opacity-30">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-0.5 h-0.5 rounded-full bg-foreground/40" />
                ))}
              </div>
              {chapter.isUnlocked ? (
                <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-accent" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer decoration */}
      <div className="flex items-center justify-center mt-8">
        <div className="flex items-center gap-2 opacity-40">
          <div className="w-8 h-[1px] bg-foreground/30" />
          <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase font-serif">
            {displayChapters.length} Chapters
          </span>
          <div className="w-8 h-[1px] bg-foreground/30" />
        </div>
      </div>
    </div>
  );
};

export default TableOfContents;
