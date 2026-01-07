import { forwardRef, useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { ChapterInfo } from '@/lib/bookTypes';

interface TableOfContentsProps {
  topic: string;
  chapters?: ChapterInfo[];
  allUnlocked?: boolean; // When true (admin/purchased), all chapters show as unlocked
  onChapterClick?: (chapterNumber: number) => void;
  activeChapter?: number;
}

const TableOfContents = forwardRef<HTMLDivElement, TableOfContentsProps>(
  ({ topic, chapters, allUnlocked = false, onChapterClick, activeChapter }, ref) => {
    // Use AI-generated chapters or fallback to defaults
    // If allUnlocked is true (admin or purchased), mark all as unlocked
    const displayChapters = chapters?.length
      ? chapters.map((ch, idx) => ({
          number: ch.chapter,
          title: ch.title,
          isUnlocked: allUnlocked || idx === 0,
        }))
      : [
          { number: 1, title: `Introduction to ${topic}`, isUnlocked: true },
          { number: 2, title: 'Understanding the Fundamentals', isUnlocked: allUnlocked },
          { number: 3, title: 'Essential Tools & Materials', isUnlocked: allUnlocked },
          { number: 4, title: 'Getting Started: Step-by-Step', isUnlocked: allUnlocked },
          { number: 5, title: 'Common Mistakes to Avoid', isUnlocked: allUnlocked },
          { number: 6, title: 'Advanced Techniques', isUnlocked: allUnlocked },
          { number: 7, title: 'Troubleshooting Guide', isUnlocked: allUnlocked },
          { number: 8, title: 'Expert Tips & Tricks', isUnlocked: allUnlocked },
          { number: 9, title: 'Real-World Applications', isUnlocked: allUnlocked },
          { number: 10, title: 'Your Next Steps', isUnlocked: allUnlocked },
        ];

    const handleChapterClick = (chapter: { number: number; isUnlocked: boolean }) => {
      if (chapter.isUnlocked && onChapterClick) {
        onChapterClick(chapter.number);
      }
    };

    return (
      <div ref={ref} className="w-full max-w-2xl mx-auto py-12 animate-fade-up animation-delay-200">
        {/* Decorative header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-[1px] bg-foreground/15" />
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
            <div className="w-16 h-[1px] bg-foreground/15" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Contents</p>
          <h2 className="font-serif text-3xl md:text-4xl font-medium text-foreground">Table of Contents</h2>
        </div>

        {/* Chapters list */}
        <div className="space-y-1 border-t border-b border-border/30 py-6">
          {displayChapters.map((chapter) => {
            const isActive = activeChapter === chapter.number;
            return (
              <div
                key={chapter.number}
                onClick={() => handleChapterClick(chapter)}
                className={`group flex items-center justify-between py-4 px-5 rounded-lg transition-all duration-200 ${
                  chapter.isUnlocked ? 'hover:bg-secondary/60 cursor-pointer' : 'opacity-60'
                } ${isActive ? 'bg-secondary/80 ring-1 ring-accent/20' : ''}`}
              >
                <div className="flex items-center gap-5">
                  <span className={`font-serif text-xl md:text-2xl w-10 tabular-nums ${
                    isActive ? 'text-accent' : 'text-muted-foreground/60'
                  }`}>
                    {chapter.number.toString().padStart(2, '0')}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className={`font-serif text-base md:text-lg ${
                        chapter.isUnlocked ? 'text-foreground' : 'text-muted-foreground'
                      } ${isActive ? 'font-medium' : ''}`}
                    >
                      {chapter.title}
                    </span>
                    {chapter.isUnlocked && !isActive && (
                      <span className="text-[10px] uppercase tracking-widest text-accent mt-0.5">Available</span>
                    )}
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-widest text-accent mt-0.5 font-medium">Reading</span>
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
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-accent/20' : 'bg-accent/10'
                    }`}>
                      <Check className={`w-3.5 h-3.5 ${isActive ? 'text-accent' : 'text-accent'}`} />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
  }
);

TableOfContents.displayName = 'TableOfContents';

export default TableOfContents;

