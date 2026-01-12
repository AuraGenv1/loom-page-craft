import { forwardRef, useState, useEffect } from 'react';
import LocalResources from './LocalResources';
import { LocalResource } from '@/lib/bookTypes';
import { AlertTriangle, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface ImageMarker {
  index: number;
  description: string;
  id: string;
}

interface ChapterContentProps {
  topic: string;
  content?: string;
  localResources?: LocalResource[];
  hasDisclaimer?: boolean;
  materials?: string[];
  isGenerating?: boolean;
  diagramImages?: Record<string, string | undefined>;
  tableOfContents?: Array<{ chapter: number; title: string; imageDescription?: string }>;
  sessionId?: string;
  /** Array of image URLs for fallback cycling */
  chapterImageUrls?: string[];
}

const ChapterContent = forwardRef<HTMLElement, ChapterContentProps>(
  ({ topic, content, localResources, hasDisclaimer, materials, isGenerating = false, diagramImages, tableOfContents, sessionId, chapterImageUrls = [] }, ref) => {
    const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
    const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
    
    // Fallback URL cycling state for inline images (mirrors BookCover.tsx pattern)
    const [imageUrlIndexes, setImageUrlIndexes] = useState<Record<string, number>>({});
    const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
    // Track images that have exhausted all fallbacks - these should be hidden
    const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set());

    // Extract [IMAGE: ...] markers (Smart Visual System)
    const extractImageMarkers = (text: string): ImageMarker[] => {
      const markers: ImageMarker[] = [];
      const regex = /\[IMAGE:\s*([^\]]+)\]/gi;
      let match;
      let imageIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        markers.push({
          index: match.index,
          description: match[1].trim(),
          id: `img-${imageIndex}`,
        });
        imageIndex++;
      }

      return markers;
    };

    // Generate inline images when markers are found
    useEffect(() => {
      if (!content || !sessionId) return;

      const markers = extractImageMarkers(content);
      if (markers.length === 0) return;

      const generateImage = async (marker: ImageMarker) => {
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
      markers.forEach((marker, idx) => {
        setTimeout(() => generateImage(marker), idx * 2000);
      });
    }, [content, topic, sessionId]);

    // THE REGEX SHIELD - Clean all content before rendering
    const getCleanedContent = (text: string): string => {
      return text
        .replace(/\*\*/g, '')                      // Remove all double asterisks
        .replace(/\*/g, '')                        // Remove all single asterisks
        .replace(/---+/g, '')                      // Remove horizontal line artifacts
        .replace(/^\s*[-*]\s*$/gm, '')             // Remove orphan bullet markers
        .replace(/\s{3,}/g, '  ')                  // Collapse excessive whitespace
        .trim();
    };

    // Handle image load error - cycle to next URL (same pattern as BookCover.tsx)
    const handleInlineImageError = (markerId: string, currentUrl: string) => {
      console.warn(`[ChapterContent] Inline image failed to load (${markerId}):`, currentUrl);
      
      // Get current index for this marker
      const currentIndex = imageUrlIndexes[markerId] || 0;
      const nextIndex = currentIndex + 1;
      
      // If we have more fallback URLs, try the next one
      if (chapterImageUrls && nextIndex < chapterImageUrls.length) {
        console.log(`[ChapterContent] Trying fallback image ${nextIndex + 1}/${chapterImageUrls.length} for ${markerId}`);
        setImageUrlIndexes(prev => ({ ...prev, [markerId]: nextIndex }));
        // Update the image URL to the fallback
        setInlineImages(prev => ({ ...prev, [markerId]: chapterImageUrls[nextIndex] }));
      } else {
        // All fallbacks exhausted - hide the image entirely
        console.warn(`[ChapterContent] All fallback images exhausted for ${markerId}, hiding image`);
        setHiddenImageIds(prev => new Set(prev).add(markerId));
        setFailedImageIds(prev => new Set(prev).add(markerId));
      }
    };
    
    // Render an inline image placeholder or actual image
    const renderInlineImage = (description: string, markerId: string, index: number) => {
      const imageUrl = inlineImages[markerId];
      const isLoading = loadingImages.has(markerId);
      const hasFailed = failedImageIds.has(markerId);
      const isHidden = hiddenImageIds.has(markerId);

      // CRITICAL: If all fallbacks exhausted, hide the image entirely (no gray box)
      if (isHidden) {
        return null;
      }

      return (
        <figure key={`image-${index}`} className="my-10 text-center">
          <div className="relative w-full max-w-2xl mx-auto aspect-video bg-secondary/20 rounded-lg overflow-hidden border border-border/30 print:opacity-100 print:filter-none">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center print:hidden">
                <Skeleton className="w-full h-full" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/40 animate-pulse" />
                  <span className="text-xs text-muted-foreground">Generating image...</span>
                </div>
              </div>
            ) : imageUrl && !hasFailed ? (
              <img
                key={`${markerId}-${imageUrlIndexes[markerId] || 0}`} // Force re-render on URL change
                src={imageUrl}
                alt={description}
                className="w-full h-full object-cover print:opacity-100 print:filter-none"
                crossOrigin="anonymous"
                onError={(e) => handleInlineImageError(markerId, e.currentTarget.src)}
                loading="eager"
              />
            ) : (
              // Only show placeholder if still loading or has URL - otherwise hidden
              !hasFailed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-secondary/30 to-secondary/10 print:hidden">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                </div>
              )
            )}
          </div>
          {/* Only show caption if image is visible */}
          {!hasFailed && (
            <figcaption className="mt-3 text-sm text-muted-foreground italic font-serif max-w-xl mx-auto">
              {description}
            </figcaption>
          )}
        </figure>
      );
    };

    // Parse markdown content into sections (simplified rendering)
    const renderContent = () => {
      if (!content) {
        return (
          <>
            <p className="text-lg md:text-xl first-letter:text-6xl first-letter:font-serif first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:leading-none first-letter:text-foreground">
              Welcome to your comprehensive guide on {topic}. This carefully crafted manual
              will walk you through everything you need to know, from the foundational
              concepts to advanced techniques that experts use every day.
            </p>

            <p className="text-base md:text-lg">
              Whether you're a complete beginner or looking to refine your existing skills,
              this guide is designed to meet you where you are. We've distilled years of
              expertise and countless hours of research into clear, actionable steps.
            </p>
          </>
        );
      }

      // Apply the Regex Shield to clean content
      const processedContent = getCleanedContent(content);

      // Extract image markers
      const imageMarkers = extractImageMarkers(processedContent);
      
      // Split content by paragraphs and render with proper styling
      const paragraphs = processedContent.split('\n\n').filter((p) => p.trim());
      const elements: React.ReactNode[] = [];

      paragraphs.forEach((paragraph, index) => {
        const trimmed = paragraph.trim();

        // Check for [PRO-TIP: ...] callout boxes - light grey with charcoal left border
        const proTipMatch = trimmed.match(/\[PRO-TIP:\s*([^\]]+)\]/i);
        if (proTipMatch) {
          elements.push(
            <div key={`protip-${index}`} className="my-8 p-6 bg-[#f8f9fa] dark:bg-muted/30 border-l-4 border-foreground/70 rounded-r-lg">
              <div className="flex items-start gap-4">
                <span className="text-xl flex-shrink-0">💡</span>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Pro-Tip</p>
                  <p className="text-foreground/80 dark:text-foreground/70 italic font-serif leading-relaxed text-[1.1rem]" style={{ lineHeight: '1.6' }}>
                    {proTipMatch[1].trim()}
                  </p>
                </div>
              </div>
            </div>
          );
          return;
        }

        // FIX: Check for Markdown image syntax ![alt](url) - render as actual <img> tag
        const markdownImageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (markdownImageMatch) {
          const alt = markdownImageMatch[1] || 'Image';
          const url = markdownImageMatch[2];
          elements.push(
            <figure key={`md-image-${index}`} className="my-10 text-center">
              <div className="relative w-full max-w-2xl mx-auto aspect-video bg-secondary/20 rounded-lg overflow-hidden border border-border/30">
                <img
                  src={url}
                  alt={alt}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                  loading="eager"
                  onError={(e) => {
                    // Hide image on error
                    const target = e.currentTarget;
                    target.style.display = 'none';
                  }}
                />
              </div>
              {alt && alt !== 'Image' && (
                <figcaption className="mt-3 text-sm text-muted-foreground italic font-serif max-w-xl mx-auto">
                  {alt}
                </figcaption>
              )}
            </figure>
          );
          return;
        }

        // Check for [IMAGE: ...] markers (legacy - these should now be replaced with ![](url))
        const imageMatch = trimmed.match(/\[IMAGE:\s*([^\]]+)\]/i);
        if (imageMatch) {
          const imageDescription = imageMatch[1].trim();
          const markerIndex = imageMarkers.findIndex(m => m.description === imageDescription);
          const markerId = markerIndex >= 0 ? `img-${markerIndex}` : `img-${index}`;
          
          elements.push(renderInlineImage(imageDescription, markerId, index));
          return;
        }

        // Check for headers
        if (trimmed.startsWith('### ')) {
          elements.push(
            <h3 key={index} className="font-serif text-xl md:text-2xl font-semibold mt-10 mb-4 text-foreground">
              {trimmed.replace('### ', '')}
            </h3>
          );
          return;
        }
        if (trimmed.startsWith('## ')) {
          elements.push(
            <h2 key={index} className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
              {trimmed.replace('## ', '')}
            </h2>
          );
          return;
        }
        if (trimmed.startsWith('# ')) {
          elements.push(
            <h2 key={index} className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
              {trimmed.replace('# ', '')}
            </h2>
          );
          return;
        }

        // Check for bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const items = trimmed
            .split('\n')
            .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'));
          elements.push(
            <ul key={index} className="list-none pl-0 space-y-3 text-foreground/75 my-6">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 shrink-0 mt-2.5" />
                  <span>{item.replace(/^[-*]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          );
          return;
        }

        // Check for blockquote
        if (trimmed.startsWith('>')) {
          elements.push(
            <blockquote
              key={index}
              className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl"
            >
              {trimmed.replace(/^>\s*/gm, '')}
            </blockquote>
          );
          return;
        }

        // Check for disclaimer (starts with warning emoji)
        if (trimmed.startsWith('⚠️')) {
          elements.push(
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
          return;
        }

        // Check for inline markdown images within text (e.g., paragraph with images)
        if (/!\[[^\]]*\]\([^)]+\)/.test(trimmed)) {
          // Process inline images in the paragraph
          const processedParagraph = trimmed.replace(
            /!\[([^\]]*)\]\(([^)]+)\)/g,
            (_, alt, url) => `<img src="${url}" alt="${alt || 'Image'}" class="inline-block max-h-64 mx-2 rounded" crossorigin="anonymous" />`
          );
          elements.push(
            <p 
              key={index} 
              style={{ fontSize: '1.1rem', lineHeight: '1.6' }}
              dangerouslySetInnerHTML={{ __html: processedParagraph }}
            />
          );
          return;
        }

        // Regular paragraph - standardized typography (1.1rem, 1.6 line-height)
        // Only first paragraph of actual content gets drop cap (not after disclaimer)
        const isFirstContentParagraph = index === 0 && !hasDisclaimer;
        
        if (isFirstContentParagraph) {
          elements.push(
            <p
              key={index}
              className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-none first-letter:text-foreground"
              style={{ fontSize: '1.1rem', lineHeight: '1.6' }}
            >
              {trimmed}
            </p>
          );
          return;
        }

        elements.push(
          <p key={index} style={{ fontSize: '1.1rem', lineHeight: '1.6' }}>
            {trimmed}
          </p>
        );
      });

      return elements;
    };

    return (
      <article
        ref={ref}
        className="w-full max-w-3xl mx-auto py-16 md:py-20 px-6 md:px-12 animate-fade-up animation-delay-300 bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative"
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
            Chapter One
          </p>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight">
            Introduction to {topic}
          </h1>
          <div className="flex items-center justify-center gap-3 mt-8">
            <div className="w-12 h-[1px] bg-foreground/15" />
            <div className="w-2 h-2 rounded-full border border-foreground/20" />
            <div className="w-12 h-[1px] bg-foreground/15" />
          </div>
        </header>

        {/* Chapter content */}
        <div className="prose prose-lg max-w-none space-y-8 text-foreground/85 leading-relaxed h-auto">
          {renderContent()}

          {!content && (
            <>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
                Why This Matters
              </h2>

              <p className="text-base md:text-lg">
                Understanding {topic} isn't just about acquiring a new skill—it's about
                opening doors to new possibilities. In today's world, this knowledge can
                transform how you approach problems and create opportunities you never
                knew existed.
              </p>

              <blockquote className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl">
                "The journey of a thousand miles begins with a single step. This chapter
                is that first step."
              </blockquote>
            </>
          )}

          {/* Local Resources Section - inside prose div */}
          <LocalResources topic={topic} resources={localResources} materials={materials} />
        </div>
      </article>
    );
  }
);

ChapterContent.displayName = 'ChapterContent';

export default ChapterContent;