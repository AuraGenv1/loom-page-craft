import { getTopicIcon } from '@/lib/iconMap';
import { Skeleton } from '@/components/ui/skeleton';

interface BookCoverProps {
  title: string;
  topic?: string;
  coverImageUrl?: string | null;
  isLoadingImage?: boolean;
}

const BookCover = ({ title, topic = '', coverImageUrl, isLoadingImage }: BookCoverProps) => {
  const TopicIcon = getTopicIcon(topic || title);

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

      {/* Cover Image Area */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-2 py-4">
        {/* AI-Generated Cover Image or Fallback Icon */}
        <div className="relative mb-6 w-full max-w-[200px] aspect-square">
          {isLoadingImage ? (
            <Skeleton className="w-full h-full rounded-lg" />
          ) : coverImageUrl ? (
            <div className="w-full h-full rounded-lg overflow-hidden border border-foreground/10 bg-secondary/20">
              <img 
                src={coverImageUrl} 
                alt={`Cover illustration for ${title}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full h-full rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/20">
              <div className="w-[90%] h-[90%] rounded-full border border-dashed border-foreground/15 flex items-center justify-center">
                <TopicIcon className="w-16 h-16 md:w-20 md:h-20 text-foreground/40 stroke-[0.75]" />
              </div>
            </div>
          )}
          {/* Corner accents */}
          <div className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-foreground/20" />
          <div className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-foreground/20" />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-foreground/20" />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-foreground/20" />
        </div>

        <p className="text-[10px] md:text-xs uppercase tracking-[0.4em] text-muted-foreground mb-2">
          A Complete Guide
        </p>
        <h1 className="font-serif text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold text-foreground leading-tight mb-3 line-clamp-3 text-center px-2">
          {title}
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground/70 italic tracking-wide">
          A Comprehensive Instructional Volume
        </p>
        <div className="w-16 h-[1px] bg-foreground/20 mt-4" />
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
