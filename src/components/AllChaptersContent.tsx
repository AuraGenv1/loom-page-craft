import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ChapterInfo } from '@/lib/bookTypes';
import { AlertTriangle, ImageIcon, Lightbulb } from 'lucide-react';
import WeavingLoader from '@/components/WeavingLoader';
import ReactMarkdown from 'react-markdown';
import LocalResources from '@/components/LocalResources';
import { supabase } from '@/integrations/supabase/client';

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

    useImperativeHandle(ref, () => ({
      scrollToChapter: (num) => chapterRefs.current[num - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      getChapterRefs: () => chapterRefs.current,
    }));

    const generateImage = async (id: string, description: string) => {
        if (inlineImages[id] || loadingImages.has(id)) return;
        setLoadingImages(prev => new Set(prev).add(id));
        try {
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

    const MarkdownComponents = {
        blockquote: ({ children }: any) => {
            const textContent = Array.isArray(children) 
                ? children.map((c: any) => c?.props?.children || "").join("") 
                : children?.toString() || "";
            
            if (textContent.toLowerCase().includes("pro-tip")) {
                const cleanText = textContent.replace(/pro-tip:?\*\*?/gi, "").replace(/\*\*/g, "").trim();
                return (
                    <div className="my-8 p-6 bg-[#f8f9fa] dark:bg-muted/30 border-l-4 border-foreground/70 rounded-r-lg">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Pro-Tip</p>
                                <p className="text-foreground/80 dark:text-foreground/70 italic font-serif leading-relaxed text-[1.1rem]" style={{ lineHeight: '1.6' }}>{cleanText}</p>
                            </div>
                        </div>
                    </div>
                );
            }
            return <blockquote className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl">{children}</blockquote>;
        },
        img: ({ src, alt }: any) => {
            const imageId = `img-${(alt || 'default').replace(/\s+/g, '-').substring(0, 20)}`;
            if (sessionId && !inlineImages[imageId] && !loadingImages.has(imageId)) {
                setTimeout(() => generateImage(imageId, alt || topic), 0);
            }
            const displayUrl = inlineImages[imageId] || src;
            const isLoading = loadingImages.has(imageId);
            return (
                <div className="my-8 flex flex-col items-center">
                    <div className="relative w-full max-w-xl h-60 bg-secondary/30 rounded-lg flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <ImageIcon className="w-10 h-10 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground mt-2">Generating image...</span>
                            </div>
                        ) : (
                            <img src={displayUrl} alt={alt || 'Generated image'} className="object-cover w-full h-full" />
                        )}
                    </div>
                    {alt && <p className="text-sm text-muted-foreground mt-2 text-center">{alt}</p>}
                </div>
            );
        },
        h1: ({ children }: any) => <h1 className="text-4xl font-display font-bold text-foreground mt-10 mb-4">{children}</h1>,
        h2: ({ children }: any) => <h2 className="text-3xl font-display font-bold text-foreground mt-8 mb-3">{children}</h2>,
        h3: ({ children }: any) => <h3 className="text-2xl font-display font-semibold text-foreground mt-6 mb-2">{children}</h3>,
        p: ({ children }: any) => <p className="text-foreground/80 font-serif leading-relaxed text-lg mb-6">{children}</p>,
        ul: ({ children }: any) => <ul className="list-disc pl-6 my-4 space-y-2">{children}</ul>,
        li: ({ children }: any) => <li className="text-foreground/80 font-serif leading-relaxed">{children}</li>,
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
                
                return (
                    <section
                        key={chapter.number}
                        ref={(el) => { chapterRefs.current[idx] = el; }}
                        className="w-full max-w-3xl mx-auto py-16 px-6 md:px-12 bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative"
                    >
                         <header className="mb-12 pb-8 border-b border-border/30">
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
                                    <ReactMarkdown components={MarkdownComponents}>{chapter.content}</ReactMarkdown>
                                ) : (
                                    <WeavingLoader text={`Generating Chapter ${chapter.number}...`} />
                                )}
                            </div>
                        )}
                        
                         {chapter.number === 10 && isFullAccess && (
                            <LocalResources resources={bookData.localResources || []} topic={topic} />
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
