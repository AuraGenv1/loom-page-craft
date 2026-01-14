import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ChapterInfo } from '@/lib/bookTypes';
import { AlertTriangle, ImageIcon, Lightbulb } from 'lucide-react';
import WeavingLoader from '@/components/WeavingLoader';
import ReactMarkdown from 'react-markdown';
import LocalResources from '@/components/LocalResources';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface AllChaptersContentProps {
  topic: string;
  bookData: any;
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
    const [generatedChapters, setGeneratedChapters] = useState<Set<number>>(new Set());

    useImperativeHandle(ref, () => ({
      scrollToChapter: (num) => chapterRefs.current[num - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      getChapterRefs: () => chapterRefs.current,
    }));

    const generateImage = async (id: string, description: string, chapterNum: number) => {
      // Limit to ONE image per chapter for luxury aesthetic
      if (generatedChapters.has(chapterNum) || inlineImages[id] || loadingImages.has(id)) return;
      
      setGeneratedChapters(prev => new Set(prev).add(chapterNum));
      setLoadingImages(prev => new Set(prev).add(id));
      try {
        console.log("Generating image for chapter", chapterNum, ":", description);
        const { data, error } = await supabase.functions.invoke('generate-cover-image', {
          body: { topic, caption: description, variant: 'diagram', sessionId },
        });
        if (!error && data?.imageUrl) {
          setInlineImages(prev => ({ ...prev, [id]: data.imageUrl }));
        }
      } catch (e) {
        console.error("Image gen failed", e);
      } finally {
        setLoadingImages(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    };

    // Extract first image from content for placement after title
    const extractPrimaryImage = (markdownContent: string) => {
      const imageMatch = markdownContent.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch) {
        return { alt: imageMatch[1], src: imageMatch[2] };
      }
      return null;
    };

    // Remove images from content for separate placement
    const contentWithoutImages = (markdownContent: string) => {
      return markdownContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    };

    // SYNCED MARKDOWN COMPONENTS - Matches ChapterContent exactly
    const createMarkdownComponents = (chapterNum: number) => ({
      // IMAGE HANDLER - Skip, images handled separately
      img: () => null,

      // PRO-TIP HANDLER - Blue Box Style with Lightbulb (EXACT match)
      blockquote: ({ children }: any) => {
        // Extract text content recursively from React children
        const extractText = (node: any): string => {
          if (typeof node === 'string') return node;
          if (typeof node === 'number') return String(node);
          if (!node) return '';
          if (Array.isArray(node)) return node.map(extractText).join('');
          if (node.props?.children) return extractText(node.props.children);
          return '';
        };

        const textContent = extractText(children);
        const isProTip = /\bpro\s*[- ]?\s*tip\b/i.test(textContent);

        if (isProTip) {
          const cleanText = textContent
            .replace(/\*?\*?pro[- ]?tip:?\*?\*?/gi, '')
            .replace(/\*\*/g, '')
            .trim();

          return (
            <div
              className="my-8 p-6 rounded-xl"
              style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid #3b82f6' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#dbeafe' }}
                >
                  <Lightbulb className="w-5 h-5" style={{ color: '#3b82f6' }} />
                </div>
                <div>
                  <p
                    className="text-sm uppercase tracking-widest font-bold mb-2"
                    style={{ color: '#1d4ed8' }}
                  >
                    Pro-Tip
                  </p>
                  <p
                    className="font-serif leading-relaxed text-lg"
                    style={{ color: '#1e40af', lineHeight: '1.7' }}
                  >
                    {cleanText}
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <blockquote className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl">
            {children}
          </blockquote>
        );
      },

      // TYPOGRAPHY - Synced with ChapterContent
      h1: ({ children }: any) => <h1 className="text-4xl font-display font-bold text-foreground mt-10 mb-4">{children}</h1>,
      h2: ({ children }: any) => <h2 className="text-3xl font-display font-bold text-foreground mt-8 mb-3">{children}</h2>,
      h3: ({ children }: any) => <h3 className="text-2xl font-display font-semibold text-foreground mt-6 mb-2">{children}</h3>,
      p: ({ children }: any) => <p className="text-foreground/80 font-serif leading-relaxed text-lg mb-6">{children}</p>,
      ul: ({ children }: any) => <ul className="list-disc pl-6 my-4 space-y-2">{children}</ul>,
      li: ({ children }: any) => <li className="text-foreground/80 font-serif leading-relaxed">{children}</li>,
    });

    // Primary Image Component for each chapter
    const PrimaryImageSection = ({ chapterNum, content }: { chapterNum: number; content: string }) => {
      const primaryImage = extractPrimaryImage(content);
      if (!primaryImage) return null;
      
      const imageId = `ch${chapterNum}-img-${(primaryImage.alt || 'default').replace(/\s+/g, '-').substring(0, 20)}`;
      
      // Trigger generation if not exists
      if (sessionId && !inlineImages[imageId] && !loadingImages.has(imageId) && !generatedChapters.has(chapterNum)) {
        setTimeout(() => generateImage(imageId, primaryImage.alt || topic, chapterNum), 100);
      }

      const displayUrl = inlineImages[imageId] || primaryImage.src;
      const isLoading = loadingImages.has(imageId);

      return (
        <div className="my-8 flex flex-col items-center">
          <div className="relative w-full max-w-xl h-60 bg-secondary/30 rounded-lg flex items-center justify-center overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground" />
                <Skeleton className="h-4 w-32 mt-2" />
              </div>
            ) : (
              <img src={displayUrl} alt={primaryImage.alt || 'Chapter illustration'} className="object-cover w-full h-full" />
            )}
          </div>
          {primaryImage.alt && <p className="text-sm text-muted-foreground mt-2 text-center">{primaryImage.alt}</p>}
        </div>
      );
    };

    const chapters = Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      content: bookData[`chapter${i + 1}Content`]
    }));

    return (
      <div className="relative z-10">
        {chapters.map((chapter, idx) => {
          const isLocked = !isFullAccess && chapter.number > 1;
          const chapterTitle = bookData.tableOfContents?.find((c:any) => c.chapter === chapter.number)?.title || `Chapter ${chapter.number}`;
          const isCurrentlyLoading = loadingChapter === chapter.number;
          const cleanContent = chapter.content ? contentWithoutImages(chapter.content) : '';
          
          return (
            <section
              key={chapter.number}
              ref={(el) => { chapterRefs.current[idx] = el; }}
              className="w-full max-w-3xl mx-auto py-16 px-6 md:px-12 bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative mb-8"
            >
              <header className="mb-8 pb-8 border-b border-border/30">
                <p className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Chapter {chapter.number}</p>
                <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">{chapterTitle}</h2>
              </header>

              {isLocked ? (
                <div className="flex flex-col items-center justify-center h-64 bg-secondary/20 rounded-md text-muted-foreground border border-dashed border-border/70 p-4 text-center">
                  <AlertTriangle className="w-8 h-8 mb-4 text-primary" />
                  <p className="text-lg font-semibold">Unlock the full guide to read this chapter.</p>
                </div>
              ) : (
                <div className="prose prose-lg max-w-none">
                  {chapter.content ? (
                    <>
                      {/* Primary Image - Immediately after title, before content */}
                      <PrimaryImageSection chapterNum={chapter.number} content={chapter.content} />
                      {(() => {
                        const MarkdownComponents = createMarkdownComponents(chapter.number);
                        return (
                          <ReactMarkdown components={MarkdownComponents as any}>{cleanContent}</ReactMarkdown>
                        );
                      })()}
                    </>
                  ) : (
                    // Weaving loader active for chapters 2-10 when generating
                    <WeavingLoader text={`Weaving Chapter ${chapter.number}...`} />
                  )}
                </div>
              )}
              
              {chapter.number === 10 && isFullAccess && bookData.localResources && (
                <LocalResources resources={bookData.localResources} topic={topic} />
              )}
            </section>
          );
        })}
      </div>
    );
  }
);

AllChaptersContent.displayName = 'AllChaptersContent';
export default AllChaptersContent;