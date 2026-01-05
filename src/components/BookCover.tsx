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
    <div className="w-full max-w-md mx-auto aspect-[3/4] gradient-paper rounded-sm shadow-book p-8 md:p-10 flex flex-col justify-between animate-page-turn relative overflow-hidden border border-border/30">
      {/* Deckle edge effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
      </div>

      {/* Top decorative element */}
      <div className="flex justify-center">
        <div className="flex gap-1.5">
          <div className="w-10 h-[1px] bg-foreground/15 rounded-full" />
          <div className="w-2 h-[1px] bg-foreground/15 rounded-full" />
          <div className="w-2 h-[1px] bg-foreground/15 rounded-full" />
        </div>
      </div>

      {/* Cover Content Area */}
      <div className="flex-1 flex flex-col items-center justify-between text-center px-2 py-4">
        {/* Main Title - Above Image */}
        <div className="flex flex-col items-center">
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-semibold text-foreground leading-tight text-center px-2 tracking-tight">
            {title}
          </h1>
        </div>

        {/* AI-Generated Cover Image */}
        <div className="relative w-full max-w-[160px] aspect-square my-4">
          {isLoadingImage ? (
            <div className="w-full h-full flex flex-col items-center">
              <div className="w-full aspect-square rounded-full overflow-hidden border-2 border-foreground/10 relative">
                <Skeleton className="w-full h-full rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[85%] h-[85%] rounded-full border border-dashed border-foreground/10 flex items-center justify-center animate-pulse">
                    <TopicIcon className="w-12 h-12 text-foreground/20 stroke-[0.5]" />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground/70 italic font-serif tracking-wide">
                Illustrating your custom guide...
              </p>
            </div>
          ) : coverImageUrl ? (
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-foreground/10 relative">
              {!imageLoaded && (
                <div className="absolute inset-0 bg-secondary/30 animate-pulse flex items-center justify-center">
                  <TopicIcon className="w-12 h-12 text-foreground/20 stroke-[0.5]" />
                </div>
              )}
              <img 
                src={coverImageUrl} 
                alt={`Cover illustration for ${title}`}
                className={`w-full h-full object-cover opacity-80 mix-blend-multiply transition-opacity duration-500 ${imageLoaded ? 'opacity-80' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
                loading="eager"
              />
            </div>
          ) : (
            <div className="w-full h-full rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/20">
              <div className="w-[90%] h-[90%] rounded-full border border-dashed border-foreground/15 flex items-center justify-center">
                <TopicIcon className="w-14 h-14 md:w-16 md:h-16 text-foreground/40 stroke-[0.75]" />
              </div>
            </div>
          )}
        </div>

        {/* Subtitle - Below Image */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-[1px] bg-foreground/15" />
          <p className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 font-serif">
            An Artisan Series Technical Manual
          </p>
        </div>
      </div>

      {/* Bottom branding with logo */}
      <div className="text-center flex flex-col items-center gap-2">
        {/* Mini loom icon */}
        <div className="flex items-center gap-2 opacity-60">
          <div className="flex items-center gap-[2px]">
            <div className="w-[1.5px] h-4 bg-foreground/50 rounded-full" />
            <div className="w-[1.5px] h-4 bg-foreground/50 rounded-full" />
            <div className="w-[1.5px] h-4 bg-foreground/50 rounded-full" />
          </div>
          <div className="w-3 h-[1px] bg-foreground/50 -ml-[6px]" />
        </div>
        <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase font-serif">
          Loom & Page
        </p>
      </div>
    </div>
  );
};

export default BookCover;
