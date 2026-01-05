import { forwardRef } from 'react';
import TechnicalDiagram from './TechnicalDiagram';
import LocalResources from './LocalResources';
import { LocalResource } from '@/lib/bookTypes';
import { AlertTriangle } from 'lucide-react';

interface ChapterContentProps {
  topic: string;
  content?: string;
  localResources?: LocalResource[];
  hasDisclaimer?: boolean;
  materials?: string[];
  isGenerating?: boolean;
  diagramImages?: Record<string, string | undefined>;
  tableOfContents?: Array<{ chapter: number; title: string; imageDescription?: string }>;
}

const ChapterContent = forwardRef<HTMLElement, ChapterContentProps>(
  ({ topic, content, localResources, hasDisclaimer, materials, isGenerating = false, diagramImages, tableOfContents }, ref) => {
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

      // Split content by paragraphs and render with proper styling
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

