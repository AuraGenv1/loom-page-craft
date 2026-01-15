import { forwardRef, useEffect, useState, useCallback } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, RefreshCw, Download, Palette, BookOpen, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { BookData } from '@/lib/bookTypes';
import { generateCleanPDF } from '@/lib/generateCleanPDF';

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
  bookData?: BookData;
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
    bookData,
    onCoverUpdate
  }, ref) => {
    const TopicIcon = getTopicIcon(topic || title);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
    
    // Cover Studio state
    const [studioOpen, setStudioOpen] = useState(false);
    const [frontPrompt, setFrontPrompt] = useState('');
    const [backPrompt, setBackPrompt] = useState('');
    const [spineText, setSpineText] = useState(initialSpineText || title);
    const [spineColor, setSpineColor] = useState('#1a1a2e');
    const [isRegeneratingFront, setIsRegeneratingFront] = useState(false);
    const [isRegeneratingBack, setIsRegeneratingBack] = useState(false);
    const [localBackCoverUrl, setLocalBackCoverUrl] = useState(backCoverUrl || '');
    const [localFrontUrls, setLocalFrontUrls] = useState<string[]>(coverImageUrls);
    const [isDownloadingManuscript, setIsDownloadingManuscript] = useState(false);
    
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

    // Initialize prompts when studio opens
    useEffect(() => {
      if (studioOpen) {
        setFrontPrompt(topic || title);
        setBackPrompt(`abstract texture background ${topic || 'elegant'}`);
      }
    }, [studioOpen, topic, title]);
    
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

    // Regenerate front cover with custom prompt
    const handleRegenerateFront = async () => {
      if (!frontPrompt.trim()) {
        toast.error('Please enter a custom prompt for the front cover');
        return;
      }

      setIsRegeneratingFront(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-cover-image', {
          body: {
            topic: topic || title,
            title: title,
            sessionId: getSessionId(),
            variant: 'cover',
            customPrompt: frontPrompt.trim()
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
            topic: topic || title,
            title: title,
            sessionId: getSessionId(),
            variant: 'back-cover',
            customPrompt: backPrompt.trim() || undefined
          }
        });

        if (error) throw error;

        const newUrl = data.imageUrl;
        setLocalBackCoverUrl(newUrl);

        onCoverUpdate?.({ backCoverUrl: newUrl });
        toast.success('Back cover generated!');
      } catch (err) {
        console.error('Failed to generate back cover:', err);
        toast.error('Failed to generate back cover');
      } finally {
        setIsRegeneratingBack(false);
      }
    };

    // Save spine settings
    const handleSaveSpine = () => {
      onCoverUpdate?.({ spineText });
      toast.success('Spine settings saved!');
    };

    // Download KDP Full Wrap PDF
    const handleDownloadKDP = async () => {
      toast.info('Generating KDP cover PDF...');
      
      try {
        // KDP 6x9 book dimensions with bleed and spine
        // Full wrap: approximately 12.485" x 9.25" at 300 DPI
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

        // Draw background with spine color
        pdf.setFillColor(spineColor);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');

        // Back cover (left side)
        if (localBackCoverUrl) {
          try {
            const backImg = await loadImage(localBackCoverUrl);
            pdf.addImage(backImg, 'JPEG', 0.125, 0.125, coverWidth - 0.25, pageHeight - 0.25);
          } catch (e) {
            console.warn('Could not load back cover image');
            // Draw placeholder for back cover
            pdf.setFillColor('#f0f0f0');
            pdf.rect(0.125, 0.125, coverWidth - 0.25, pageHeight - 0.25, 'F');
          }
        } else {
          // Draw placeholder for back cover
          pdf.setFillColor('#f0f0f0');
          pdf.rect(0.125, 0.125, coverWidth - 0.25, pageHeight - 0.25, 'F');
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

        // Add title on front cover (overlaid on image)
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(28);
        const frontCenterX = coverWidth + spineWidth + coverWidth / 2;
        // Add text shadow effect with multiple layers
        pdf.setTextColor(0, 0, 0);
        pdf.text(title, frontCenterX + 0.02, 1.52, { align: 'center' });
        pdf.setTextColor(255, 255, 255);
        pdf.text(title, frontCenterX, 1.5, { align: 'center' });

        if (subtitle) {
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          pdf.text(subtitle, frontCenterX + 0.01, 2.02, { align: 'center' });
          pdf.setTextColor(200, 200, 200);
          pdf.text(subtitle, frontCenterX, 2.0, { align: 'center' });
        }

        const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_KDP_Cover.pdf`;
        pdf.save(filename);
        toast.success('KDP cover PDF downloaded!');
      } catch (err) {
        console.error('Failed to generate PDF:', err);
        toast.error('Failed to generate PDF');
      }
    };

    // Download manuscript PDF
    const handleDownloadManuscript = async () => {
      if (!bookData) {
        toast.error('Book data not available for manuscript export');
        return;
      }

      setIsDownloadingManuscript(true);
      toast.info('Generating manuscript PDF...');

      try {
        await generateCleanPDF({
          topic: topic || title,
          bookData,
          coverImageUrl: displayUrl || undefined
        });
        toast.success('Manuscript PDF downloaded!');
      } catch (err) {
        console.error('Failed to generate manuscript:', err);
        toast.error('Failed to generate manuscript PDF');
      } finally {
        setIsDownloadingManuscript(false);
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
              className="absolute top-3 right-3 z-10 opacity-80 hover:opacity-100 shadow-md"
            >
              <Pencil className="w-4 h-4 mr-1" />
              Edit Cover / Export KDP
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

        {/* KDP Cover Studio Dialog */}
        <Dialog open={studioOpen} onOpenChange={setStudioOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Palette className="w-6 h-6" />
                KDP Cover Studio & Export Manager
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="front" className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="front" className="text-xs sm:text-sm">Front Cover</TabsTrigger>
                <TabsTrigger value="back" className="text-xs sm:text-sm">Back Cover</TabsTrigger>
                <TabsTrigger value="spine" className="text-xs sm:text-sm">Spine</TabsTrigger>
                <TabsTrigger value="wrap" className="text-xs sm:text-sm">Full Wrap</TabsTrigger>
                <TabsTrigger value="manuscript" className="text-xs sm:text-sm">Manuscript</TabsTrigger>
              </TabsList>

              {/* TAB 1: Front Cover */}
              <TabsContent value="front" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium mb-3">Current Front Cover</h3>
                    <div className="aspect-[3/4] bg-secondary/20 rounded-lg overflow-hidden border max-w-[300px]">
                      {displayUrl ? (
                        <img src={displayUrl} alt="Front Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No image generated
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="front-prompt" className="text-base font-medium">Custom Image Prompt</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Describe the exact image you want (e.g., "Snowy Aspen streets at night with warm cafe lights")
                      </p>
                      <Textarea
                        id="front-prompt"
                        value={frontPrompt}
                        onChange={(e) => setFrontPrompt(e.target.value)}
                        placeholder="Enter a detailed description of the image you want..."
                        rows={4}
                      />
                    </div>
                    <Button 
                      onClick={handleRegenerateFront} 
                      disabled={isRegeneratingFront}
                      className="w-full"
                      size="lg"
                    >
                      {isRegeneratingFront ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Regenerate Front Cover
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: Back Cover */}
              <TabsContent value="back" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium mb-3">Current Back Cover</h3>
                    <div className="aspect-[3/4] bg-secondary/20 rounded-lg overflow-hidden border max-w-[300px]">
                      {localBackCoverUrl ? (
                        <img src={localBackCoverUrl} alt="Back Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground flex-col gap-2">
                          <BookOpen className="w-12 h-12 opacity-50" />
                          <span>No back cover yet</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="back-prompt" className="text-base font-medium">Back Cover Prompt</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Typically a texture or abstract background (e.g., "Marble texture with gold veins", "Blurred city lights")
                      </p>
                      <Textarea
                        id="back-prompt"
                        value={backPrompt}
                        onChange={(e) => setBackPrompt(e.target.value)}
                        placeholder="Enter a texture or abstract background description..."
                        rows={4}
                      />
                    </div>
                    <Button 
                      onClick={handleGenerateBack} 
                      disabled={isRegeneratingBack}
                      className="w-full"
                      size="lg"
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

              {/* TAB 3: Spine */}
              <TabsContent value="spine" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex justify-center">
                    <div>
                      <h3 className="font-medium mb-3 text-center">Spine Preview</h3>
                      <div 
                        className="w-20 h-96 rounded flex items-center justify-center shadow-lg"
                        style={{ backgroundColor: spineColor }}
                      >
                        <span 
                          className="text-white text-sm font-medium whitespace-nowrap max-w-[350px] overflow-hidden text-ellipsis"
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
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="spine-text" className="text-base font-medium">Spine Text</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Usually the book title. Keep it concise for readability.
                      </p>
                      <Input
                        id="spine-text"
                        value={spineText}
                        onChange={(e) => setSpineText(e.target.value)}
                        placeholder="Book title for spine..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="spine-color" className="text-base font-medium">Spine Background Color</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="spine-color"
                          type="color"
                          value={spineColor}
                          onChange={(e) => setSpineColor(e.target.value)}
                          className="w-20 h-12 p-1 cursor-pointer"
                        />
                        <Input
                          value={spineColor}
                          onChange={(e) => setSpineColor(e.target.value)}
                          placeholder="#1a1a2e"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="pt-4">
                      <h4 className="font-medium mb-2">Quick Colors</h4>
                      <div className="flex gap-2 flex-wrap">
                        {['#1a1a2e', '#0d1b2a', '#2d3436', '#6c5ce7', '#00b894', '#d63031', '#fdcb6e', '#e17055'].map(color => (
                          <button
                            key={color}
                            className="w-10 h-10 rounded border-2 border-transparent hover:border-foreground/30 transition-colors"
                            style={{ backgroundColor: color }}
                            onClick={() => setSpineColor(color)}
                          />
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleSaveSpine} className="w-full mt-4" size="lg">
                      Save Spine Settings
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 4: Full Wrap Preview */}
              <TabsContent value="wrap" className="space-y-4 pt-4">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-3 text-center">Full Wrap Preview (Amazon KDP Format)</h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      Layout: Back Cover | Spine | Front Cover
                    </p>
                  </div>
                  
                  <div className="flex items-stretch justify-center gap-0 border rounded-lg overflow-hidden shadow-lg mx-auto" style={{ maxWidth: '600px' }}>
                    {/* Back Cover */}
                    <div className="w-40 sm:w-52 aspect-[3/4] bg-secondary/20 relative">
                      {localBackCoverUrl ? (
                        <img src={localBackCoverUrl} alt="Back" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs bg-muted/50">
                          Back Cover
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 right-2 text-[8px] text-muted-foreground/70">
                        {/* Back cover text placeholder */}
                      </div>
                    </div>
                    {/* Spine */}
                    <div 
                      className="w-5 sm:w-6 flex items-center justify-center"
                      style={{ backgroundColor: spineColor }}
                    >
                      <span 
                        className="text-white text-[7px] sm:text-[8px] font-medium whitespace-nowrap"
                        style={{ 
                          writingMode: 'vertical-rl',
                          textOrientation: 'mixed',
                          transform: 'rotate(180deg)'
                        }}
                      >
                        {(spineText || title).slice(0, 40)}
                      </span>
                    </div>
                    {/* Front Cover */}
                    <div className="w-40 sm:w-52 aspect-[3/4] bg-secondary/20 relative">
                      {displayUrl ? (
                        <img src={displayUrl} alt="Front" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs bg-muted/50">
                          Front Cover
                        </div>
                      )}
                    </div>
                  </div>

                  <Button onClick={handleDownloadKDP} className="w-full max-w-md mx-auto block" size="lg">
                    <Download className="w-4 h-4 mr-2" />
                    Download KDP Cover (Full Wrap PDF)
                  </Button>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    PDF dimensions: 12.485" × 9.25" (optimized for 6×9" trim with ~200 page spine)
                  </p>
                </div>
              </TabsContent>

              {/* TAB 5: Manuscript */}
              <TabsContent value="manuscript" className="space-y-4 pt-4">
                <div className="max-w-lg mx-auto text-center space-y-6">
                  <div className="p-8 border rounded-lg bg-secondary/10">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-medium mb-2">Interior Manuscript</h3>
                    <p className="text-muted-foreground mb-6">
                      Download your book's interior text formatted for Amazon KDP. 
                      This includes the cover page, table of contents, and all chapters.
                    </p>
                    
                    <Button 
                      onClick={handleDownloadManuscript} 
                      disabled={isDownloadingManuscript || !bookData}
                      className="w-full"
                      size="lg"
                    >
                      {isDownloadingManuscript ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating Manuscript...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Download KDP Manuscript (PDF)
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="text-sm text-muted-foreground space-y-2">
                    <p><strong>Tip:</strong> For best results on Amazon KDP:</p>
                    <ul className="text-left list-disc list-inside space-y-1">
                      <li>Upload the Full Wrap PDF as your "Cover"</li>
                      <li>Upload the Manuscript PDF as your "Manuscript"</li>
                      <li>Select 6" × 9" (15.24 × 22.86 cm) as your trim size</li>
                    </ul>
                  </div>
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
