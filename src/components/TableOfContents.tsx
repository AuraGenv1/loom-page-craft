import { forwardRef } from 'react';
import { Check, Lock, Loader2, Clock } from 'lucide-react';
import { ChapterInfo } from '@/lib/bookTypes';
import WeavingLoader from './WeavingLoader';

interface TableOfContentsProps {
  topic: string;
  chapters?: ChapterInfo[];
  allUnlocked?: boolean; // When true (admin/purchased), all chapters show as unlocked
  onChapterClick?: (chapterNumber: number) => void;
  activeChapter?: number;
  chapterStatuses?: Record<number, 'drafting' | 'complete' | 'pending'>; // UI state per chapter
  loadingChapter?: number | null; // Currently generating chapter
  chapterContent?: Record<number, string | undefined>; // Actual chapter content for realtime sync
}

const TableOfContents = forwardRef<HTMLDivElement, TableOfContentsProps>(
  (
    {
      topic,
      chapters,
      allUnlocked = false,
      onChapterClick,
      activeChapter,
      chapterStatuses = {},
      loadingChapter,
      chapterContent = {},
    },
    ref
  ) => {
    // Use AI-generated chapters or fallback to defaults
    // If allUnlocked is true (admin or purchased), mark all as unlocked
    // REALTIME SYNC: Use chapterContent to determine if chapter has content (ready)
    const displayChapters = chapters?.length
      ? chapters.map((ch, idx) => {
          const isUnlocked = allUnlocked || idx === 0;
          const hasContent = idx === 0 || !!chapterContent[ch.chapter];
          const isLoading = loadingChapter === ch.chapter;

          const status: 'complete' | 'drafting' | 'pending' | undefined = hasContent
            ? 'complete'
            : isUnlocked
              ? (isLoading ? 'drafting' : (chapterStatuses[ch.chapter] ?? 'pending'))
              : undefined;

          return {
            number: ch.chapter,
            title: ch.title,
            isUnlocked,
            status,
            isLoading,
          };
        })
      : [
          { number: 1, title: `Introduction to ${topic}`, isUnlocked: true, status: 'complete' as const, isLoading: false },
          { number: 2, title: 'Understanding the Fundamentals', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 3, title: 'Essential Tools & Materials', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 4, title: 'Getting Started: Step-by-Step', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 5, title: 'Common Mistakes to Avoid', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 6, title: 'Advanced Techniques', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 7, title: 'Troubleshooting Guide', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 8, title: 'Expert Tips & Tricks', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 9, title: 'Real-World Applications', isUnlocked: allUnlocked, status: undefined, isLoading: false },
          { number: 10, title: 'Your Next Steps', isUnlocked: allUnlocked, status: undefined, isLoading: false },
        ];

    const handleChapterClick = (chapter: { number: number; isUnlocked: boolean; status?: string }) => {
      // Only allow click if chapter is unlocked AND has content (complete)
      if (chapter.isUnlocked && chapter.status === 'complete' && onChapterClick) {
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
            const isDrafting = chapter.isLoading || chapter.status === 'drafting';
            const isPending = chapter.status === 'pending';
            const isComplete = chapter.status === 'complete';
            const canClick = chapter.isUnlocked && isComplete;

            return (
              <div
                key={chapter.number}
                onClick={() => handleChapterClick(chapter)}
                className={`group flex items-center justify-between py-4 px-5 rounded-lg transition-all duration-200 ${
                  canClick
                    ? 'hover:bg-secondary/60 cursor-pointer'
                    : isDrafting
                      ? 'opacity-90'
                      : isPending
                        ? 'opacity-75'
                        : 'opacity-60'
                } ${isActive ? 'bg-secondary/80 ring-1 ring-accent/20' : ''}`}
              >
                <div className="flex items-center gap-5">
                  <span
                    className={`font-serif text-xl md:text-2xl w-10 tabular-nums ${
                      isActive ? 'text-accent' : isDrafting ? 'text-foreground/80' : 'text-muted-foreground/60'
                    }`}
                  >
                    {chapter.number.toString().padStart(2, '0')}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className={`font-serif text-base md:text-lg ${
                        canClick ? 'text-foreground' : isDrafting ? 'text-foreground/80' : 'text-muted-foreground'
                      } ${isActive ? 'font-medium' : ''}`}
                    >
                      {chapter.title}
                    </span>

                    {/* Status badges */}
                    {isDrafting && (
                      <div className="flex items-center gap-2 mt-1">
                        <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                          Drafting...
                        </span>
                      </div>
                    )}
                    {isPending && chapter.isUnlocked && (
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                          Pending
                        </span>
                      </div>
                    )}
                    {isComplete && chapter.isUnlocked && !isActive && (
                      <span className="text-[10px] uppercase tracking-widest text-accent mt-0.5">Expand →</span>
                    )}
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-widest text-accent mt-0.5 font-medium">Reading</span>
                    )}
                    {!chapter.isUnlocked && !isDrafting && (
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mt-0.5">Locked</span>
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

                  {isDrafting ? (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                    </div>
                  ) : isComplete && chapter.isUnlocked ? (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isActive ? 'bg-accent/20' : 'bg-accent/10'}`}>
                      <Check className="w-3.5 h-3.5 text-accent" />
                    </div>
                  ) : isPending && chapter.isUnlocked ? (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <Clock className="w-3 h-3 text-muted-foreground" />
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

