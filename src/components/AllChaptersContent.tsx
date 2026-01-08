import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { LocalResource, ChapterInfo } from '@/lib/bookTypes';
import { AlertTriangle, ImageIcon } from 'lucide-react';
import WeavingLoader from '@/components/WeavingLoader';
import ReactMarkdown from 'react-markdown';
import LocalResources from '@/components/LocalResources';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

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
  sessionId?: string;
}

export interface AllChaptersContentHandle {
  scrollToChapter: (chapterNumber: number) => void;
  getChapterRefs: () => (HTMLElement | null)[];
}

const AllChaptersContent = forwardRef<AllChaptersContentHandle, AllChaptersContentProps>(
  ({ topic, bookData, loadingChapter, isFullAccess, sessionId }, ref) => {
    const chapterRefs = useRef<(HTMLElement | null)[]>([]);
    const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
    const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

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

    // Extract [IMAGE: ...] markers
    const extractImageMarkers = (text: string, chapterNum: number): Array<{ description: string; id: string }> => {
      const markers: Array<{ description: string; id: string }> = [];
      const regex = /\[IMAGE:\s*([^\]]+)\]/gi;
      let match;
      let imageIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        markers.push({
          description: match[1].trim(),
          id: `ch${chapterNum}-img-${imageIndex}`,
        });
        imageIndex++;
      }

      return markers;
    };

    // Generate inline images when markers are found
    useEffect(() => {
      if (!sessionId) return;

      const allContent = [
        bookData.chapter1Content,
        bookData.chapter2Content,
        bookData.chapter3Content,
        bookData.chapter4Content,
        bookData.chapter5Content,
        bookData.chapter6Content,
        bookData.chapter7Content,
        bookData.chapter8Content,
        bookData.chapter9Content,
        bookData.chapter10Content,
      ];

      const allMarkers: Array<{ description: string; id: string }> = [];
      allContent.forEach((content, idx) => {
        if (content) {
          allMarkers.push(...extractImageMarkers(content, idx + 1));
        }
      });

      if (allMarkers.length === 0) return;

      const generateImage = async (marker: { description: string; id: string }) => {
        if (inlineImages[marker.id] || loadingImages.has(marker.id)) return;

        setLoadingImages(prev => new Set(prev).add(marker.id));

        try {
          const { data, error } = await supabase.functions.invoke('generate-cover-image', {
            body: {
              topic,
              caption: marker.description,
              variant: 'diagram',
              sessionId,
            },
          });

          if (!error && data?.imageUrl) {
            setInlineImages(prev => ({ ...prev, [marker.id]: data.imageUrl }));
          }
        } catch (err) {
          console.error('Failed to generate inline image:', err);
        } finally {
          setLoadingImages(prev => {
            const next = new Set(prev);
            next.delete(marker.id);
            return next;
          });
        }
      };

      // Generate images in sequence to avoid overloading
      allMarkers.forEach((marker, idx) => {
        setTimeout(() => generateImage(marker), idx * 3000);
      });
    }, [bookData, topic, sessionId]);

    // ORDERED LOAD: Ensure chapters display in numerical order (1, 2, 3...)
    // even if they finish saving out of order from background workers
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
    ].sort((a, b) => a.number - b.number); // Explicit sort ensures numerical order

    const getChapterTitle = (chapterNumber: number): string => {
      const tocEntry = bookData.tableOfContents?.find(ch => ch.chapter === chapterNumber);
      return tocEntry?.title || `Chapter ${chapterNumber}`;
    };

    // Render an inline image placeholder or actual image
    const renderInlineImage = (description: string, markerId: string) => {
      const imageUrl = inlineImages[markerId];
      const isLoading = loadingImages.has(markerId);

      return (
        <figure key={markerId} className="my-10 text-center">
          <div className="relative w-full max-w-2xl mx-auto aspect-video bg-secondary/20 rounded-lg overflow-hidden border border-border/30">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Skeleton className="w-full h-full" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/40 animate-pulse" />
                  <span className="text-xs text-muted-foreground">Generating image...</span>
                </div>
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={description}
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-secondary/30 to-secondary/10">
                <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <figcaption className="mt-3 text-sm text-muted-foreground italic font-serif max-w-xl mx-auto">
            {description}
          </figcaption>
        </figure>
      );
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

      // THE REGEX SHIELD - Clean all content before rendering
      // LABEL STRIPPING: Remove "Pro Tip:" and "Key Takeaway:" prefixes to avoid double-labeling
      const getCleanedContent = (text: string): string => {
        return text
          .replace(/\\n/g, '\n')                     // Convert literal \n to actual newlines
          .replace(/\*\*/g, '')                      // Remove all double asterisks
          .replace(/\*/g, '')                        // Remove all single asterisks  
          .replace(/---+/g, '')                      // Remove horizontal line artifacts
          .replace(/^\s*[-*]\s*$/gm, '')             // Remove orphan bullet markers
          .replace(/\s{3,}/g, '  ')                  // Collapse excessive whitespace
          .replace(/\[IMAGE:\s*([^\]]+)\]/gi, '')    // Remove image markers (rendered separately)
          .replace(/\[PRO-TIP:\s*([^\]]+)\]/gi, '')  // Remove PRO-TIP markers (rendered separately)
          // LABEL STRIPPING: Strip redundant labels when text starts with them
          .replace(/^Pro[- ]?Tip:\s*/gim, '')        // Strip "Pro Tip:" or "Pro-Tip:" from start of lines
          .replace(/^Key Takeaway[s]?:\s*/gim, '')   // Strip "Key Takeaway:" from start of lines
          .replace(/^Expert Tip:\s*/gim, '')         // Strip "Expert Tip:" from start of lines
          .replace(/^Insider Tip:\s*/gim, '')        // Strip "Insider Tip:" from start of lines
          .trim();
      };

      const processedContent = getCleanedContent(content);

      // Extract Pro-Tips from content
      const proTipMatches = [...content.matchAll(/\[PRO-TIP:\s*([^\]]+)\]/gi)];
      const proTips = proTipMatches.map((match, i) => ({
        text: match[1].trim(),
        id: `protip-${chapterNumber}-${i}`
      }));

      // Find inline image markers for this chapter
      const chapterMarkers = extractImageMarkers(content, chapterNumber);

      // Use ReactMarkdown for proper bold/italic rendering
      return (
        <div className="markdown-content">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h2 className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
                  {children}
                </h2>
              ),
              h2: ({ children }) => (
                <h2 className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-serif text-xl md:text-2xl font-semibold mt-10 mb-4 text-foreground">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-base md:text-lg mb-6 leading-relaxed">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic font-serif">{children}</em>
              ),
              ul: ({ children }) => (
                <ul className="list-none pl-0 space-y-3 text-foreground/75 my-6">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-6 space-y-3 text-foreground/75 my-6">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="flex items-start gap-4 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 shrink-0 mt-2.5" />
                  <span className="leading-relaxed">{children}</span>
                </li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl">
                  {children}
                </blockquote>
              ),
              br: () => <br className="my-2" />,
            }}
          >
            {processedContent}
          </ReactMarkdown>
          
          {/* Render Pro-Tips with light grey styling and charcoal border */}
          {proTips.map((tip) => (
            <div key={tip.id} className="my-8 p-6 bg-[#f8f9fa] dark:bg-muted/30 border-l-4 border-foreground/70 rounded-r-lg">
              <div className="flex items-start gap-4">
                <span className="text-xl flex-shrink-0">💡</span>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Pro-Tip</p>
                  <p className="text-foreground/80 dark:text-foreground/70 italic font-serif leading-relaxed text-[1.1rem]" style={{ lineHeight: '1.6' }}>
                    {tip.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          {/* Render inline images for this chapter */}
          {chapterMarkers.map((marker) => renderInlineImage(marker.description, marker.id))}
          
          {/* Disclaimer handling */}
          {hasDisclaimer && content.includes('⚠️') && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-6 my-8">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-amber-800 dark:text-amber-200 text-sm leading-relaxed">
                  {content.split('⚠️')[1]?.split('\n')[0]?.trim()}
                </div>
              </div>
            </div>
          )}
        </div>
      );
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
            
            {/* Local Resources at the end of the last chapter */}
            {chapter.number === 10 && chapter.content && (
              <LocalResources 
                topic={topic} 
                resources={bookData.localResources}
              />
            )}
          </article>
        ))}
      </div>
    );
  }
);

AllChaptersContent.displayName = 'AllChaptersContent';

export default AllChaptersContent;
