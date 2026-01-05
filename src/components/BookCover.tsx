import { useState } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import { Skeleton } from '@/components/ui/skeleton';

interface BookCoverProps {
  title: string;
  subtitle?: string;
  topic?: string;
  coverImageUrl?: string | null;
  isLoadingImage?: boolean;
}

const BookCover = ({ title, subtitle, topic = '', coverImageUrl, isLoadingImage }: BookCoverProps) => {
  const TopicIcon = getTopicIcon(topic || title);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="w-full max-w-md mx-auto aspect-[3/4] gradient-paper rounded-sm shadow-book p-10 md:p-12 flex flex-col justify-between animate-page-turn relative overflow-hidden border border-border/30">
      {/* Deckle edge effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
      </div>

      {/* Main Content Area - Centered vertically */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        {/* AI-Generated Cover Image - Top Center */}
        <div className="relative w-full max-w-[140px] md:max-w-[160px] aspect-square mb-8">
          {isLoadingImage ? (
            <div className="w-full h-full flex flex-col items-center">
              <div className="w-full aspect-square rounded-full overflow-hidden border-2 border-foreground/10 relative">
                <Skeleton className="w-full h-full rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[85%] h-[85%] rounded-full border border-dashed border-foreground/10 flex items-center justify-center animate-pulse">
                    <TopicIcon className="w-10 h-10 text-foreground/20 stroke-[0.5]" />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground/60 italic font-serif tracking-wide">
                Illustrating...
              </p>
            </div>
          ) : coverImageUrl ? (
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-foreground/10 relative">
              {!imageLoaded && (
                <div className="absolute inset-0 bg-secondary/30 animate-pulse flex items-center justify-center">
                  <TopicIcon className="w-10 h-10 text-foreground/20 stroke-[0.5]" />
                </div>
              )}
              <img 
                src={coverImageUrl} 
                alt={`Cover illustration for ${title}`}
                className={`w-full h-full object-cover opacity-90 mix-blend-multiply transition-opacity duration-500 ${imageLoaded ? 'opacity-90' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
                loading="eager"
              />
            </div>
          ) : (
            <div className="w-full h-full rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/20">
              <div className="w-[90%] h-[90%] rounded-full border border-dashed border-foreground/15 flex items-center justify-center">
                <TopicIcon className="w-12 h-12 md:w-14 md:h-14 text-foreground/40 stroke-[0.75]" />
              </div>
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
};

export default BookCover;
