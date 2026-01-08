import { forwardRef, useEffect, useState } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import WeavingLoader from '@/components/WeavingLoader';
import { Skeleton } from '@/components/ui/skeleton';

interface BookCoverProps {
  title: string;
  subtitle?: string;
  topic?: string;
  coverImageUrl?: string | null;
  isLoadingImage?: boolean;
}

const BookCover = forwardRef<HTMLDivElement, BookCoverProps>(
  ({ title, subtitle, topic = '', coverImageUrl, isLoadingImage }, ref) => {
    const TopicIcon = getTopicIcon(topic || title);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    
    // Once we have a valid cover URL, lock it in to prevent flicker
    const [lockedCoverUrl, setLockedCoverUrl] = useState<string | null>(null);

    // FIX: On mount, if coverImageUrl exists from database, use it immediately
    useEffect(() => {
      if (coverImageUrl && !lockedCoverUrl) {
        // Database cover URL takes priority - lock it immediately
        setLockedCoverUrl(coverImageUrl);
        setImageLoaded(false);
        setImageFailed(false);
      }
    }, [coverImageUrl]); // Remove lockedCoverUrl from deps to allow DB override
    
    // Use locked URL for display to prevent flicker, but always prefer fresh DB URL
    const displayUrl = coverImageUrl || lockedCoverUrl;
    
    // Parse title for premium magazine styling (Category: Main Title)
    const parsedTitle = (() => {
      if (title.includes(':')) {
        const [category, ...rest] = title.split(':');
        return {
          category: category.trim(),
          mainTitle: rest.join(':').trim()
        };
      }
      return { category: null, mainTitle: title };
    })();
    
    useEffect(() => {
      // Timeout fallback: if image doesn't load in 15s, show fallback
      if (displayUrl && !imageLoaded) {
        const timeout = setTimeout(() => {
          console.warn('Cover image load timeout, showing fallback');
          setImageFailed(true);
          setImageLoaded(true);
        }, 15000);
        return () => clearTimeout(timeout);
      }
    }, [displayUrl, imageLoaded]);

    return (
      <div
        ref={ref}
        className="w-full max-w-md mx-auto aspect-[3/4] gradient-paper rounded-sm shadow-book p-10 md:p-12 flex flex-col justify-between animate-page-turn relative overflow-hidden border border-border/30"
      >
        {/* Deckle edge effect */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
          <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
          <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
        </div>

        {/* Main Content Area - Vertical layout: Image on top, text below */}
        <div className="flex-1 flex flex-col items-center justify-start pt-4 text-center">
        {/* AI-Generated Cover Image - Top */}
          <div className="relative w-full max-w-[180px] md:max-w-[200px] aspect-square mb-6">
            {isLoadingImage && !displayUrl ? (
              <Skeleton className="w-full h-full rounded-lg" />
            ) : displayUrl && !imageFailed ? (
              <div className="w-full h-full rounded-lg overflow-hidden border-2 border-foreground/10 relative bg-secondary/10">
                {!imageLoaded && (
                  <Skeleton className="absolute inset-0 rounded-lg" />
                )}
                <img
                  src={displayUrl}
                  alt={`Cover illustration for ${title}`}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    console.warn('Cover image failed to load, showing fallback');
                    setImageFailed(true);
                    setImageLoaded(true);
                  }}
                  loading="eager"
                  crossOrigin="anonymous"
                />
              </div>
            ) : (
              <Skeleton className="w-full h-full rounded-lg" />
            )}
          </div>

          {/* Premium Magazine Title Layout */}
          {parsedTitle.category ? (
            <>
              {/* Category Label */}
              <p className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-muted-foreground/60 font-sans font-medium mb-2">
                {parsedTitle.category}
              </p>
              {/* Main Title */}
              <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-medium text-foreground leading-tight text-center tracking-wide mb-3">
                {parsedTitle.mainTitle}
              </h1>
            </>
          ) : (
            <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-medium text-foreground leading-tight text-center tracking-wide mb-3">
              {parsedTitle.mainTitle}
            </h1>
          )}

          {/* Decorative divider */}
          <div className="w-10 h-[1px] bg-foreground/20 mb-3" />

          {/* Subtitle - Use dynamic subtitle from props */}
          {subtitle && (
            <p className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-muted-foreground/50 font-serif">
              {subtitle}
            </p>
          )}
        </div>

        {/* Bottom branding - matches header logo exactly */}
        <div className="text-center flex flex-col items-center gap-3 pt-4">
          {/* Logo icon matching Logo.tsx */}
          <div className="relative w-8 h-8 opacity-60">
            {/* Vertical loom lines */}
            <div className="absolute left-1 top-1 bottom-1 w-[2px] bg-foreground rounded-full" />
            <div className="absolute left-1/2 -translate-x-1/2 top-1 bottom-1 w-[2px] bg-foreground rounded-full" />
            <div className="absolute right-1 top-1 bottom-1 w-[2px] bg-foreground rounded-full" />
            {/* Horizontal page fold */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-foreground rounded-full" />
            {/* Corner fold detail */}
            <div className="absolute right-0 top-0 w-2 h-2 border-r-2 border-t-2 border-foreground rounded-tr-sm opacity-60" />
          </div>
          {/* Brand name */}
          <span className="font-serif text-sm font-normal tracking-tight text-muted-foreground/50">
            Loom & Page
          </span>
          {/* Disclaimer */}
          <p className="text-[8px] text-center text-muted-foreground/40 leading-relaxed max-w-[200px] italic">
            AI-generated content for creative inspiration only. Not professional advice.
          </p>
        </div>
      </div>
    );
  }
);

BookCover.displayName = 'BookCover';

export default BookCover;

