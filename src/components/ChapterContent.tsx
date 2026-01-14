import { forwardRef, useState, useEffect, useRef } from 'react';
import LocalResources from './LocalResources';
import { LocalResource } from '@/lib/bookTypes';
import { AlertTriangle, ImageIcon, Lightbulb } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import ReactMarkdown from 'react-markdown';

interface ChapterContentProps {
  topic: string;
  content?: string;
  localResources?: LocalResource[];
  hasDisclaimer?: boolean;
  materials?: string[];
  isGenerating?: boolean;
  diagramImages?: Record<string, string>;
  tableOfContents?: Array<{ chapter: number; title: string; imageDescription?: string }>;
  sessionId?: string;
  chapterImageUrls?: string[];
  onChapterReady?: () => void;
}

const ChapterContent = forwardRef<HTMLElement, ChapterContentProps>(
  ({ topic, content, localResources, hasDisclaimer, sessionId, onChapterReady }, ref) => {
    const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
    const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
    const [primaryImageGenerated, setPrimaryImageGenerated] = useState(false);
    const imageCountRef = useRef(0);
    
    // Signal when Chapter 1 is finished rendering
    useEffect(() => {
      if (content && onChapterReady) {
        // Small delay to ensure DOM is rendered
        const timer = setTimeout(() => {
          onChapterReady();
        }, 500);
        return () => clearTimeout(timer);
      }
    }, [content, onChapterReady]);

    // --- IMAGE GENERATOR ---
    const generateImage = async (id: string, description: string) => {
      // Limit to ONE image per chapter for luxury aesthetic
      if (primaryImageGenerated || inlineImages[id] || loadingImages.has(id)) return;
      
      imageCountRef.current += 1;
      if (imageCountRef.current > 1) return;
      
      setPrimaryImageGenerated(true);
      setLoadingImages(prev => new Set(prev).add(id));
      
      try {
        console.log("Generating primary chapter image for:", description);
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
    const contentWithoutImages = (content || "").replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    const primaryImage = extractPrimaryImage(content || "");

    // --- MARKDOWN COMPONENTS ---
    const MarkdownComponents = {
      // IMAGE HANDLER - Now only handles inline images (primary image is separate)
      img: ({ src, alt }: any) => {
        // Skip - images are handled separately
        return null;
      },

      // PRO-TIP HANDLER - Blue Box Style with Lightbulb
      blockquote: ({ children }: any) => {
        const textContent = Array.isArray(children) 
          ? children.map((c: any) => c?.props?.children || "").join("") 
          : children?.toString() || "";
        
        if (textContent.toLowerCase().includes("pro-tip")) {
          const cleanText = textContent.replace(/pro-tip:?\*\*?/gi, "").replace(/\*\*/g, "").trim();
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

      // TYPOGRAPHY
      h1: ({ children }: any) => <h1 className="text-4xl font-display font-bold text-foreground mt-10 mb-4">{children}</h1>,
      h2: ({ children }: any) => <h2 className="text-3xl font-display font-bold text-foreground mt-8 mb-3">{children}</h2>,
      h3: ({ children }: any) => <h3 className="text-2xl font-display font-semibold text-foreground mt-6 mb-2">{children}</h3>,
      p: ({ children }: any) => <p className="text-foreground/80 font-serif leading-relaxed text-lg mb-6">{children}</p>,
      ul: ({ children }: any) => <ul className="list-disc pl-6 my-4 space-y-2">{children}</ul>,
      li: ({ children }: any) => <li className="text-foreground/80 font-serif leading-relaxed">{children}</li>,
    };

    const cleanContent = contentWithoutImages.replace(/^⚠️.*$/m, "").trim();

    // Primary Image Component - Placed after title
    const PrimaryImageSection = () => {
      if (!primaryImage) return null;
      
      const imageId = `primary-img-${(primaryImage.alt || 'default').replace(/\s+/g, '-').substring(0, 20)}`;
      
      // Trigger generation if not exists
      if (sessionId && !inlineImages[imageId] && !loadingImages.has(imageId) && !primaryImageGenerated) {
        setTimeout(() => generateImage(imageId, primaryImage.alt || topic), 100);
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

    return (
      <article ref={ref} className="w-full max-w-3xl mx-auto py-16 md:py-20 px-6 md:px-12 animate-fade-up animation-delay-300 bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative">
        <header className="mb-8 text-center">
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">Chapter One</p>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight">Introduction to {topic}</h1>
          <div className="flex items-center justify-center gap-3 mt-8">
            <div className="w-12 h-[1px] bg-foreground/15" />
            <div className="w-2 h-2 rounded-full border border-foreground/20" />
            <div className="w-12 h-[1px] bg-foreground/15" />
          </div>
        </header>
        
        {/* Primary Image - Immediately after title, before content */}
        <PrimaryImageSection />
        
        <div className="prose prose-lg max-w-none space-y-8 text-foreground/85 leading-relaxed h-auto">
          {hasDisclaimer && content?.includes('⚠️') && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-6 my-8">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-amber-800 dark:text-amber-200 text-sm leading-relaxed">
                  {content.split('⚠️')[1]?.split('\n')[0]?.trim()}
                </div>
              </div>
            </div>
          )}
          <ReactMarkdown components={MarkdownComponents as any}>{cleanContent}</ReactMarkdown>
          {localResources && localResources.length > 0 && (
            <LocalResources topic={topic} resources={localResources} />
          )}
        </div>
      </article>
    );
  }
);

ChapterContent.displayName = 'ChapterContent';
export default ChapterContent;