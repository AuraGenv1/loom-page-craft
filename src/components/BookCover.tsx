import { forwardRef, useEffect, useState, useCallback } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import WeavingLoader from '@/components/WeavingLoader';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, RefreshCw, Download, Palette } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface BookCoverProps {
  title: string;
  subtitle?: string;
  topic?: string;
  /** Array of cover image URLs for fallback cycling */
  coverImageUrls?: string[];
  /** @deprecated Use coverImageUrls instead */
  coverImageUrl?: string | null;
  isLoadingImage?: boolean;
  isAdmin?: boolean;
  bookId?: string;
  backCoverUrl?: string;
  spineText?: string;
  onCoverUpdate?: (updates: { coverImageUrls?: string[]; backCoverUrl?: string; spineText?: string }) => void;
}

const BookCover = forwardRef<HTMLDivElement, BookCoverProps>(
  ({ 
    title, 
    subtitle, 
    topic = '', 
    coverImageUrls = [], 
    coverImageUrl, 
    isLoadingImage,
    isAdmin = false,
    bookId,
    backCoverUrl,
    spineText: initialSpineText,
    onCoverUpdate
  }, ref) => {
    const TopicIcon = getTopicIcon(topic || title);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
    
    // Cover Studio state
    const [studioOpen, setStudioOpen] = useState(false);
    const [frontPrompt, setFrontPrompt] = useState(topic || title);
    const [backPrompt, setBackPrompt] = useState(`${topic || title} texture background`);
    const [spineText, setSpineText] = useState(initialSpineText || title);
    const [spineColor, setSpineColor] = useState('#1a1a2e');
    const [isRegeneratingFront, setIsRegeneratingFront] = useState(false);
    const [isRegeneratingBack, setIsRegeneratingBack] = useState(false);
    const [localBackCoverUrl, setLocalBackCoverUrl] = useState(backCoverUrl || '');
    const [localFrontUrls, setLocalFrontUrls] = useState<string[]>(coverImageUrls);
    
    // Merge legacy coverImageUrl prop with coverImageUrls array
    const allUrls = localFrontUrls.length > 0 
      ? localFrontUrls 
      : (coverImageUrls.length > 0 ? coverImageUrls : (coverImageUrl ? [coverImageUrl] : []));
    
    // Lock in the first valid URL to prevent flicker
    const [lockedUrls, setLockedUrls] = useState<string[]>([]);

    // Update locked URLs when we get new ones
    useEffect(() => {
      if (allUrls.length > 0 && lockedUrls.length === 0) {
        setLockedUrls(allUrls);
        setImageLoaded(false);
        setCurrentUrlIndex(0);
      } else if (allUrls.length > 0 && JSON.stringify(allUrls) !== JSON.stringify(lockedUrls)) {
        // DB update with new URLs - use them
        setLockedUrls(allUrls);
        setCurrentUrlIndex(0);
        setImageLoaded(false);
      }
    }, [allUrls, lockedUrls]);

    // Sync props to local state
    useEffect(() => {
      if (backCoverUrl) setLocalBackCoverUrl(backCoverUrl);
    }, [backCoverUrl]);

    useEffect(() => {
      if (coverImageUrls.length > 0) setLocalFrontUrls(coverImageUrls);
    }, [coverImageUrls]);
    
    // Current display URL with fallback cycling
    const displayUrl = lockedUrls[currentUrlIndex] || null;
    
    // Handle image load error - cycle to next URL
    const handleImageError = useCallback(() => {
      console.warn(`Cover image failed to load (index ${currentUrlIndex}):`, displayUrl);
      
      if (currentUrlIndex < lockedUrls.length - 1) {
        // Try next URL
        console.log(`Cycling to next cover image (${currentUrlIndex + 1}/${lockedUrls.length})`);
        setCurrentUrlIndex(prev => prev + 1);
        setImageLoaded(false);
      } else {
        // All URLs exhausted, show fallback
        console.warn('All cover URLs failed, showing fallback');
        setImageLoaded(true); // Mark as loaded to stop skeleton
      }
    }, [currentUrlIndex, displayUrl, lockedUrls.length]);
    
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
      // Timeout fallback: if image doesn't load in 15s, try next or show fallback
      if (displayUrl && !imageLoaded) {
        const timeout = setTimeout(() => {
          console.warn('Cover image load timeout');
          handleImageError();
        }, 15000);
        return () => clearTimeout(timeout);
      }
    }, [displayUrl, imageLoaded, handleImageError]);

    // Check if we have any valid URL after fallbacks
    const hasValidUrl = displayUrl && currentUrlIndex < lockedUrls.length;

    // Get session ID for API calls
    const getSessionId = () => {
      let sessionId = localStorage.getItem('bookSessionId');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('bookSessionId', sessionId);
      }
      return sessionId;
    };

    // Regenerate front cover
    const handleRegenerateFront = async () => {
      setIsRegeneratingFront(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-cover-image', {
          body: {
            topic: frontPrompt,
            title: title,
            sessionId: getSessionId(),
            variant: 'cover'
          }
        });

        if (error) throw error;

        const newUrls = data.imageUrls || [data.imageUrl];
        setLocalFrontUrls(newUrls);
        setLockedUrls(newUrls);
        setCurrentUrlIndex(0);
        setImageLoaded(false);

        // Save to database if bookId exists
        if (bookId) {
          await supabase.from('books').update({ cover_image_url: newUrls }).eq('id', bookId);
        }

        onCoverUpdate?.({ coverImageUrls: newUrls });
        toast.success('Front cover regenerated!');
      } catch (err) {
        console.error('Failed to regenerate front cover:', err);
        toast.error('Failed to regenerate front cover');
      } finally {
        setIsRegeneratingFront(false);
      }
    };

    // Generate back cover
    const handleGenerateBack = async () => {
      setIsRegeneratingBack(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-cover-image', {
          body: {
            topic: backPrompt,
            title: title,
            sessionId: getSessionId(),
            variant: 'back-cover'
          }
        });

        if (error) throw error;

        const newUrl = data.imageUrl;
        setLocalBackCoverUrl(newUrl);

        // Note: back_cover_url would need to be added to the books table schema
        // For now, we'll just update local state
        onCoverUpdate?.({ backCoverUrl: newUrl });
        toast.success('Back cover generated!');
      } catch (err) {
        console.error('Failed to generate back cover:', err);
        toast.error('Failed to generate back cover');
      } finally {
        setIsRegeneratingBack(false);
      }
    };

    // Save spine text
    const handleSaveSpine = () => {
      onCoverUpdate?.({ spineText });
      toast.success('Spine text updated!');
    };

    // Download KDP Full Wrap PDF
    const handleDownloadKDP = async () => {
      toast.info('Generating KDP cover PDF...');
      
      try {
        // KDP 6x9 book dimensions with bleed and spine
        // Full wrap: 12.485" x 9.25" at 300 DPI
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'in',
          format: [9.25, 12.485]
        });

        const pageWidth = 12.485;
        const pageHeight = 9.25;
        const spineWidth = 0.485; // Approximate for ~200 pages
        const coverWidth = (pageWidth - spineWidth) / 2;

        // Load images as base64
        const loadImage = (url: string): Promise<HTMLImageElement> => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
          });
        };

        // Draw background
        pdf.setFillColor(spineColor);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');

        // Back cover (left side)
        if (localBackCoverUrl) {
          try {
            const backImg = await loadImage(localBackCoverUrl);
            pdf.addImage(backImg, 'JPEG', 0.125, 0.125, coverWidth - 0.25, pageHeight - 0.25);
          } catch (e) {
            console.warn('Could not load back cover image');
          }
        }

        // Spine (center)
        pdf.setFillColor(spineColor);
        pdf.rect(coverWidth, 0, spineWidth, pageHeight, 'F');
        
        // Spine text (rotated)
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        pdf.text(spineText || title, coverWidth + spineWidth / 2, pageHeight / 2, {
          angle: 90,
          align: 'center'
        });

        // Front cover (right side)
        if (displayUrl) {
          try {
            const frontImg = await loadImage(displayUrl);
            pdf.addImage(frontImg, 'JPEG', coverWidth + spineWidth + 0.125, 0.125, coverWidth - 0.25, pageHeight - 0.25);
          } catch (e) {
            console.warn('Could not load front cover image');
          }
        }

        // Add title on front cover
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(24);
        const frontCenterX = coverWidth + spineWidth + coverWidth / 2;
        pdf.text(title, frontCenterX, 1.5, { align: 'center' });

        pdf.save(`${title.replace(/[^a-zA-Z0-9]/g, '_')}_KDP_Cover.pdf`);
        toast.success('KDP cover PDF downloaded!');
      } catch (err) {
        console.error('Failed to generate PDF:', err);
        toast.error('Failed to generate PDF');
      }
    };

    return (
      <>
        <div
          ref={ref}
          className="w-full max-w-md mx-auto aspect-[3/4] gradient-paper rounded-sm shadow-book p-10 md:p-12 flex flex-col justify-between animate-page-turn relative overflow-hidden border border-border/30"
        >
          {/* Admin Edit Button */}
          {isAdmin && (
            <Button
              onClick={() => setStudioOpen(true)}
              variant="secondary"
              size="sm"
              className="absolute top-3 right-3 z-10 opacity-80 hover:opacity-100"
            >
              <Pencil className="w-4 h-4 mr-1" />
              Edit Cover
            </Button>
          )}

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
              ) : hasValidUrl ? (
                <div className="w-full h-full rounded-lg overflow-hidden border-2 border-foreground/10 relative bg-secondary/10 print:opacity-100 print:filter-none">
                  {!imageLoaded && (
                    <Skeleton className="absolute inset-0 rounded-lg print:hidden" />
                  )}
                  <img
                    key={displayUrl} // Force re-render on URL change
                    src={displayUrl}
                    alt={`Cover illustration for ${title}`}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'} print:opacity-100 print:filter-none`}
                    onLoad={() => setImageLoaded(true)}
                    onError={handleImageError}
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

            {/* Subtitle - Use dynamic subtitle from props, avoid duplication */}
            {subtitle && !parsedTitle.mainTitle.toLowerCase().includes(subtitle.toLowerCase().replace('a ', '').replace('an ', '')) && (
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

        {/* Cover Studio Dialog */}
        <Dialog open={studioOpen} onOpenChange={setStudioOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                KDP Cover Studio
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="front" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="front">Front Cover</TabsTrigger>
                <TabsTrigger value="back">Back Cover</TabsTrigger>
                <TabsTrigger value="spine">Spine</TabsTrigger>
                <TabsTrigger value="wrap">Full Wrap</TabsTrigger>
              </TabsList>

              {/* Front Cover Tab */}
              <TabsContent value="front" className="space-y-4 pt-4">
                <div className="flex gap-6">
                  <div className="flex-1">
                    <div className="aspect-[3/4] bg-secondary/20 rounded-lg overflow-hidden border">
                      {displayUrl ? (
                        <img src={displayUrl} alt="Front Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <Label htmlFor="front-prompt">Image Prompt</Label>
                      <Input
                        id="front-prompt"
                        value={frontPrompt}
                        onChange={(e) => setFrontPrompt(e.target.value)}
                        placeholder="Enter image description..."
                      />
                    </div>
                    <Button 
                      onClick={handleRegenerateFront} 
                      disabled={isRegeneratingFront}
                      className="w-full"
                    >
                      {isRegeneratingFront ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Regenerate Front Image
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Back Cover Tab */}
              <TabsContent value="back" className="space-y-4 pt-4">
                <div className="flex gap-6">
                  <div className="flex-1">
                    <div className="aspect-[3/4] bg-secondary/20 rounded-lg overflow-hidden border">
                      {localBackCoverUrl ? (
                        <img src={localBackCoverUrl} alt="Back Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No back cover yet
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <Label htmlFor="back-prompt">Back Cover Prompt</Label>
                      <Input
                        id="back-prompt"
                        value={backPrompt}
                        onChange={(e) => setBackPrompt(e.target.value)}
                        placeholder="Enter texture/background description..."
                      />
                    </div>
                    <Button 
                      onClick={handleGenerateBack} 
                      disabled={isRegeneratingBack}
                      className="w-full"
                    >
                      {isRegeneratingBack ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Generate Back Cover
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Spine Tab */}
              <TabsContent value="spine" className="space-y-4 pt-4">
                <div className="flex gap-6">
                  <div className="flex-1 flex justify-center">
                    <div 
                      className="w-16 h-80 rounded flex items-center justify-center"
                      style={{ backgroundColor: spineColor }}
                    >
                      <span 
                        className="text-white text-sm font-medium whitespace-nowrap"
                        style={{ 
                          writingMode: 'vertical-rl',
                          textOrientation: 'mixed',
                          transform: 'rotate(180deg)'
                        }}
                      >
                        {spineText || title}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <Label htmlFor="spine-text">Spine Text</Label>
                      <Input
                        id="spine-text"
                        value={spineText}
                        onChange={(e) => setSpineText(e.target.value)}
                        placeholder="Book title for spine..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="spine-color">Spine Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="spine-color"
                          type="color"
                          value={spineColor}
                          onChange={(e) => setSpineColor(e.target.value)}
                          className="w-16 h-10 p-1 cursor-pointer"
                        />
                        <Input
                          value={spineColor}
                          onChange={(e) => setSpineColor(e.target.value)}
                          placeholder="#1a1a2e"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveSpine} className="w-full">
                      Save Spine Settings
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Full Wrap Preview Tab */}
              <TabsContent value="wrap" className="space-y-4 pt-4">
                <div className="space-y-4">
                  <div className="flex items-stretch justify-center gap-0 border rounded-lg overflow-hidden">
                    {/* Back Cover */}
                    <div className="w-48 aspect-[3/4] bg-secondary/20">
                      {localBackCoverUrl ? (
                        <img src={localBackCoverUrl} alt="Back" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                          Back
                        </div>
                      )}
                    </div>
                    {/* Spine */}
                    <div 
                      className="w-6 flex items-center justify-center"
                      style={{ backgroundColor: spineColor }}
                    >
                      <span 
                        className="text-white text-[8px] font-medium whitespace-nowrap"
                        style={{ 
                          writingMode: 'vertical-rl',
                          textOrientation: 'mixed',
                          transform: 'rotate(180deg)'
                        }}
                      >
                        {spineText || title}
                      </span>
                    </div>
                    {/* Front Cover */}
                    <div className="w-48 aspect-[3/4] bg-secondary/20">
                      {displayUrl ? (
                        <img src={displayUrl} alt="Front" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                          Front
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground text-center">
                    Full wrap preview: Back Cover | Spine | Front Cover
                  </p>

                  <Button onClick={handleDownloadKDP} className="w-full" size="lg">
                    <Download className="w-4 h-4 mr-2" />
                    Download KDP Full Wrap PDF
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

BookCover.displayName = 'BookCover';

export default BookCover;
