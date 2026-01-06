import { forwardRef, useEffect, useState } from "react";
import { getTopicIcon } from "@/lib/iconMap";
import WeavingLoader from "@/components/WeavingLoader";

interface BookCoverProps {
  title: string;
  subtitle?: string;
  topic?: string;
  coverImageUrl?: string | null;
  isLoadingImage?: boolean;
  coverStyle?: string;
}

const BookCover = forwardRef<HTMLDivElement, BookCoverProps>(
  ({ title, subtitle, topic = "", coverImageUrl, isLoadingImage, coverStyle }, ref) => {
    const TopicIcon = getTopicIcon(topic || title);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);

    const isPhotographyStyle = true; // Forcing premium style

    useEffect(() => {
      setImageLoaded(false);
      setImageFailed(false);

      if (coverImageUrl) {
        const timeout = setTimeout(() => {
          if (!imageLoaded) {
            setImageFailed(true);
            setImageLoaded(true);
          }
        }, 15000);
        return () => clearTimeout(timeout);
      }
    }, [coverImageUrl]);

    return (
      <div
        ref={ref}
        className="w-full max-w-md mx-auto aspect-[3/4] bg-white rounded-sm shadow-2xl p-10 md:p-12 flex flex-col justify-between relative overflow-hidden border border-black/5"
      >
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col items-center justify-start pt-4 text-center">
          {/* AI-Generated Cover Image */}
          <div className="relative w-full max-w-[220px] aspect-square mb-10 shadow-xl">
            {isLoadingImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-secondary/10">
                <WeavingLoader text="Capturing..." className="w-full px-4" />
              </div>
            ) : coverImageUrl && !imageFailed ? (
              <div className="w-full h-full overflow-hidden border border-black/10 relative">
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <WeavingLoader text="Loading..." className="w-full px-4" />
                  </div>
                )}
                <img
                  src={coverImageUrl}
                  alt={title}
                  className={`w-full h-full object-cover transition-opacity duration-700 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageFailed(true)}
                  crossOrigin="anonymous"
                />
              </div>
            ) : (
              <div className="w-full h-full border flex items-center justify-center bg-secondary/5">
                <TopicIcon className="w-16 h-16 text-foreground/20 stroke-[0.5]" />
              </div>
            )}
          </div>

          {/* Luxury Typography */}
          <h1 className="font-serif text-3xl md:text-4xl font-light text-foreground leading-tight text-center tracking-tight mb-4 italic">
            {title}
          </h1>

          <div className="w-16 h-[0.5px] bg-foreground/30 mb-6" />

          <p className="text-[10px] md:text-[11px] uppercase tracking-[0.4em] text-foreground/60 font-serif font-light px-4">
            {subtitle || "A Definitive Visual Narrative"}
          </p>
        </div>

        {/* Publisher Branding */}
        <div className="text-center flex flex-col items-center gap-3 pt-8 border-t border-black/5">
          <p className="text-[11px] tracking-[0.6em] text-foreground font-serif font-semibold uppercase">LOOM & PAGE</p>
          <p className="text-[8px] tracking-[0.2em] text-muted-foreground/60 uppercase italic font-serif">
            London • New York • Milan
          </p>
        </div>
      </div>
    );
  },
);

BookCover.displayName = "BookCover";
export default BookCover;
