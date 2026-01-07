import { forwardRef, useImperativeHandle, useRef } from 'react';
import { LocalResource, ChapterInfo } from '@/lib/bookTypes';
import { AlertTriangle } from 'lucide-react';
import WeavingLoader from '@/components/WeavingLoader';

interface AllChaptersContentProps {
  topic: string;
  bookData: {
    chapter1Content?: string;
    chapter2Content?: string;
    chapter3Content?: string;
    chapter4Content?: string;
    chapter5Content?: string;
    chapter6Content?: string;
    chapter7Content?: string;
    chapter8Content?: string;
    chapter9Content?: string;
    chapter10Content?: string;
    localResources?: LocalResource[];
    hasDisclaimer?: boolean;
    tableOfContents?: ChapterInfo[];
  };
  loadingChapter?: number | null;
  isFullAccess?: boolean;
}

export interface AllChaptersContentHandle {
  scrollToChapter: (chapterNumber: number) => void;
  getChapterRefs: () => (HTMLElement | null)[];
}

const AllChaptersContent = forwardRef<AllChaptersContentHandle, AllChaptersContentProps>(
  ({ topic, bookData, loadingChapter, isFullAccess }, ref) => {
    const chapterRefs = useRef<(HTMLElement | null)[]>([]);

    useImperativeHandle(ref, () => ({
      scrollToChapter: (chapterNumber: number) => {
        const idx = chapterNumber - 1;
        const el = chapterRefs.current[idx];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      getChapterRefs: () => chapterRefs.current,
    }));

    const chapters = [
      { number: 1, content: bookData.chapter1Content },
      { number: 2, content: bookData.chapter2Content },
      { number: 3, content: bookData.chapter3Content },
      { number: 4, content: bookData.chapter4Content },
      { number: 5, content: bookData.chapter5Content },
      { number: 6, content: bookData.chapter6Content },
      { number: 7, content: bookData.chapter7Content },
      { number: 8, content: bookData.chapter8Content },
      { number: 9, content: bookData.chapter9Content },
      { number: 10, content: bookData.chapter10Content },
    ];

    const getChapterTitle = (chapterNumber: number): string => {
      const tocEntry = bookData.tableOfContents?.find(ch => ch.chapter === chapterNumber);
      return tocEntry?.title || `Chapter ${chapterNumber}`;
    };

    const renderContent = (content: string | undefined, chapterNumber: number, hasDisclaimer?: boolean) => {
      const isLoading = loadingChapter === chapterNumber;
      
      if (!content) {
        // For full access users (admins/purchased), show weaving state
        if (isFullAccess) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {isLoading ? (
                <WeavingLoader text="Weaving chapter content..." className="w-full max-w-md" />
              ) : (
                <WeavingLoader text="Preparing to weave this chapter..." className="w-full max-w-md" />
              )}
              <p className="text-sm text-muted-foreground/60 mt-4">
                This may take a moment for comprehensive content
              </p>
            </div>
          );
        }
        
        // Non-paid users see unlock message
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base md:text-lg text-muted-foreground italic font-serif">
              This chapter will be generated when you unlock the full guide.
            </p>
          </div>
        );
      }

      const paragraphs = content.split('\n\n').filter((p) => p.trim());

      return paragraphs.map((paragraph, index) => {
        const trimmed = paragraph.trim();

        // Check for headers
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={index} className="font-serif text-xl md:text-2xl font-semibold mt-10 mb-4 text-foreground">
              {trimmed.replace('### ', '')}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={index} className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
              {trimmed.replace('## ', '')}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={index} className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
              {trimmed.replace('# ', '')}
            </h2>
          );
        }

        // Check for bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const items = trimmed
            .split('\n')
            .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'));
          return (
            <ul key={index} className="list-none pl-0 space-y-3 text-foreground/75 my-6">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 shrink-0 mt-2.5" />
                  <span>{item.replace(/^[-*]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          );
        }

        // Check for blockquote
        if (trimmed.startsWith('>')) {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl"
            >
              {trimmed.replace(/^>\s*/gm, '')}
            </blockquote>
          );
        }

        // Check for disclaimer (starts with warning emoji)
        if (trimmed.startsWith('⚠️')) {
          return (
            <div
              key={index}
              className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-6 my-8"
            >
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-amber-800 dark:text-amber-200 text-sm leading-relaxed">
                  {trimmed.replace('⚠️ ', '')}
                </div>
              </div>
            </div>
          );
        }

        // Regular paragraph - first one gets drop cap
        if (index === 0 || (hasDisclaimer && index === 1)) {
          return (
            <p
              key={index}
              className="text-lg md:text-xl first-letter:text-6xl first-letter:font-serif first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:leading-none first-letter:text-foreground"
            >
              {trimmed}
            </p>
          );
        }

        return (
          <p key={index} className="text-base md:text-lg">
            {trimmed}
          </p>
        );
      });
    };

    const formatChapterNumber = (num: number): string => {
      const words = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
      return words[num - 1] || `${num}`;
    };

    return (
      <div className="space-y-16">
        {chapters.map((chapter, idx) => (
          <article
            key={chapter.number}
            ref={(el) => { chapterRefs.current[idx] = el; }}
            id={`chapter-${chapter.number}`}
            className="w-full max-w-3xl mx-auto py-16 md:py-20 px-6 md:px-12 animate-fade-up bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative scroll-mt-24"
          >
            {/* Deckle edge effect */}
            <div className="absolute inset-0 pointer-events-none rounded-sm overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent" />
              <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-gradient-to-b from-transparent via-foreground/[0.03] to-transparent" />
              <div className="absolute top-0 bottom-0 right-0 w-[3px] bg-gradient-to-b from-transparent via-foreground/[0.03] to-transparent" />
            </div>

            {/* Chapter header */}
            <header className="mb-14 text-center">
              <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
                Chapter {formatChapterNumber(chapter.number)}
              </p>
              <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight">
                {getChapterTitle(chapter.number)}
              </h1>
              <div className="flex items-center justify-center gap-3 mt-8">
                <div className="w-12 h-[1px] bg-foreground/15" />
                <div className="w-2 h-2 rounded-full border border-foreground/20" />
                <div className="w-12 h-[1px] bg-foreground/15" />
              </div>
            </header>

            {/* Chapter content */}
            <div className="prose prose-lg max-w-none space-y-8 text-foreground/85 leading-relaxed">
              {renderContent(chapter.content, chapter.number, idx === 0 && bookData.hasDisclaimer)}
            </div>
          </article>
        ))}
      </div>
    );
  }
);

AllChaptersContent.displayName = 'AllChaptersContent';

export default AllChaptersContent;
