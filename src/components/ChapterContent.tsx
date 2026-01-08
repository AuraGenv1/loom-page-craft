import { forwardRef, useState, useEffect } from 'react';
import TechnicalDiagram from './TechnicalDiagram';
import LocalResources from './LocalResources';
import { LocalResource } from '@/lib/bookTypes';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DiagramMarker {
  index: number;
  description: string;
  plateNumber: string;
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
}

const ChapterContent = forwardRef<HTMLElement, ChapterContentProps>(
  ({ topic, content, localResources, hasDisclaimer, materials, isGenerating = false, diagramImages, tableOfContents, sessionId }, ref) => {
    const [inlineDiagramImages, setInlineDiagramImages] = useState<Record<string, string>>({});
    const [loadingDiagrams, setLoadingDiagrams] = useState<Set<string>>(new Set());

    // Extract [ILLUSTRATION: ...], [VISUAL: ...], or [DIAGRAM: ...] markers (Smart Visual System)
    const extractDiagramMarkers = (text: string): DiagramMarker[] => {
      const markers: DiagramMarker[] = [];
      // Match [ILLUSTRATION: ...], [VISUAL: ...], and [DIAGRAM: ...] for backwards compatibility
      const regex = /\[(ILLUSTRATION|VISUAL|DIAGRAM):\s*([^\]]+)\]/gi;
      let match;
      let diagramIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        markers.push({
          index: match.index,
          description: match[2].trim(),
          plateNumber: `inline-${diagramIndex}`,
        });
        diagramIndex++;
      }

      return markers;
    };

    // Generate inline diagrams when markers are found
    useEffect(() => {
      if (!content || !sessionId) return;

      const markers = extractDiagramMarkers(content);
      if (markers.length === 0) return;

      const generateDiagram = async (marker: DiagramMarker) => {
        if (inlineDiagramImages[marker.plateNumber] || loadingDiagrams.has(marker.plateNumber)) return;

        setLoadingDiagrams(prev => new Set(prev).add(marker.plateNumber));

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
            setInlineDiagramImages(prev => ({ ...prev, [marker.plateNumber]: data.imageUrl }));
          }
        } catch (err) {
          console.error('Failed to generate inline diagram:', err);
        } finally {
          setLoadingDiagrams(prev => {
            const next = new Set(prev);
            next.delete(marker.plateNumber);
            return next;
          });
        }
      };

      // Generate diagrams in sequence to avoid overloading
      markers.forEach((marker, idx) => {
        setTimeout(() => generateDiagram(marker), idx * 2000);
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

      // Extract diagram markers
      const diagramMarkers = extractDiagramMarkers(processedContent);
      
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

        // Check for [ILLUSTRATION: ...], [VISUAL: ...], or [DIAGRAM: ...] markers (Smart Visual System)
        const diagramMatch = trimmed.match(/\[(ILLUSTRATION|VISUAL|DIAGRAM):\s*([^\]]+)\]/i);
        if (diagramMatch) {
          const visualDescription = diagramMatch[2].trim();
          const markerIndex = diagramMarkers.findIndex(m => m.description === visualDescription);
          const plateNumber = markerIndex >= 0 ? `inline-${markerIndex}` : `inline-${index}`;
          const imageUrl = inlineDiagramImages[plateNumber];
          const isLoading = loadingDiagrams.has(plateNumber);
          
          elements.push(
            <div key={`diagram-wrapper-${index}`} className="flex justify-center py-8">
              <div className="w-full max-w-2xl border border-border/30 rounded-sm shadow-sm">
                <TechnicalDiagram
                  caption={visualDescription}
                  plateNumber={plateNumber}
                  topic={topic}
                  isGenerating={isLoading}
                  imageUrl={imageUrl ?? null}
                  imageDescription={visualDescription}
                />
              </div>
            </div>
          );
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
        <div className="prose prose-lg max-w-none space-y-8 text-foreground/85 leading-relaxed">
          {renderContent()}

          <TechnicalDiagram
            caption={`Core concepts of ${topic} visualized`}
            plateNumber="1.1"
            topic={topic}
            isGenerating={isGenerating}
            imageUrl={diagramImages?.['1.1'] ?? null}
            imageDescription={
              tableOfContents?.[0]?.imageDescription || 
              `A detailed instructional diagram illustrating the core concepts and fundamentals of ${topic}.`
            }
          />

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

          <TechnicalDiagram
            caption={`Essential tools and materials for ${topic}`}
            plateNumber="1.2"
            topic={topic}
            isGenerating={isGenerating}
            imageUrl={diagramImages?.['1.2'] ?? null}
            imageDescription={`Essential tools, materials, and equipment needed for mastering ${topic}.`}
          />
        </div>

        {/* Local Resources Section */}
        <LocalResources topic={topic} resources={localResources} materials={materials} />
      </article>
    );
  }
);

ChapterContent.displayName = 'ChapterContent';

export default ChapterContent;

