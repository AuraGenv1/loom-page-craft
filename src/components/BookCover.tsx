import { forwardRef, useEffect, useState } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import WeavingLoader from '@/components/WeavingLoader';

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

    useEffect(() => {
      setImageLoaded(false);
    }, [coverImageUrl]);

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
            {isLoadingImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-foreground/10 bg-secondary/20">
                <WeavingLoader text="Weaving your masterpiece..." className="w-full px-4" />
              </div>
            ) : coverImageUrl ? (
              <div className="w-full h-full rounded-lg overflow-hidden border-2 border-foreground/10 relative bg-secondary/10">
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <WeavingLoader text="Weaving your masterpiece..." className="w-full px-4" />
                  </div>
                )}
                <img
                  src={coverImageUrl}
                  alt={`Cover illustration for ${title}`}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImageLoaded(true)}
                  loading="eager"
                  crossOrigin="anonymous"
                />
              </div>
            ) : (
              <div className="w-full h-full rounded-lg border-2 border-dashed border-foreground/10 flex items-center justify-center bg-secondary/20">
                <TopicIcon className="w-16 h-16 md:w-20 md:h-20 text-foreground/30 stroke-[0.5]" />
              </div>
            )}
          </div>

          {/* Main Title - Below Image */}
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-medium text-foreground leading-tight text-center tracking-wide mb-3">
            {title}
          </h1>

          {/* Decorative divider */}
          <div className="w-10 h-[1px] bg-foreground/20 mb-3" />

          {/* Subtitle */}
          <p className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-muted-foreground/50 font-serif">
            An Artisan Series Technical Manual
          </p>
        </div>

        {/* Bottom branding */}
        <div className="text-center flex flex-col items-center gap-2 pt-4">
          <div className="flex items-center gap-2 opacity-50">
            <div className="flex items-center gap-[2px]">
              <div className="w-[1.5px] h-3.5 bg-foreground/50 rounded-full" />
              <div className="w-[1.5px] h-3.5 bg-foreground/50 rounded-full" />
              <div className="w-[1.5px] h-3.5 bg-foreground/50 rounded-full" />
            </div>
            <div className="w-2.5 h-[1px] bg-foreground/50 -ml-[5px]" />
          </div>
          <p className="text-[9px] tracking-[0.3em] text-muted-foreground/40 uppercase font-serif">
            Loom & Page
          </p>
        </div>
      </div>
    );
  }
);

BookCover.displayName = 'BookCover';

export default BookCover;

