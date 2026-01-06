import { forwardRef, useState } from "react";
import { getTopicIcon } from "@/lib/iconMap";

interface BookCoverProps {
  title: string;
  topic?: string;
  coverImageUrl?: string | null;
}

const BookCover = forwardRef<HTMLDivElement, BookCoverProps>(({ title, topic = "", coverImageUrl }, ref) => {
  const TopicIcon = getTopicIcon(topic || title);
  const [imageLoaded, setImageLoaded] = useState(false);

  // If we have a URL from the AI, we use it.
  // Otherwise, we show a very subtle, faint icon so it doesn't distract.
  const isAiImage = coverImageUrl && coverImageUrl.startsWith("http");

  return (
    <div
      ref={ref}
      className="w-full max-w-md mx-auto aspect-[3/4] bg-white rounded-sm shadow-2xl p-10 md:p-12 flex flex-col justify-between relative overflow-hidden border border-black/5"
    >
      <div className="flex-1 flex flex-col items-center justify-start pt-4 text-center">
        <div className="relative w-full max-w-[240px] aspect-square mb-10 shadow-2xl bg-[#FDFCFB]">
          {isAiImage ? (
            <div className="w-full h-full overflow-hidden border border-black/10">
              <img
                src={coverImageUrl}
                alt={title}
                className={`w-full h-full object-cover transition-opacity duration-1000 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageLoaded(true)}
                crossOrigin="anonymous"
              />
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-secondary/5 animate-pulse" />
              )}
            </div>
          ) : (
            <div className="w-full h-full border border-dashed border-black/10 flex items-center justify-center">
              {/* Subtle icon placeholder only if no image exists */}
              <TopicIcon className="w-12 h-12 text-black/5 stroke-[0.5]" />
            </div>
          )}
        </div>

        <h1 className="font-serif text-3xl md:text-4xl font-light text-foreground leading-tight text-center tracking-tight mb-4 italic">
          {title}
        </h1>

        <div className="w-16 h-[0.5px] bg-foreground/30 mb-6" />

        <p className="text-[10px] md:text-[11px] uppercase tracking-[0.4em] text-foreground/60 font-serif font-light px-4">
          An Artisan Instructional Narrative
        </p>
      </div>

      <div className="text-center pt-8 border-t border-black/5">
        <p className="text-[11px] tracking-[0.6em] text-foreground font-serif font-semibold uppercase">LOOM & PAGE</p>
      </div>
    </div>
  );
});

BookCover.displayName = "BookCover";
export default BookCover;
