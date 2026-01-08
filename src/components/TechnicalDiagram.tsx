import { forwardRef, useState } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import WeavingLoader from './WeavingLoader';
import { X, ZoomIn, AlertCircle } from 'lucide-react';

interface TechnicalDiagramProps {
  caption: string;
  plateNumber?: string;
  topic?: string;
  isGenerating?: boolean;
  imageUrl?: string | null;
  imageDescription?: string;
}

const TechnicalDiagram = forwardRef<HTMLDivElement, TechnicalDiagramProps>(
  ({ caption, plateNumber = '1.1', topic = '', isGenerating = false, imageUrl, imageDescription }, ref) => {
    const TopicIcon = getTopicIcon(topic);
    const [imageError, setImageError] = useState(false);
    const [isZoomed, setIsZoomed] = useState(false);
    
    // Show loading state if no image URL yet and not errored
    const isLoading = isGenerating || (!imageUrl && !imageError);
    const showFallback = imageError || (!isLoading && !imageUrl);

    const handleImageError = () => {
      console.warn('Diagram image failed to load:', imageUrl);
      setImageError(true);
    };

    const handleZoomToggle = () => {
      if (imageUrl && !imageError) {
        setIsZoomed(!isZoomed);
      }
    };

    return (
      <>
        <div ref={ref} className="w-full my-12 relative">
          {/* Plate container */}
          <div className="bg-secondary/20 border border-border/50 shadow-sm overflow-hidden">
            {/* Plate header */}
            <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-border/30">
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium">
                Plate {plateNumber}
              </span>
              <div className="flex items-center gap-3">
                {imageUrl && !imageError && !isLoading && (
                  <button
                    onClick={handleZoomToggle}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 hover:text-foreground/80 transition-colors"
                    aria-label="Zoom illustration"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Zoom</span>
                  </button>
                )}
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
                  Illustration
                </span>
              </div>
            </div>

            {/* Image container */}
            <div className="w-full aspect-video bg-background/50 flex flex-col items-center justify-center relative overflow-hidden">
              {isLoading ? (
                <div className="w-full h-full flex flex-col items-center justify-center px-6 gap-4">
                  <WeavingLoader text="Weaving..." className="w-full max-w-md" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/10">
                      <TopicIcon className="w-10 h-10 md:w-12 md:h-12 text-foreground/30 stroke-[0.5]" />
                    </div>
                  </div>
                </div>
              ) : showFallback ? (
                /* Fallback: High-quality topic icon when image fails */
                <div className="w-full h-full flex flex-col items-center justify-center px-6 gap-4 bg-gradient-to-br from-secondary/30 to-secondary/10">
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-2 border-foreground/10 flex items-center justify-center bg-background/50 shadow-inner">
                    <TopicIcon className="w-12 h-12 md:w-16 md:h-16 text-foreground/40 stroke-[0.75]" />
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground/60">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">Illustration unavailable</span>
                  </div>
                </div>
              ) : (
                <img
                  src={imageUrl!}
                  alt={imageDescription || `Instructional diagram: ${caption}`}
                  className="w-full h-full object-cover animate-fade-in cursor-zoom-in"
                  loading="lazy"
                  crossOrigin="anonymous"
                  onError={handleImageError}
                  onClick={handleZoomToggle}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>

            {/* Caption box */}
            <div className="bg-secondary/50 border-t border-border/30 px-4 py-4 md:px-6">
              <p className="text-sm text-muted-foreground italic font-serif text-center">
                Plate {plateNumber} — {caption}
              </p>
              {imageDescription && !isLoading && !showFallback && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  <p className="text-xs text-muted-foreground/80 text-center leading-relaxed max-w-2xl mx-auto">
                    {imageDescription}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Zoom Modal */}
        {isZoomed && imageUrl && !imageError && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
            onClick={handleZoomToggle}
          >
            <button
              onClick={handleZoomToggle}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors bg-black/50 rounded-full"
              aria-label="Close zoom"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={imageUrl}
              alt={imageDescription || `Instructional diagram: ${caption}`}
              className="max-w-full max-h-full object-contain"
              crossOrigin="anonymous"
            />
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <p className="text-white/80 text-sm font-serif italic">
                Plate {plateNumber} — {caption}
              </p>
            </div>
          </div>
        )}
      </>
    );
  }
);

TechnicalDiagram.displayName = 'TechnicalDiagram';

export default TechnicalDiagram;
