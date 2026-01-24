import { forwardRef, useEffect, useState, useCallback, useRef } from 'react';
import { getTopicIcon } from '@/lib/iconMap';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, RefreshCw, Download, Palette, BookOpen, FileText, Upload, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
// html2canvas removed - using Canvas-First approach for exports
import { BookData } from '@/lib/bookTypes';
import { generateCleanPDF } from '@/lib/generateCleanPDF';
import { generateGuideEPUB } from '@/lib/generateEPUB';
import { registerPlayfairFont, FONT_SIZES, CHAR_SPACING, LINE_HEIGHTS } from '@/lib/pdfFonts';
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
  /** True if all 10 chapters are generated - enables cover editing */
  isGenerationComplete?: boolean;
  /** Actual page count from blocks (overrides word-based estimation) */
  estimatedPageCount?: number;
  /** Is this an official Loom & Page Original? */
  isOfficial?: boolean;
  onCoverUpdate?: (updates: { coverImageUrls?: string[]; backCoverUrl?: string; spineText?: string }) => void;
}

const BookCover = forwardRef<HTMLDivElement, BookCoverProps>(
  ({ 
    title: propTitle, 
    subtitle: propSubtitle, 
    topic = '', 
    coverImageUrls = [], 
    coverImageUrl, 
    isLoadingImage,
    isAdmin = false,
    bookId,
    backCoverUrl,
    spineText: initialSpineText,
    bookData,
    isGenerationComplete = false,
    estimatedPageCount: propEstimatedPageCount,
    isOfficial = false,
    onCoverUpdate
  }, ref) => {
    const TopicIcon = getTopicIcon(topic || propTitle);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
    
    // Editable title/subtitle/edition state (initialized from props)
    const [localTitle, setLocalTitle] = useState(propTitle);
    const [localSubtitle, setLocalSubtitle] = useState(propSubtitle || '');
    const [editionText, setEditionText] = useState('2026 Edition');
    
    // Sync props to local state when they change
    useEffect(() => {
      setLocalTitle(propTitle);
    }, [propTitle]);
    
    useEffect(() => {
      setLocalSubtitle(propSubtitle || '');
    }, [propSubtitle]);
    
    // Use local state for display
    const title = localTitle;
    const subtitle = localSubtitle;
    
    // Cover Studio state
    const [studioOpen, setStudioOpen] = useState(false);
    const [frontPrompt, setFrontPrompt] = useState('');
    const [backPrompt, setBackPrompt] = useState('');
    const [spineText, setSpineText] = useState(initialSpineText || propTitle);
    const [spineColor, setSpineColor] = useState('#ffffff'); // Default to WHITE
    const [spineTextColor, setSpineTextColor] = useState('#000000'); // Default to BLACK
    const [isRegeneratingFront, setIsRegeneratingFront] = useState(false);
    const [isRegeneratingBack, setIsRegeneratingBack] = useState(false);
    const [localBackCoverUrl, setLocalBackCoverUrl] = useState(backCoverUrl || '');
    const [localFrontUrls, setLocalFrontUrls] = useState<string[]>(coverImageUrls);
    const [isDownloadingManuscript, setIsDownloadingManuscript] = useState(false);
    const [isSavingText, setIsSavingText] = useState(false);
    const [isUploadingCover, setIsUploadingCover] = useState(false);
    const [isGeneratingPackage, setIsGeneratingPackage] = useState(false);
    const [showKdpGuides, setShowKdpGuides] = useState(false);
    const coverUploadRef = useRef<HTMLInputElement>(null);
    
    // Back Cover Text State
    const [backCoverTitle, setBackCoverTitle] = useState("Created with Loom & Page");
    const [backCoverBody, setBackCoverBody] = useState("This book was brought to life using Loom & Page, the advanced AI platform that turns ideas into professional-grade books in minutes. Whether you're exploring a new passion, documenting history, or planning your next adventure, we help you weave your curiosity into reality.");
    const [backCoverCTA, setBackCoverCTA] = useState("Create yours at www.LoomandPage.com");
    const [dedicationText, setDedicationText] = useState("");
    
    // Calculate estimated pages for smart spine logic
    // PREFER: propEstimatedPageCount (actual block count from parent)
    // FALLBACK: word-based estimation
    const calculateEstimatedPages = useCallback(() => {
      // If parent passed real page count, use it
      if (propEstimatedPageCount && propEstimatedPageCount > 0) {
        return propEstimatedPageCount;
      }
      // Fallback to word-based estimation
      if (!bookData) return 0;
      let totalWords = 0;
      if (bookData.tableOfContents) {
        bookData.tableOfContents.forEach((chapter: any) => {
          const content = bookData[`chapter${chapter.chapter}Content`] || '';
          totalWords += content.split(/\s+/).length;
        });
      }
      // Est: 300 words/page + 10 pages front/back matter
      return Math.ceil(totalWords / 300) + 10;
    }, [bookData, propEstimatedPageCount]);
    
    const estimatedPages = calculateEstimatedPages();
    const showSpineText = estimatedPages >= 80;
    
    // Dynamic spine width based on KDP White Paper calculation
    const getSpineWidth = useCallback(() => {
      const pages = calculateEstimatedPages();
      // KDP White Paper: pages * 0.002252 inches
      // Minimum spine ~0.15" for safety
      return Math.max(0.15, pages * 0.002252);
    }, [calculateEstimatedPages]);
    
    const spineWidthInches = getSpineWidth();
    
    // Merge legacy coverImageUrl prop with coverImageUrls array
    const allUrls = localFrontUrls.length > 0 
      ? localFrontUrls 
      : (coverImageUrls.length > 0 ? coverImageUrls : (coverImageUrl ? [coverImageUrl] : []));
    
    // Lock in the first valid URL to prevent flicker
    const [lockedUrls, setLockedUrls] = useState<string[]>([]);

    // Track if we've already triggered an auto-fetch to prevent loops
    const hasFetchedFallbackRef = useRef(false);
    
    // Known placeholder/bad image patterns to detect
    const PLACEHOLDER_PATTERNS = [
      'placeholder',
      'default-image',
      'no-image',
    ];
    
    // Known GOOD image sources (should never be overwritten)
    const VALID_IMAGE_SOURCES = [
      'unsplash.com',
      'images.unsplash.com',
      'upload.wikimedia.org',
    ];
    
    // Check if a URL is from a valid source (should be locked)
    const isValidSourceUrl = useCallback((url: string | null | undefined): boolean => {
      if (!url) return false;
      const lowerUrl = url.toLowerCase();
      return VALID_IMAGE_SOURCES.some(source => lowerUrl.includes(source));
    }, []);
    
    // Check if a URL is a known placeholder
    const isPlaceholderUrl = useCallback((url: string | null | undefined): boolean => {
      if (!url) return true;
      // If it's from a valid source, it's NOT a placeholder
      if (isValidSourceUrl(url)) return false;
      const lowerUrl = url.toLowerCase();
      return PLACEHOLDER_PATTERNS.some(pattern => lowerUrl.includes(pattern));
    }, [isValidSourceUrl]);
    
    // Auto-fetch cover image ONLY if empty or placeholder detected
    // CRITICAL: Never overwrite a valid Unsplash/Wikimedia URL
    useEffect(() => {
      // Only run once per mount/book
      if (hasFetchedFallbackRef.current) return;
      
      // If we already have a valid source URL, lock it and don't fetch
      const hasValidSource = allUrls.some(url => isValidSourceUrl(url));
      if (hasValidSource) {
        console.log('[BookCover] Valid cover image detected, locking:', allUrls[0]);
        hasFetchedFallbackRef.current = true;
        return;
      }
      
      // Check if we need to fetch a new cover
      const needsFetch = allUrls.length === 0 || allUrls.every(url => isPlaceholderUrl(url));
      
      if (needsFetch && title) {
        hasFetchedFallbackRef.current = true;
        console.log('[BookCover] No valid cover image detected, fetching from Unsplash...');
        
        const fetchCoverImage = async () => {
          try {
            const query = `${title} minimalist wallpaper`;
            const { data, error } = await supabase.functions.invoke('fetch-book-images', {
              body: { query, orientation: 'portrait' }
            });
            
            if (error) throw error;
            if (data?.imageUrl) {
              console.log('[BookCover] Auto-fetched cover:', data.imageUrl);
              const newUrls = [data.imageUrl];
              setLocalFrontUrls(newUrls);
              setLockedUrls(newUrls);
              setCurrentUrlIndex(0);
              setImageLoaded(false);
              
              // Save to database if bookId exists
              if (bookId) {
                await supabase.from('books').update({ cover_image_url: newUrls }).eq('id', bookId);
              }
              
              onCoverUpdate?.({ coverImageUrls: newUrls });
            }
          } catch (err) {
            console.error('[BookCover] Failed to auto-fetch cover:', err);
          }
        };
        
        fetchCoverImage();
      }
    }, [allUrls, title, bookId, isPlaceholderUrl, onCoverUpdate]);
    
    // Update locked URLs when we get new ones
    // PROTECTION: Never downgrade from a valid image to a placeholder
    useEffect(() => {
      if (allUrls.length === 0) return;
      
      // Check if we currently have a "Good" image (not a placeholder)
      const hasGoodLocal = lockedUrls.length > 0 && !isPlaceholderUrl(lockedUrls[0]);
      
      // Check if the incoming update is a "Bad" image (placeholder)
      const incomingIsBad = allUrls.length > 0 && isPlaceholderUrl(allUrls[0]);
      
      // PROTECT: If we have a good image, and the update is bad, REJECT the update
      if (hasGoodLocal && incomingIsBad) {
        console.log('[BookCover] Ignoring downgrade to placeholder - keeping valid image');
        return; 
      }
      
      if (lockedUrls.length === 0) {
        // First time setting URLs
        setLockedUrls(allUrls);
        setImageLoaded(false);
        setCurrentUrlIndex(0);
      } else if (JSON.stringify(allUrls) !== JSON.stringify(lockedUrls)) {
        // DB update with new URLs - use them (already validated above)
        console.log('[BookCover] Updating cover URLs:', allUrls[0]);
        setLockedUrls(allUrls);
        setCurrentUrlIndex(0);
        setImageLoaded(false);
      }
    }, [allUrls, lockedUrls, isPlaceholderUrl]);

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
    
    // Handle image load error - cycle to next URL or trigger auto-fetch
    const handleImageError = useCallback(() => {
      console.warn(`Cover image failed to load (index ${currentUrlIndex}):`, displayUrl);
      
      if (currentUrlIndex < lockedUrls.length - 1) {
        // Try next URL
        console.log(`Cycling to next cover image (${currentUrlIndex + 1}/${lockedUrls.length})`);
        setCurrentUrlIndex(prev => prev + 1);
        setImageLoaded(false);
      } else {
        // All URLs exhausted - trigger auto-fetch if we haven't already
        console.warn('All cover URLs failed, triggering auto-fetch...');
        hasFetchedFallbackRef.current = false; // Reset to allow fetch
        setLockedUrls([]); // Clear to trigger the auto-fetch effect
        setImageLoaded(true); // Mark as loaded to stop skeleton
      }
    }, [currentUrlIndex, displayUrl, lockedUrls.length]);
    
    // Use full title without category splitting (user requested just title + subtitle)
    const parsedTitle = { category: null as string | null, mainTitle: title };
    
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

    // Save title/subtitle changes to database
    const handleSaveTextChanges = async () => {
      if (!bookId) {
        toast.error('Cannot save: Book ID not available');
        return;
      }
      
      setIsSavingText(true);
      try {
        const { error } = await supabase
          .from('books')
          .update({ 
            title: localTitle,
            // Note: subtitle is derived from topic, so we update topic if needed
          })
          .eq('id', bookId);
        
        if (error) throw error;
        
        // Update spine text to match new title if it was using the default
        if (spineText === propTitle) {
          setSpineText(localTitle);
        }
        
        toast.success('Title and subtitle saved!');
      } catch (err) {
        console.error('Failed to save text changes:', err);
        toast.error('Failed to save changes');
      } finally {
        setIsSavingText(false);
      }
    };

    // --- KDP COVER PDF RENDERING ---
    // NOTE: jsPDF custom `format` array order is easy to get wrong; always read width/height from pageSize.
    const createKdpCoverPdf = () => {
      // KDP full-wrap dimensions (includes bleed) for current preset:
      // 12.485" (W) × 9.25" (H)
      const desiredW = 12.485;
      const desiredH = 9.25;

      // jsPDF custom format + orientation can be inconsistent; always verify actual page size.
      let pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [desiredW, desiredH] });
      let pageWidth = (pdf as any).internal.pageSize.getWidth() as number;
      let pageHeight = (pdf as any).internal.pageSize.getHeight() as number;

      // If jsPDF produced a swapped page (9.25 × 12.485), recreate with swapped format
      // but keep LANDSCAPE orientation so the final result is still 12.485 × 9.25.
      const isCorrect =
        Math.abs(pageWidth - desiredW) < 0.02 && Math.abs(pageHeight - desiredH) < 0.02;
      if (!isCorrect) {
        pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [desiredH, desiredW] });
        pageWidth = (pdf as any).internal.pageSize.getWidth() as number;
        pageHeight = (pdf as any).internal.pageSize.getHeight() as number;
      }

      return { pdf, pageWidth, pageHeight };
    };

    const TRANSPARENT_PIXEL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    // Robust Image Converter (avoids CORS/canvas-taint issues)
    const convertImageToBase64 = async (url: string): Promise<string> => {
      if (!url) return TRANSPARENT_PIXEL;
      if (url.startsWith('data:')) return url;

      // Skip malformed/non-http(s) values (e.g. "placeholder") to avoid 400 "Invalid url"
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return TRANSPARENT_PIXEL;
      } catch {
        return TRANSPARENT_PIXEL;
      }

      try {
        const response = await fetch(url, { mode: 'cors' });
        // If we received a real HTTP response (e.g. 404), don't fall back to the proxy.
        // The proxy will return a 400 for upstream 404s, which creates noisy errors.
        if (!response.ok) return TRANSPARENT_PIXEL;

        const blob = await response.blob();
        if (!blob.type.toLowerCase().startsWith('image/')) return TRANSPARENT_PIXEL;

        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(TRANSPARENT_PIXEL);
          reader.readAsDataURL(blob);
        });
      } catch {
        // ignore, fallback below
      }

      try {
        const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
          body: { url },
        });
        if (!error && data?.dataUrl) return data.dataUrl;
      } catch {
        // ignore
      }

      return TRANSPARENT_PIXEL;
    };

    const imageUrlToSquareCoverJpegDataUrl = async (url: string, sizePx: number) => {
      // Always load a base64 data URL first so the canvas doesn't get tainted.
      const base64 = await convertImageToBase64(url);
      if (!base64 || base64 === TRANSPARENT_PIXEL) return null;

      const img = new Image();
      img.src = base64;
      await new Promise((r) => {
        img.onload = r;
        img.onerror = r;
      });

      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      const ctx = canvas.getContext('2d');
      if (!ctx || !img.width || !img.height) return null;

      // object-cover crop into a square (matches CSS object-cover)
      const srcAspect = img.width / img.height;
      const dstAspect = 1;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (srcAspect > dstAspect) {
        // wider than square: crop left/right
        sh = img.height;
        sw = img.height;
        sx = (img.width - sw) / 2;
      } else {
        // taller than square: crop top/bottom
        sw = img.width;
        sh = img.width;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sizePx, sizePx);
      return canvas.toDataURL('image/jpeg', 0.95);
    };

    const renderKdpCoverToPdf = async (pdf: jsPDF, includeGuides = false) => {
      const pageWidth = (pdf as any).internal.pageSize.getWidth() as number;
      const pageHeight = (pdf as any).internal.pageSize.getHeight() as number;

      // Register Playfair Display font for consistent typography
      const hasPlayfair = await registerPlayfairFont(pdf);
      const fontName = hasPlayfair ? 'PlayfairDisplay' : 'times';

      // KDP spine width currently fixed for ~200 pages
      const spineWidth = 0.485;
      const coverWidth = (pageWidth - spineWidth) / 2;

      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
          : { r: 255, g: 255, b: 255 };
      };

      // === BACK COVER (Onyx white layout; bottom third reserved for barcode) ===
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, coverWidth, pageHeight, 'F');

      const backCenterX = coverWidth / 2;
      const backSafeLeft = 0.375;
      const backSafeTop = 0.375;
      const backInnerW = coverWidth - backSafeLeft * 2;
      
      // DEBUG: Draw numbered grid on back cover when guides enabled
      if (includeGuides) {
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.005);
        pdf.setFontSize(5);
        pdf.setTextColor(150, 150, 150);
        
        // Vertical lines every 0.5" with labels
        for (let x = 0; x <= coverWidth; x += 0.5) {
          pdf.line(x, 0, x, pageHeight);
          pdf.text(x.toFixed(1), x + 0.02, 0.15);
        }
        
        // Horizontal lines every 0.5" with labels
        for (let y = 0; y <= pageHeight; y += 0.5) {
          pdf.line(0, y, coverWidth, y);
          pdf.text(y.toFixed(1), 0.05, y + 0.08);
        }
        
        // Mark safe zone boundaries in blue
        pdf.setDrawColor(0, 100, 255);
        pdf.setLineWidth(0.01);
        pdf.line(backSafeLeft, 0, backSafeLeft, pageHeight); // left safe
        pdf.line(coverWidth - backSafeLeft, 0, coverWidth - backSafeLeft, pageHeight); // right safe
        pdf.line(0, backSafeTop, coverWidth, backSafeTop); // top safe
        
        // Reset colors
        pdf.setTextColor(0, 0, 0);
      }
      
      // === BACK COVER TEXT - Calibrated to match preview EXACTLY ===
      // Preview: 130px wide back cover, 170px tall content area
      // Preview uses: text-[6px] header, text-[4px] body/CTA, max-w-[90%], leading-relaxed
      // 
      // Key insight: Preview is scaled down by ~3.5x from actual PDF
      // Preview text-[6px] at 130px width ≈ 10pt at 6" PDF width
      // Preview text-[4px] at 130px width ≈ 6.5pt at 6" PDF width

      // Preview body is constrained to max-w-[90%] BUT also wraps to ~5 lines with our default copy.
      // Because the PDF uses points/inches instead of CSS pixels, the “same” size mapping can still
      // yield different characters-per-line. We therefore auto-tune width to hit the preview’s 5-line wrap.
      const maxBodyWidth = coverWidth * 0.90;
      const minBodyWidth = coverWidth * 0.35;
      const targetBodyLines = 5;
      
      // === SECTION 1: Header "CREATED WITH LOOM & PAGE" ===
      // Preview: text-[6px] tracking-wide uppercase, centered at top
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(FONT_SIZES.backHeader);
      const splitHeader = pdf.splitTextToSize(backCoverTitle.toUpperCase(), maxBodyWidth);
      // Position at ~7% from top (matching preview's top padding)
      pdf.text(splitHeader, backCenterX, 0.65, { 
        align: 'center',
        charSpace: CHAR_SPACING.trackingWide
      });

      // Dedication (if present) - between header and body (matches preview ordering)
      if (dedicationText) {
        pdf.setFont(fontName, 'italic');
        pdf.setFontSize(FONT_SIZES.backDedication);
        pdf.setTextColor(80, 80, 80);
        pdf.text(dedicationText, backCenterX, 0.82, { align: 'center' });
      }

      // === SECTION 2: Body paragraph ===
      // Preview: text-[4px] leading-relaxed max-w-[90%]
      // Auto-tune width to match preview’s ~5-line wrap.
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(FONT_SIZES.backBody);
      pdf.setTextColor(40, 40, 40);

      let bodyWidth = maxBodyWidth;
      try {
        let low = minBodyWidth;
        let high = maxBodyWidth;

        for (let i = 0; i < 18; i++) {
          const mid = (low + high) / 2;
          const lines = pdf.splitTextToSize(backCoverBody, mid).length;

          if (lines === targetBodyLines) {
            bodyWidth = mid;
            break;
          }

          // Too few lines -> too wide -> shrink
          if (lines < targetBodyLines) high = mid;
          // Too many lines -> too narrow -> widen
          else low = mid;
        }

        const candidates = [low, high, maxBodyWidth, minBodyWidth];
        bodyWidth = candidates
          .map((w) => ({ w, diff: Math.abs(pdf.splitTextToSize(backCoverBody, w).length - targetBodyLines) }))
          .sort((a, b) => a.diff - b.diff)[0].w;
      } catch {
        bodyWidth = maxBodyWidth;
      }

      const splitBody = pdf.splitTextToSize(backCoverBody, bodyWidth);
      const bodyStartY = dedicationText ? 0.98 : 0.90;
      pdf.text(splitBody, backCenterX, bodyStartY, {
        align: 'center',
        lineHeightFactor: LINE_HEIGHTS.relaxed,
      });

      // === SECTION 3: CTA ===
      // Preview: text-[4px] font-bold, positioned right after body
      const lineHeight = (FONT_SIZES.backBody / 72) * LINE_HEIGHTS.relaxed;
      const ctaY = bodyStartY + splitBody.length * lineHeight + 0.15;
      pdf.setFont(fontName, 'bold');
      pdf.setFontSize(FONT_SIZES.backCTA);
      pdf.setTextColor(0, 0, 0);
      pdf.text(backCoverCTA, backCenterX, ctaY, { align: 'center' });

      // === SPINE ===
      const spineRgb = hexToRgb(spineColor);
      pdf.setFillColor(spineRgb.r, spineRgb.g, spineRgb.b);
      pdf.rect(coverWidth, 0, spineWidth, pageHeight, 'F');

      if (showSpineText) {
        const textRgb = hexToRgb(spineTextColor);
        pdf.setTextColor(textRgb.r, textRgb.g, textRgb.b);
        
        // Calculate spine center for vertical text positioning
        const spineCenterX = coverWidth + spineWidth / 2;
        const spineTextMaxWidth = pageHeight - 1.0; // Leave 0.5" margin on each end
        
        // Edition text at top of spine (rotated 90° so reads bottom-to-top)
        pdf.setFont(fontName, 'normal');
        const editionFontSize = Math.min(FONT_SIZES.spineEdition, spineWidth * 18); // Scale to spine width
        pdf.setFontSize(editionFontSize);
        pdf.text(editionText, spineCenterX, 0.5, { angle: 90, align: 'left' });
        
        // Title at bottom of spine (rotated 90° so reads bottom-to-top)
        pdf.setFont(fontName, 'bold');
        const titleFontSize = Math.min(FONT_SIZES.spineTitle, spineWidth * 22); // Slightly larger for title
        pdf.setFontSize(titleFontSize);
        const displaySpineTitle = (spineText || title).slice(0, 30).toUpperCase();
        pdf.text(displaySpineTitle, spineCenterX, pageHeight - 0.5, { angle: 90, align: 'right' });
      }

      // === FRONT COVER ===
      // Match the preview exactly: 280px container maps to 6" cover
      // Preview uses p-5 (~18px padding) = 18/280 = 6.4% → 0.38" on 6" cover
      const frontX = coverWidth + spineWidth;
      const centerX = frontX + coverWidth / 2;
      pdf.setFillColor(255, 255, 255);
      pdf.rect(frontX, 0, coverWidth, pageHeight, 'F');

      // Safe zone: 0.375" from page edges
      const safeEdge = 0.375;
      const padding = 0.40; // Slightly more than safe edge for visual padding
      const innerWidth = coverWidth - padding * 2;

      // Start content inside safe zone
      let y = safeEdge + 0.08;

      // IMAGE: preview `w-[52%] aspect-square` with rounded-lg and mb-4
      const imgSize = innerWidth * 0.52;
      const imgX = centerX - imgSize / 2;
      const imgY = y;

      if (displayUrl) {
        try {
          const dataUrl = await imageUrlToSquareCoverJpegDataUrl(displayUrl, 1400);
          if (dataUrl) {
            const cornerRadius = 0.10; // rounded-lg equivalent
            // Add image
            pdf.addImage(dataUrl, 'JPEG', imgX, imgY, imgSize, imgSize);
            // Draw rounded border on top
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.012);
            pdf.roundedRect(imgX, imgY, imgSize, imgSize, cornerRadius, cornerRadius, 'S');
          }
        } catch {
          console.warn('Could not load front cover image');
        }
      }

      // Gap after image (mb-4 = 16px/280px = 0.34" scaled)
      y = imgY + imgSize + 0.25;

      // TITLE: preview `text-lg` = 18px → scaled to ~22pt for print
      // max-w-[220px]/280px = 78.5%
      const titleMaxW = innerWidth * 0.82;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(FONT_SIZES.title);
      const splitTitle = pdf.splitTextToSize(parsedTitle.mainTitle, titleMaxW);
      pdf.text(splitTitle, centerX, y, { align: 'center' });
      y += splitTitle.length * LINE_HEIGHTS.title + 0.08;

      // Separator: preview w-8 = 32px/280px = 11.4% of width → 0.68"
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.008);
      const sepLen = 0.70;
      pdf.line(centerX - sepLen / 2, y, centerX + sepLen / 2, y);
      y += 0.12;

      // SUBTITLE: preview `text-[7px]` with tracking-[0.3em]
      // Subtitle should span nearly full width like preview
      if (subtitle) {
        const subtitleMaxW = innerWidth * 0.95;
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(FONT_SIZES.subtitle);
        pdf.setTextColor(140, 140, 140);
        const subtitleText = subtitle.toUpperCase();
        const subtitleLines = pdf.splitTextToSize(subtitleText, subtitleMaxW).slice(0, 2);
        // Apply letter spacing via charSpace (0.3em ≈ 0.03" at 9pt)
        pdf.text(subtitleLines, centerX, y, { align: 'center', charSpace: 0.025 });
        y += subtitleLines.length * LINE_HEIGHTS.subtitle;
      }

      // === BOTTOM BRANDING (mt-auto in preview = anchored to bottom) ===
      const bottomSafe = pageHeight - safeEdge - 0.08;
      
      // Calculate positions from bottom up:
      // Disclaimer: 2 lines at 7pt ≈ 0.20" total
      // Gap: 0.06"
      // Brand name: 11pt ≈ 0.15"
      // Gap: 0.12"
      // Logo: 0.22" (matching preview's 24px in 280px = 8.5%)
      
      const disclaimerH = 0.20;
      const brandH = 0.15;
      const logoH = 0.22;
      const gap1 = 0.12; // logo to brand
      const gap2 = 0.06; // brand to disclaimer
      
      const disclaimerY = bottomSafe - disclaimerH;
      const brandY = disclaimerY - gap2 - brandH;
      const logoEndY = brandY - gap1;
      const logoStartY = logoEndY - logoH;

      // Logo: 3 vertical lines + crossbar + corner fold
      const lineGap = 0.055;
      const logoCenterY = logoStartY + logoH / 2;
      pdf.setDrawColor(60, 60, 60); // Slightly muted like preview opacity
      pdf.setLineWidth(0.010);
      // Three vertical lines
      pdf.line(centerX - lineGap, logoStartY, centerX - lineGap, logoStartY + logoH);
      pdf.line(centerX, logoStartY, centerX, logoStartY + logoH);
      pdf.line(centerX + lineGap, logoStartY, centerX + lineGap, logoStartY + logoH);
      // Horizontal crossbar
      pdf.line(centerX - lineGap - 0.05, logoCenterY, centerX + lineGap + 0.05, logoCenterY);
      // Corner fold (top-right)
      pdf.setLineWidth(0.008);
      pdf.line(centerX + lineGap + 0.03, logoStartY, centerX + lineGap + 0.08, logoStartY);
      pdf.line(centerX + lineGap + 0.08, logoStartY, centerX + lineGap + 0.08, logoStartY + 0.055);

      // Brand name: "Loom & Page"
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(FONT_SIZES.brand);
      pdf.setTextColor(140, 140, 140);
      pdf.text('Loom & Page', centerX, brandY + brandH, { align: 'center' });

      // Disclaimer (2 lines)
      pdf.setFont(fontName, 'italic');
      pdf.setFontSize(FONT_SIZES.disclaimer);
      pdf.setTextColor(160, 160, 160);
      pdf.text('AI-generated content for creative inspiration only.', centerX, disclaimerY + 0.08, { align: 'center' });
      pdf.text('Not professional advice.', centerX, disclaimerY + 0.17, { align: 'center' });

      // === DEBUG GUIDES (optional) ===
      if (includeGuides) {
        const bleed = 0.125; // inches
        const safeFromTrim = 0.25;
        const safe = bleed + safeFromTrim; // 0.375" from page edge

        // Bleed edge (page edge) - red dashed
        pdf.setDrawColor(220, 38, 38);
        pdf.setLineWidth(0.01);
        pdf.setLineDashPattern([0.08, 0.05], 0);
        pdf.rect(0, 0, pageWidth, pageHeight);

        // Trim - blue solid
        pdf.setDrawColor(37, 99, 235);
        pdf.setLineDashPattern([], 0);
        pdf.setLineWidth(0.01);
        pdf.rect(bleed, bleed, pageWidth - bleed * 2, pageHeight - bleed * 2);

        // Safe - green dashed
        pdf.setDrawColor(34, 197, 94);
        pdf.setLineDashPattern([0.08, 0.05], 0);
        pdf.setLineWidth(0.01);
        pdf.rect(safe, safe, pageWidth - safe * 2, pageHeight - safe * 2);

        // Spine boundaries - teal dotted
        pdf.setDrawColor(13, 148, 136);
        pdf.setLineDashPattern([0.03, 0.05], 0);
        pdf.setLineWidth(0.01);
        pdf.line(coverWidth, bleed, coverWidth, pageHeight - bleed);
        pdf.line(coverWidth + spineWidth, bleed, coverWidth + spineWidth, pageHeight - bleed);

        // Barcode zone (bottom third of back cover within trim) - orange dashed
        const backTrimX = bleed;
        const backTrimW = coverWidth - bleed * 2;
        const backTrimY = bleed;
        const backTrimH = pageHeight - bleed * 2;
        const barcodeH = backTrimH / 3;
        const barcodeY = backTrimY + backTrimH - barcodeH;
        pdf.setDrawColor(249, 115, 22);
        pdf.setLineDashPattern([0.08, 0.05], 0);
        pdf.setLineWidth(0.01);
        pdf.rect(backTrimX, barcodeY, backTrimW, barcodeH);
      }
    };

    // Download KDP Full Wrap PDF - Using html2canvas snapshot for 100% visual parity
    const handleDownloadKDP = async () => {
      toast.info('Generating KDP cover PDF (snapshot)...');

      try {
        const blob = await generateCoverPDFBlob();
        if (!blob) throw new Error('Failed to generate PDF blob');
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_KDP_Cover.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
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
        // Check if displayUrl is valid before passing
        const validCoverUrl = displayUrl && displayUrl.trim().length > 0 ? displayUrl : undefined;
        
        await generateCleanPDF({
          topic: topic || title,
          bookData,
          coverImageUrl: validCoverUrl
        });
        toast.success('Manuscript PDF downloaded!');
      } catch (err) {
        console.error('Failed to generate manuscript:', err);
        toast.error('Failed to generate manuscript PDF');
      } finally {
        setIsDownloadingManuscript(false);
      }
    };

    // Handle cover image upload
    const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be smaller than 5MB');
        return;
      }

      setIsUploadingCover(true);
      try {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `cover_${bookId || Date.now()}_${Date.now()}.${fileExt}`;
        const filePath = `covers/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('book-images')
          .upload(filePath, file, { 
            cacheControl: '3600',
            upsert: true 
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('book-images')
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;
        
        // Update local state
        const newUrls = [publicUrl];
        setLocalFrontUrls(newUrls);
        setLockedUrls(newUrls);
        setCurrentUrlIndex(0);
        setImageLoaded(false);

        // Save to database if bookId exists
        if (bookId) {
          await supabase.from('books').update({ cover_image_url: newUrls }).eq('id', bookId);
        }

        onCoverUpdate?.({ coverImageUrls: newUrls });
        toast.success('Cover image uploaded!');
      } catch (err) {
        console.error('Failed to upload cover:', err);
        toast.error('Failed to upload cover image');
      } finally {
        setIsUploadingCover(false);
        // Clear file input
        if (coverUploadRef.current) {
          coverUploadRef.current.value = '';
        }
      }
    };

    // ========== CANVAS-FIRST DRAWING HELPERS ==========
    
    // Helper: Load image for canvas (handles CORS)
    const loadCanvasImage = async (url: string): Promise<HTMLImageElement | null> => {
      if (!url) return null;
      
      try {
        // First try to get base64 version to avoid CORS
        const base64 = await convertImageToBase64(url);
        if (!base64 || base64 === TRANSPARENT_PIXEL) return null;
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        return new Promise((resolve) => {
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = base64;
        });
      } catch {
        return null;
      }
    };
    
    // Helper: Draw text with word wrapping on canvas
    const drawWrappedText = (
      ctx: CanvasRenderingContext2D, 
      text: string, 
      x: number, 
      y: number, 
      maxWidth: number, 
      lineHeight: number,
      align: 'center' | 'left' | 'right' = 'center'
    ): number => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      
      ctx.textAlign = align;
      
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), x, currentY);
          line = words[i] + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), x, currentY);
      return currentY + lineHeight;
    };
    
    // Helper: Draw rounded rect clipping path
    const roundedRectPath = (
      ctx: CanvasRenderingContext2D, 
      x: number, 
      y: number, 
      width: number, 
      height: number, 
      radius: number
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };
    
    // Helper: Draw the Loom & Page logo using vector paths
    const drawLoomLogo = (
      ctx: CanvasRenderingContext2D, 
      centerX: number, 
      centerY: number, 
      size: number
    ) => {
      const halfSize = size / 2;
      const lineGap = size * 0.22;
      const lineWidth = size * 0.06;
      const inset = size * 0.1;
      
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      
      // Three vertical lines
      ctx.beginPath();
      ctx.moveTo(centerX - lineGap, centerY - halfSize + inset);
      ctx.lineTo(centerX - lineGap, centerY + halfSize - inset);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - halfSize + inset);
      ctx.lineTo(centerX, centerY + halfSize - inset);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(centerX + lineGap, centerY - halfSize + inset);
      ctx.lineTo(centerX + lineGap, centerY + halfSize - inset);
      ctx.stroke();
      
      // Horizontal crossbar
      ctx.beginPath();
      ctx.moveTo(centerX - lineGap - size * 0.08, centerY);
      ctx.lineTo(centerX + lineGap + size * 0.08, centerY);
      ctx.stroke();
      
      // Corner fold (top-right)
      ctx.lineWidth = lineWidth * 0.8;
      ctx.beginPath();
      ctx.moveTo(centerX + lineGap + size * 0.05, centerY - halfSize + inset);
      ctx.lineTo(centerX + lineGap + size * 0.15, centerY - halfSize + inset);
      ctx.lineTo(centerX + lineGap + size * 0.15, centerY - halfSize + inset + size * 0.12);
      ctx.stroke();
    };
    
    // Core Canvas Drawing Function for Front Cover
    const drawFrontCoverToCanvas = async (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      xOffset: number = 0,
      yOffset: number = 0
    ) => {
      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xOffset, yOffset, width, height);
      
      // Design constants (relative to canvas size)
      const padding = width * 0.075;
      const contentWidth = width - padding * 2;
      const centerX = xOffset + width / 2;
      
      // ========== IMAGE ==========
      const imgWidth = width * 0.52;
      const imgHeight = imgWidth; // Square
      const imgX = centerX - imgWidth / 2;
      const imgY = yOffset + height * 0.07;
      const imgRadius = width * 0.015;
      
      // Draw image with rounded corners
      if (displayUrl) {
        const img = await loadCanvasImage(displayUrl);
        if (img) {
          ctx.save();
          roundedRectPath(ctx, imgX, imgY, imgWidth, imgHeight, imgRadius);
          ctx.clip();
          
          // object-fit: cover logic
          const srcAspect = img.width / img.height;
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          if (srcAspect > 1) {
            sw = img.height;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgWidth, imgHeight);
          ctx.restore();
          
          // Border
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = width * 0.003;
          roundedRectPath(ctx, imgX, imgY, imgWidth, imgHeight, imgRadius);
          ctx.stroke();
        }
      }
      
      // ========== TITLE ==========
      const titleY = imgY + imgHeight + height * 0.05;
      const titleFontSize = width * 0.052;
      ctx.font = `500 ${titleFontSize}px 'Playfair Display', Georgia, serif`;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      const titleMaxWidth = contentWidth * 0.85;
      const titleLines = parsedTitle.mainTitle.split(' ');
      let titleText = parsedTitle.mainTitle;
      
      // Measure and potentially wrap title
      let titleEndY = drawWrappedText(ctx, titleText, centerX, titleY, titleMaxWidth, titleFontSize * 1.2, 'center');
      
      // ========== SEPARATOR LINE ==========
      // Calculate exact center between title bottom and subtitle top
      const separatorY = titleEndY + height * 0.025;
      const separatorWidth = width * 0.15;
      const separatorHeight = width * 0.0025;
      
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(centerX - separatorWidth / 2, separatorY, separatorWidth, separatorHeight);
      
      // ========== SUBTITLE ==========
      const subtitleY = separatorY + separatorHeight + height * 0.025;
      if (subtitle) {
        const subtitleFontSize = width * 0.019;
        ctx.font = `400 ${subtitleFontSize}px 'Playfair Display', Georgia, serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.letterSpacing = `${subtitleFontSize * 0.3}px`;
        
        const subtitleText = subtitle.toUpperCase();
        const subtitleMaxWidth = contentWidth * 0.85;
        drawWrappedText(ctx, subtitleText, centerX, subtitleY, subtitleMaxWidth, subtitleFontSize * 1.6, 'center');
      }
      
      // ---------------------------------------------------------
      // 6. BOTTOM BRANDING (Final: Shades, Rounding, Center)
      // ---------------------------------------------------------
      
      // ANCHOR: Work upwards from the bottom
      const bottomMargin = height * 0.05; // 5% padding from bottom
      const anchorY = yOffset + height - bottomMargin;

      // 1. DISCLAIMER
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; // Text Opacity 0.3
      const discFontSize = width * 0.015;
      ctx.font = `italic 400 ${discFontSize}px "Playfair Display", serif`;
      ctx.textAlign = 'center';
      
      const disclaimerLine2 = "Not professional advice.";
      const disclaimerLine1 = "AI-generated content for creative inspiration only.";
      
      ctx.fillText(disclaimerLine2, centerX, anchorY);
      ctx.fillText(disclaimerLine1, centerX, anchorY - (discFontSize * 1.4));
      
      // Calculate Top of Disclaimer Block
      const disclaimerTopY = anchorY - (discFontSize * 1.4) - discFontSize;

      // 2. LOGO (Positioned high enough to leave room)
      // We calculate positions first, then draw.
      const logoSize = width * 0.085; 
      // Total available vertical space for branding area
      const brandingHeight = height * 0.15; 
      
      // Top of the Logo (calculated relative to disclaimer top)
      const logoH = logoSize;
      const logoW = logoSize;
      const logoX = centerX - (logoW / 2);
      
      // We place the logo at a fixed distance above the disclaimer to establish the "bracket"
      const totalGap = height * 0.06; 
      const logoBottomY = disclaimerTopY - totalGap;
      const logoTopY = logoBottomY - logoH;

      // 3. DRAW LOGO (Main Body - Darker)
      // CSS Preview has parent opacity 0.6, so main lines are 0.6
      ctx.strokeStyle = '#000000'; 
      ctx.globalAlpha = 0.6;       
      ctx.lineWidth = logoSize * 0.06; 
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const insetX = logoSize * 0.125; 
      const insetY = logoSize * 0.125; 

      // A. Vertical Lines
      ctx.beginPath();
      // Left
      ctx.moveTo(logoX + insetX, logoTopY + insetY);
      ctx.lineTo(logoX + insetX, logoBottomY - insetY);
      // Center
      ctx.moveTo(centerX, logoTopY + insetY);
      ctx.lineTo(centerX, logoBottomY - insetY);
      // Right
      ctx.moveTo(logoX + logoW - insetX, logoTopY + insetY);
      ctx.lineTo(logoX + logoW - insetX, logoBottomY - insetY);
      ctx.stroke();

      // B. Horizontal Crossbar
      ctx.beginPath();
      ctx.moveTo(logoX, logoTopY + (logoH / 2));
      ctx.lineTo(logoX + logoW, logoTopY + (logoH / 2));
      ctx.stroke();

      // 4. DRAW CORNER FOLD (Lighter Shade & Rounded)
      // CSS Preview has corner opacity 0.6 INSIDE a parent of 0.6 = 0.36 total
      ctx.globalAlpha = 0.36; 
      
      const cornerSize = logoSize * 0.25;
      const cornerRadius = logoSize * 0.06; // Rounding
      const cornerX = logoX + logoW;       
      const cornerY = logoTopY;               
      
      ctx.beginPath();
      // Start left of corner
      ctx.moveTo(cornerX - cornerSize, cornerY); 
      // Arc the corner (Top Right)
      ctx.arcTo(cornerX, cornerY, cornerX, cornerY + cornerSize, cornerRadius);
      // Line down
      ctx.lineTo(cornerX, cornerY + cornerSize);
      ctx.stroke();
      
      // Reset Alpha
      ctx.globalAlpha = 1.0;

      // 5. BRAND NAME "Loom & Page" (Perfectly Centered)
      // Calculate the middle point between Logo Bottom and Disclaimer Top
      const centerPointY = (logoBottomY + disclaimerTopY) / 2;
      
      const brandFontSize = width * 0.022; 
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.font = `400 ${brandFontSize}px "Playfair Display", serif`;
      
      // Draw text centered at that midpoint (adjusting for baseline)
      ctx.textBaseline = 'middle';
      ctx.fillText("Loom & Page", centerX, centerPointY);
      ctx.textBaseline = 'alphabetic'; // Reset defaults
    };
    
    // ========== CANVAS-BASED Kindle JPG Generator ==========
    const generateCoverJPGBlob = async (): Promise<Blob | null> => {
      try {
        // Wait for fonts to load
        try {
          await (document as any).fonts?.ready;
        } catch { /* ignore */ }
        
        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = 2560;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        
        // Draw the front cover
        await drawFrontCoverToCanvas(ctx, 1600, 2560, 0, 0);
        
        // Export as JPG
        return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
        });
      } catch (err) {
        console.error('Kindle JPG generation failed:', err);
        toast.error('Failed to generate Kindle cover');
        return null;
      }
    };
    
    // ========== CANVAS-BASED Full Wrap PDF Generator ==========
    const generateCoverPDFBlob = async (): Promise<Blob | null> => {
      try {
        // Wait for fonts to load
        try {
          await (document as any).fonts?.ready;
        } catch { /* ignore */ }
        
        // Calculate dimensions at 300 DPI
        const dpi = 300;
        const frontCoverWidth = 6.125 * dpi; // inches to pixels
        const spineWidth = spineWidthInches * dpi;
        const totalWidth = (frontCoverWidth * 2) + spineWidth;
        const totalHeight = 9.25 * dpi;
        
        const canvas = document.createElement('canvas');
        canvas.width = totalWidth;
        canvas.height = totalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        
        // -------------------------------------------------------
        // A. BACK COVER (Hardcoded Layout for Default Text)
        // -------------------------------------------------------
        const coverW_In = 6.125;
        const DPI = dpi;
        const pageHeightPx = totalHeight;

        const backW_Px = coverW_In * DPI;
        const backCX = backW_Px / 2;
        
        // 1. Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, backW_Px, pageHeightPx);

        // 2. LAYOUT CONSTANTS
        // Start Header at 7.5% down (Aligned with Front Image Top)
        let currentY = pageHeightPx * 0.075; 

        // Margins
        const paddingX = backW_Px * 0.106; 
        const contentWidth = backW_Px - (paddingX * 2);

        // UNIFORM GAP: Symmetric spacing above and below body
        const uniformGap = backW_Px * 0.06;  

        // 3. FONT SCALING
        const fontHeader = backW_Px * 0.05;
        const fontBody = backW_Px * 0.038;        
        const fontDedication = backW_Px * 0.034;

        // 4. DRAWING LOOP
        // -- Header --
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `500 ${fontHeader}px "Playfair Display", serif`;
        ctx.fillText(backCoverTitle.toUpperCase(), backCX, currentY);
        
        // Advance
        currentY += fontHeader + uniformGap; 

        // -- Dedication --
        if (dedicationText) {
          ctx.fillStyle = '#666666';
          ctx.font = `italic 400 ${fontDedication}px "Playfair Display", serif`;
          ctx.fillText(dedicationText, backCX, currentY);
          currentY += fontDedication + uniformGap; 
        }

        // -- Body Text --
        ctx.fillStyle = '#333333';
        ctx.font = `400 ${fontBody}px "Playfair Display", serif`;
        const lineHeight = fontBody * 1.8; 

        // CHECK: Is this the default text?
        // We clean the strings to avoid whitespace mismatch issues.
        const cleanCurrent = backCoverBody.replace(/\s+/g, ' ').trim();
        const cleanDefault = "This book was brought to life using Loom & Page, the advanced AI platform that turns ideas into professional-grade books in minutes. Whether you're exploring a new passion, documenting history, or planning your next adventure, we help you weave your curiosity into reality.".replace(/\s+/g, ' ').trim();

        if (cleanCurrent === cleanDefault) {
          // *** FORCE EXACT LINES FOR DEFAULT TEXT ***
          const explicitLines = [
            "This book was brought to life using Loom &",
            "Page, the advanced AI platform that turns",
            "ideas into professional-grade books in",
            "minutes. Whether you're exploring a new",
            "passion, documenting history, or planning",
            "your next adventure, we help you weave",
            "your curiosity into reality."
          ];
          explicitLines.forEach((line) => {
            ctx.fillText(line, backCX, currentY);
            currentY += lineHeight;
          });
        } else {
          // *** AUTO-WRAP FOR CUSTOM TEXT ***
          // Use 88% width to encourage cleaner breaks on custom text
          const bodyMaxWidth = contentWidth * 0.88; 
          currentY = drawWrappedText(ctx, backCoverBody, backCX, currentY, bodyMaxWidth, lineHeight);
        }
        
        // -- CTA (Symmetric Positioning) --
        currentY += uniformGap;

        ctx.fillStyle = '#000000';
        ctx.font = `700 ${fontBody}px "Playfair Display", serif`; // Bold
        ctx.fillText(backCoverCTA, backCX, currentY);

        // Reset text baseline for subsequent drawing
        ctx.textBaseline = 'alphabetic';


        // ========== SPINE ==========
        const spineX = frontCoverWidth;
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result
            ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
            : { r: 255, g: 255, b: 255 };
        };
        
        const spineRgb = hexToRgb(spineColor);
        ctx.fillStyle = `rgb(${spineRgb.r}, ${spineRgb.g}, ${spineRgb.b})`;
        ctx.fillRect(spineX, 0, spineWidth, totalHeight);
        
        if (showSpineText) {
          const textRgb = hexToRgb(spineTextColor);
          ctx.fillStyle = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
          
          // Safe margins from top/bottom edges (6% of total height)
          const safeMargin = totalHeight * 0.06;
          // Available width for text (when rotated, this becomes the vertical space)
          const availableTextWidth = totalHeight - (safeMargin * 2) - 50; // Leave gap between edition and title
          
          // Calculate proportional font size based on spine width (at 300 DPI)
          const baseFontSize = Math.max(spineWidth * 0.40, 18);
          
          // Edition text at TOP of spine (rotated -90° so text reads bottom-to-top when book is on shelf)
          ctx.save();
          ctx.translate(spineX + spineWidth / 2, safeMargin);
          ctx.rotate(-Math.PI / 2);
          ctx.font = `400 ${baseFontSize}px 'Playfair Display', Georgia, serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.75;
          ctx.fillText(editionText, 0, 0);
          const editionWidth = ctx.measureText(editionText).width;
          ctx.restore();
          
          // Title at BOTTOM of spine - AUTO-SCALE to fit available space
          const displaySpineTitle = (spineText || title).toUpperCase();
          
          // Calculate max available width for title (total height minus margins and edition text space)
          const maxTitleWidth = availableTextWidth - editionWidth - 30;
          
          // Start with desired font size and scale down if needed
          let titleFontSize = Math.max(spineWidth * 0.45, 20);
          ctx.font = `600 ${titleFontSize}px 'Playfair Display', Georgia, serif`;
          let titleWidth = ctx.measureText(displaySpineTitle).width;
          
          // Scale down font until text fits
          while (titleWidth > maxTitleWidth && titleFontSize > 10) {
            titleFontSize -= 1;
            ctx.font = `600 ${titleFontSize}px 'Playfair Display', Georgia, serif`;
            titleWidth = ctx.measureText(displaySpineTitle).width;
          }
          
          ctx.save();
          ctx.translate(spineX + spineWidth / 2, totalHeight - safeMargin);
          ctx.rotate(-Math.PI / 2);
          ctx.font = `600 ${titleFontSize}px 'Playfair Display', Georgia, serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 1;
          ctx.fillText(displaySpineTitle, 0, 0);
          ctx.restore();
        }
        
        // ========== FRONT COVER ==========
        await drawFrontCoverToCanvas(ctx, frontCoverWidth, totalHeight, spineX + spineWidth, 0);
        
        // Convert canvas to PDF
        const { pdf, pageWidth, pageHeight } = createKdpCoverPdf();
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
        
        return pdf.output('blob');
      } catch (err) {
        console.error('Full Wrap PDF generation failed:', err);
        toast.error('Failed to generate KDP cover PDF');
        return null;
      }
    };

    // Generate unified KDP Package ZIP
    const handleDownloadKDPPackage = async () => {
      if (!bookData) {
        toast.error('Book data not available');
        return;
      }

      setIsGeneratingPackage(true);
      toast.info('Generating KDP Package...');

      try {
        const zip = new JSZip();
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');

        const coverPdf = await generateCoverPDFBlob();
        if (coverPdf) zip.file('Cover-File.pdf', coverPdf);

        const manuscriptBlob = await generateManuscriptPDFBlob();
        if (manuscriptBlob) zip.file('Manuscript.pdf', manuscriptBlob);

        const epubBlob = await generateEPUBBlob();
        if (epubBlob) zip.file('Kindle-eBook.epub', epubBlob);

        const kindleJpgBlob = await generateCoverJPGBlob();
        if (kindleJpgBlob) zip.file('Kindle_Cover.jpg', kindleJpgBlob);

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}_KDP_Package.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('KDP Package downloaded!');
      } catch (err) {
        console.error('Failed to generate KDP package:', err);
        toast.error('Failed to generate KDP package');
      } finally {
        setIsGeneratingPackage(false);
      }
    };

    // Helper: Generate Manuscript PDF as Blob
    const generateManuscriptPDFBlob = async (): Promise<Blob | null> => {
      // NOTE: Browser print method opens a dialog - cannot return blob
      // User must print to PDF manually for KDP package
      toast.info('Please use "Save as PDF" in the print dialog to create your manuscript file.');
      try {
        const validCoverUrl = displayUrl && displayUrl.trim().length > 0 ? displayUrl : undefined;
        
        await generateCleanPDF({
          topic: topic || title,
          bookData: bookData!,
          coverImageUrl: validCoverUrl
        });
        
        return null; // Print dialog handles the file
      } catch (err) {
        console.error('Error generating manuscript:', err);
        return null;
      }
    };

    // Helper: Fetch Kindle Cover JPG as Blob
    const fetchKindleCoverBlob = async (): Promise<Blob | null> => {
      if (!displayUrl || displayUrl.trim().length === 0) return null;
      
      try {
        const response = await fetch(displayUrl);
        if (!response.ok) throw new Error('Failed to fetch cover image');
        return await response.blob();
      } catch (err) {
        console.error('Error fetching Kindle cover:', err);
        return null;
      }
    };

    // Helper: Generate EPUB as Blob using generateGuideEPUB
    const generateEPUBBlob = async (): Promise<Blob | null> => {
      try {
        const blob = await generateGuideEPUB({
          title,
          topic: topic || title,
          bookData: bookData!,
          coverImageUrl: displayUrl,
          returnBlob: true
        });
        return blob || null;
      } catch (err) {
        console.error('Error generating EPUB:', err);
        return null;
      }
    };

    // Legacy inline EPUB generator (kept as fallback reference)
    const generateEPUBBlobLegacy = async (): Promise<Blob | null> => {
      try {
        const epubZip = new JSZip();
        
        // EPUB mimetype
        epubZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        
        // Container XML
        epubZip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

        // Generate chapter files
        const chapters = bookData.tableOfContents || [];
        const manifestItems: string[] = [];
        const spineItems: string[] = [];

        // Cover page
        epubZip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <div class="cover">
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ''}
    <p>Loom & Page</p>
  </div>
</body>
</html>`);
        manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
        spineItems.push('<itemref idref="cover"/>');

        // TOC page
        epubZip.file('OEBPS/toc.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <h1>Table of Contents</h1>
  <ol>
    ${chapters.map((ch: any, i: number) => `<li><a href="chapter${i + 1}.xhtml">Chapter ${ch.chapter}: ${ch.title}</a></li>`).join('\n')}
  </ol>
</body>
</html>`);
        manifestItems.push('<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>');
        spineItems.push('<itemref idref="toc"/>');

        // Chapters
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const content = bookData[`chapter${ch.chapter}Content`] || '';
          const cleanContent = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, '').replace(/[#*>`]/g, '');
          
          epubZip.file(`OEBPS/chapter${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter ${ch.chapter}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <h1>Chapter ${ch.chapter}: ${ch.title}</h1>
  <p>${cleanContent.replace(/\n\n/g, '</p><p>')}</p>
</body>
</html>`);
          manifestItems.push(`<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
          spineItems.push(`<itemref idref="chapter${i + 1}"/>`);
        }

        // Styles
        epubZip.file('OEBPS/styles.css', `body { font-family: serif; margin: 1em; line-height: 1.6; }
h1 { font-size: 1.5em; margin-bottom: 0.5em; }
.cover { text-align: center; padding: 2em; }
p { margin-bottom: 1em; }`);
        manifestItems.push('<item id="styles" href="styles.css" media-type="text/css"/>');

        // content.opf
        epubZip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`);

        return await epubZip.generateAsync({ type: 'blob' });
      } catch (err) {
        console.error('Error generating EPUB:', err);
        return null;
      }
    };

    return (
      <>
        <div
          ref={ref}
          className="w-full max-w-md mx-auto aspect-[3/4] gradient-paper rounded-sm shadow-book p-10 md:p-12 flex flex-col justify-between animate-page-turn relative overflow-hidden border border-border/30"
        >
          {/* Admin Edit Button - Locked while generating */}
          {isAdmin && (
            <Button
              id="kdp-studio-trigger"
              onClick={() => setStudioOpen(true)}
              variant="secondary"
              size="sm"
              disabled={!isGenerationComplete}
              className="absolute top-3 right-3 z-10 opacity-80 hover:opacity-100 shadow-md disabled:opacity-50"
            >
              <Pencil className="w-4 h-4 mr-1" />
              {isGenerationComplete ? 'Edit Cover / Export KDP' : 'Generating Book...'}
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
            
            {/* Official Badge or Self-Published Label */}
            {/* Only show badge for official books - no self-published text */}
            {isOfficial && (
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 rounded-full">
                <svg className="w-3 h-3 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                </svg>
                <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300 tracking-wide uppercase">
                  Loom & Page Original
                </span>
              </div>
            )}
            
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
                <TabsTrigger value="manuscript" className="text-xs sm:text-sm">Export</TabsTrigger>
              </TabsList>

              {/* TAB 1: Front Cover - Full Layout Preview with Editable Title/Subtitle */}
              <TabsContent value="front" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col items-center">
                    <h3 className="font-medium mb-3">Current Front Cover</h3>
                    {/* Full Cover Layout Preview - constrained width, no yellow tint in preview */}
                    <div className="w-[280px] mx-auto">
                      <div className="aspect-[3/4] bg-white rounded-sm shadow-lg overflow-hidden border relative p-5 flex flex-col h-full">
                        
                        {/* TOP GROUP: Image, Title, Subtitle (Centered, anchored top) */}
                        <div className="flex flex-col items-center w-full">
                          {/* Image - matching preview proportions */}
                          <div className="relative w-[52%] aspect-square mb-4 flex-shrink-0">
                            {displayUrl ? (
                              <div className="w-full h-full rounded-lg overflow-hidden border-2 border-foreground/10 relative bg-secondary/10">
                                <img src={displayUrl} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] rounded-lg border-2 border-foreground/10 bg-secondary/10">
                                No Image
                              </div>
                            )}
                          </div>

                          {/* Title - scaled for 280px container */}
                          <h1 className="font-serif text-lg font-medium text-foreground leading-tight text-center tracking-wide mb-2 max-w-[220px]">
                            {parsedTitle.mainTitle}
                          </h1>

                          {/* Decorative divider */}
                          <div className="w-8 h-[1px] bg-foreground/20 mb-2" />

                          {/* Subtitle */}
                          {subtitle && (
                            <p className="text-[7px] uppercase tracking-[0.3em] text-muted-foreground/50 font-serif text-center line-clamp-2">
                              {subtitle}
                            </p>
                          )}
                        </div>

                        {/* Bottom branding - scaled proportionally */}
                        <div className="mt-auto text-center flex flex-col items-center gap-2 pt-3 pb-1">
                          {/* Logo icon - scaled to ~6px to match proportion */}
                          <div className="relative w-6 h-6 opacity-60">
                            {/* Vertical loom lines */}
                            <div className="absolute left-[3px] top-[3px] bottom-[3px] w-[1.5px] bg-foreground rounded-full" />
                            <div className="absolute left-1/2 -translate-x-1/2 top-[3px] bottom-[3px] w-[1.5px] bg-foreground rounded-full" />
                            <div className="absolute right-[3px] top-[3px] bottom-[3px] w-[1.5px] bg-foreground rounded-full" />
                            {/* Horizontal page fold */}
                            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-foreground rounded-full" />
                            {/* Corner fold detail */}
                            <div className="absolute right-0 top-0 w-1.5 h-1.5 border-r-[1.5px] border-t-[1.5px] border-foreground rounded-tr-sm opacity-60" />
                          </div>

                          <span className="font-serif text-[10px] font-normal tracking-tight text-muted-foreground/50">
                            Loom & Page
                          </span>

                          <p className="text-[6px] text-center text-muted-foreground/40 leading-relaxed max-w-[180px] italic">
                            AI-generated content for creative inspiration only. Not professional advice.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {/* Editable Title/Subtitle Fields */}
                    <div className="space-y-3 p-4 border rounded-lg bg-secondary/10">
                      <h4 className="font-medium text-sm">Edit Cover Text</h4>
                      <div>
                        <Label htmlFor="cover-title" className="text-sm">Title</Label>
                        <Input
                          id="cover-title"
                          value={localTitle}
                          onChange={(e) => setLocalTitle(e.target.value)}
                          placeholder="Book title..."
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cover-subtitle" className="text-sm">Subtitle</Label>
                        <Input
                          id="cover-subtitle"
                          value={localSubtitle}
                          onChange={(e) => setLocalSubtitle(e.target.value)}
                          placeholder="Subtitle..."
                          className="mt-1"
                        />
                      </div>
                      <Button 
                        onClick={handleSaveTextChanges} 
                        disabled={isSavingText}
                        variant="secondary"
                        className="w-full"
                      >
                        {isSavingText ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Text Changes'
                        )}
                      </Button>
                    </div>
                    
                    <div>
                      <Label htmlFor="front-prompt" className="text-base font-medium">Custom Image Prompt</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Describe the exact image you want (e.g., "Rush hour crowds in Times Square at sunset")
                      </p>
                      <Textarea
                        id="front-prompt"
                        value={frontPrompt}
                        onChange={(e) => setFrontPrompt(e.target.value)}
                        placeholder="Enter a detailed description of the image you want..."
                        rows={4}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleRegenerateFront} 
                        disabled={isRegeneratingFront}
                        className="flex-1"
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
                            Regenerate
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {/* Upload Cover Image */}
                    <div className="p-4 border-2 border-dashed border-border rounded-lg bg-secondary/5">
                      <h4 className="font-medium text-sm mb-2">Or Upload Your Own Image</h4>
                      <p className="text-xs text-muted-foreground mb-3">
                        Upload a custom cover image (JPG, PNG, max 5MB)
                      </p>
                      <input
                        ref={coverUploadRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCoverUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => coverUploadRef.current?.click()}
                        disabled={isUploadingCover}
                        className="w-full"
                      >
                        {isUploadingCover ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Cover Image
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: Back Cover - Clean White Design */}
              <TabsContent value="back" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Preview Column */}
                  <div>
                    <h3 className="font-medium mb-3">Current Back Cover</h3>
                    <div className="aspect-[3/4] bg-white rounded-sm shadow-sm overflow-hidden border border-gray-200 relative p-8 flex flex-col items-center text-center max-w-[300px]">
                      {/* Content Area - Top 2/3 */}
                      <div className="flex-1 flex flex-col items-center justify-start gap-4">
                        <h4 className="font-serif text-sm font-medium text-black tracking-wide uppercase">
                          {backCoverTitle}
                        </h4>
                        
                        {dedicationText && (
                          <p className="font-serif text-[10px] text-gray-600 italic">
                            {dedicationText}
                          </p>
                        )}
                        
                        <p className="font-serif text-[9px] text-gray-800 leading-relaxed max-w-[90%]">
                          {backCoverBody}
                        </p>
                        <p className="font-serif text-[9px] font-bold text-black mt-2">
                          {backCoverCTA}
                        </p>
                      </div>
                      {/* Bottom 1/3 Empty Space */}
                      <div className="h-[33%] w-full flex-shrink-0" />
                    </div>
                  </div>
                  {/* Settings Column */}
                  <div className="space-y-4">
                    <div className="space-y-3 p-4 border rounded-lg bg-secondary/10">
                      <h4 className="font-medium text-sm">Back Cover Text {!isAdmin && <span className="text-xs text-muted-foreground">(Admin Only)</span>}</h4>
                      <div>
                        <Label htmlFor="back-cover-title" className="text-sm">Header</Label>
                        <Input
                          id="back-cover-title"
                          value={backCoverTitle}
                          onChange={(e) => setBackCoverTitle(e.target.value)}
                          placeholder="Header text..."
                          className="mt-1"
                          disabled={!isAdmin}
                        />
                      </div>
                      <div>
                        <Label htmlFor="dedication-text" className="text-sm">Dedication / Subtitle</Label>
                        <Input
                          id="dedication-text"
                          value={dedicationText}
                          onChange={(e) => setDedicationText(e.target.value)}
                          placeholder="e.g., Prepared for the Smith Family"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="back-cover-body" className="text-sm">Body Text</Label>
                        <Textarea
                          id="back-cover-body"
                          value={backCoverBody}
                          onChange={(e) => setBackCoverBody(e.target.value)}
                          placeholder="Book description..."
                          rows={4}
                          className="mt-1"
                          disabled={!isAdmin}
                        />
                      </div>
                      <div>
                        <Label htmlFor="back-cover-cta" className="text-sm">Call to Action</Label>
                        <Input
                          id="back-cover-cta"
                          value={backCoverCTA}
                          onChange={(e) => setBackCoverCTA(e.target.value)}
                          placeholder="CTA text..."
                          className="mt-1"
                          disabled={!isAdmin}
                        />
                      </div>
                    </div>
                    
                    <div className="border-t pt-4">
                      <Label htmlFor="back-prompt" className="text-base font-medium">Back Cover Image (Optional)</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Generate a background image if desired
                      </p>
                      <Textarea
                        id="back-prompt"
                        value={backPrompt}
                        onChange={(e) => setBackPrompt(e.target.value)}
                        placeholder="Enter a texture or abstract background description..."
                        rows={3}
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

              {/* TAB 3: Spine - White background, black text, space-between layout */}
              <TabsContent value="spine" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex justify-center">
                    <div>
                      <h3 className="font-medium mb-3 text-center">Spine Preview</h3>
                      <div 
                        className="w-20 h-96 rounded flex flex-col items-center justify-between py-6 px-2 shadow-lg border"
                        style={{ backgroundColor: spineColor }}
                      >
                        {showSpineText ? (
                          <>
                            {/* Edition Text at TOP (Left on spine) */}
                            <span 
                              className="text-[10px] font-serif whitespace-nowrap"
                              style={{ 
                                writingMode: 'vertical-rl',
                                textOrientation: 'mixed',
                                transform: 'rotate(180deg)',
                                color: spineTextColor,
                                opacity: 0.7
                              }}
                            >
                              {editionText}
                            </span>
                            {/* Main Title at BOTTOM (Right on spine) */}
                            <span 
                              className="text-sm font-serif font-medium whitespace-nowrap max-w-[320px] overflow-hidden text-ellipsis"
                              style={{ 
                                writingMode: 'vertical-rl',
                                textOrientation: 'mixed',
                                transform: 'rotate(180deg)',
                                color: spineTextColor
                              }}
                            >
                              {spineText || title}
                            </span>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[8px] text-muted-foreground/50 rotate-90 whitespace-nowrap">
                              No text ({estimatedPages} pgs)
                            </span>
                          </div>
                        )}
                      </div>
                      {!showSpineText && (
                        <p className="text-[10px] text-amber-600 mt-2 text-center max-w-[200px] leading-tight bg-amber-50 p-2 rounded border border-amber-200">
                          *Spine text hidden. Amazon KDP requires 80+ pages (Est: {estimatedPages})
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="edition-text" className="text-base font-medium">Edition Text</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Displayed at the top of the spine (e.g., "2026 Edition")
                      </p>
                      <Input
                        id="edition-text"
                        value={editionText}
                        onChange={(e) => setEditionText(e.target.value)}
                        placeholder="2026 Edition"
                      />
                    </div>
                    <div>
                      <Label htmlFor="spine-text" className="text-base font-medium">Spine Title</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Usually the book title. Displayed at the bottom of the spine.
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
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="spine-text-color" className="text-base font-medium">Spine Text Color</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="spine-text-color"
                          type="color"
                          value={spineTextColor}
                          onChange={(e) => setSpineTextColor(e.target.value)}
                          className="w-20 h-12 p-1 cursor-pointer"
                        />
                        <Input
                          value={spineTextColor}
                          onChange={(e) => setSpineTextColor(e.target.value)}
                          placeholder="#000000"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="pt-4">
                      <h4 className="font-medium mb-2">Quick Background Colors</h4>
                      <div className="flex gap-2 flex-wrap">
                        {['#ffffff', '#f5f5f5', '#000000', '#1a1a2e', '#0d1b2a', '#2d3436', '#6c5ce7', '#fdcb6e'].map(color => (
                          <button
                            key={color}
                            className={`w-10 h-10 rounded border-2 transition-colors ${spineColor === color ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-foreground/30'}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setSpineColor(color)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="pt-2">
                      <h4 className="font-medium mb-2">Quick Text Colors</h4>
                      <div className="flex gap-2 flex-wrap">
                        {['#000000', '#1a1a1a', '#333333', '#ffffff', '#f5f5f5', '#6c5ce7', '#d63031'].map(color => (
                          <button
                            key={color}
                            className={`w-10 h-10 rounded border-2 transition-colors ${spineTextColor === color ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-foreground/30'}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setSpineTextColor(color)}
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

              {/* TAB 4: Full Wrap Preview - With Full Composite Front Cover */}
              <TabsContent value="wrap" className="space-y-4 pt-4">
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <div className="text-center">
                      <h3 className="font-medium mb-1">Full Wrap Preview (Amazon KDP Format)</h3>
                      <p className="text-sm text-muted-foreground">
                        Layout: Back Cover | Spine | Front Cover
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm border rounded-lg px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={showKdpGuides}
                        onChange={(e) => setShowKdpGuides(e.target.checked)}
                        className="accent-primary w-4 h-4"
                      />
                      <span>Show KDP Guides</span>
                    </label>
                  </div>
                  
                  {/* Centered Full Wrap Container */}
                  <div className="flex justify-center items-center">
                    <div className="relative flex items-stretch gap-0 border overflow-visible shadow-lg" style={{ maxWidth: '100%', transform: 'scale(2.2)', transformOrigin: 'top center', marginBottom: '300px', marginTop: '50px' }}>
                      
                      {/* KDP Guide Overlays (preview-only, never exported) */}
                      {showKdpGuides && (
                        <>
                          {/* Bleed area - 0.125" outside trim (red dashed) */}
                          <div className="absolute pointer-events-none border-2 border-dashed border-red-500/70 z-30" style={{ inset: '-3px' }} />
                          
                          {/* Trim line - exact edge of cover (blue solid) */}
                          <div className="absolute pointer-events-none border-2 border-blue-500/80 z-30" style={{ inset: '0' }} />
                          
                          {/* Safe zone - 0.25" inside trim on all outer edges (green dashed) */}
                          {/* Back cover safe zone: inset 4px from left/top/bottom, ends 4px before spine */}
                          <div className="absolute pointer-events-none border-2 border-dashed border-green-500/70 z-30" 
                            style={{ 
                              left: '4px', 
                              top: '4px', 
                              bottom: '4px', 
                              width: 'calc(50% - 12px - 4px)', // half of total minus spine half minus safe margins
                            }} 
                          />
                          {/* Front cover safe zone: inset 4px from right/top/bottom, starts 4px after spine */}
                          <div className="absolute pointer-events-none border-2 border-dashed border-green-500/70 z-30" 
                            style={{ 
                              right: '4px', 
                              top: '4px', 
                              bottom: '4px', 
                              width: 'calc(50% - 12px - 4px)', // half of total minus spine half minus safe margins
                            }} 
                          />
                          
                          {/* Barcode zone indicator (bottom 1/3 of back cover) */}
                          <div className="absolute pointer-events-none z-30 flex items-center justify-center"
                            style={{
                              left: '4px',
                              bottom: '4px',
                              width: 'calc(50% - 12px - 4px)',
                              height: '45px',
                              backgroundColor: 'rgba(255, 165, 0, 0.15)',
                              border: '1px dashed rgba(255, 165, 0, 0.6)',
                            }}
                          >
                            <span className="text-[5px] text-orange-600 font-medium uppercase tracking-wide">Barcode Zone</span>
                          </div>
                          
                        </>
                      )}
                      
                      {/* Back Cover Preview (Scaled Replica of Tab 2) */}
                      <div className="w-[100px] sm:w-[130px] aspect-[3/4] bg-white relative overflow-hidden flex-shrink-0 border-r border-gray-200">
                        
                        {/* Scaling Container: We render the layout at 300px width (same as Tab 2) and scale it down */}
                        <div className="origin-top-left scale-[0.33] sm:scale-[0.433] w-[300px] h-[400px]">
                          
                          {/* --- EXACT COPY OF TAB 2 CODE --- */}
                          <div className="w-full h-full bg-white p-8 flex flex-col items-center text-center">
                            
                            {/* Content Area - Top 2/3 */}
                            <div className="flex-1 flex flex-col items-center justify-start gap-4">
                              <h4 className="font-serif text-sm font-medium text-black tracking-wide uppercase">
                                {backCoverTitle}
                              </h4>
                              
                              {dedicationText && (
                                <p className="font-serif text-[10px] text-gray-600 italic">
                                  {dedicationText}
                                </p>
                              )}
                              
                              <p className="font-serif text-[9px] text-gray-800 leading-relaxed max-w-[90%]">
                                {backCoverBody}
                              </p>
                              
                              {/* CTA uses mt-2, breaking the gap-4 rhythm intentionally */}
                              <p className="font-serif text-[9px] font-bold text-black mt-2">
                                {backCoverCTA}
                              </p>
                            </div>
                            {/* Bottom 1/3 Empty Space (Barcode Zone) */}
                            <div className="h-[33%] w-full flex-shrink-0" />
                            
                          </div>
                          {/* --- END TAB 2 CODE --- */}
                          
                        </div>
                      </div>
                      {/* Spine - Smaller text */}
                      <div 
                        className="w-4 sm:w-5 flex flex-col items-center justify-between py-2 flex-shrink-0"
                        style={{ backgroundColor: spineColor }}
                      >
                        {/* Edition Text at TOP */}
                        <span 
                          className="text-[4px] sm:text-[5px] font-serif whitespace-nowrap"
                          style={{ 
                            writingMode: 'vertical-rl',
                            textOrientation: 'mixed',
                            transform: 'rotate(180deg)',
                            color: '#000000'
                          }}
                        >
                          {editionText}
                        </span>
                        {/* Title at BOTTOM */}
                        <span 
                          className="text-[5px] sm:text-[6px] font-serif font-medium whitespace-nowrap"
                          style={{ 
                            writingMode: 'vertical-rl',
                            textOrientation: 'mixed',
                            transform: 'rotate(180deg)',
                            color: '#000000'
                          }}
                        >
                          {(spineText || title).slice(0, 35)}
                        </span>
                      </div>
                      {/* Front Cover - scaled-down version of the Front Cover tab (1:1 spacing) */}
                      <div className="w-[100px] sm:w-[130px] aspect-[3/4] bg-white relative overflow-hidden flex-shrink-0">
                        <div className="origin-top-left scale-[0.357] sm:scale-[0.464]">
                          <div className="w-[280px] aspect-[3/4] relative p-5 flex flex-col h-full">
                            {/* TOP GROUP */}
                            <div className="flex flex-col items-center w-full">
                              <div className="relative w-[52%] aspect-square mb-4 flex-shrink-0">
                                {displayUrl ? (
                                  <div className="w-full h-full rounded-lg overflow-hidden border-2 border-foreground/10 relative bg-secondary/10">
                                    <img src={displayUrl} alt="Front" className="w-full h-full object-cover" />
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] rounded-lg border-2 border-foreground/10 bg-secondary/10">
                                    No Image
                                  </div>
                                )}
                              </div>

                              <h1 className="font-serif text-lg font-medium text-foreground leading-tight text-center tracking-wide mb-2 max-w-[220px]">
                                {parsedTitle.mainTitle}
                              </h1>

                              <div className="w-8 h-[1px] bg-foreground/20 mb-2" />

                              {subtitle && (
                                <p className="text-[7px] uppercase tracking-[0.3em] text-muted-foreground/50 font-serif text-center line-clamp-2">
                                  {subtitle}
                                </p>
                              )}
                            </div>

                            {/* BOTTOM BRANDING */}
                            <div className="mt-auto text-center flex flex-col items-center gap-2 pt-3 pb-1">
                              <div className="relative w-6 h-6 opacity-60">
                                <div className="absolute left-[3px] top-[3px] bottom-[3px] w-[1.5px] bg-foreground rounded-full" />
                                <div className="absolute left-1/2 -translate-x-1/2 top-[3px] bottom-[3px] w-[1.5px] bg-foreground rounded-full" />
                                <div className="absolute right-[3px] top-[3px] bottom-[3px] w-[1.5px] bg-foreground rounded-full" />
                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-foreground rounded-full" />
                                <div className="absolute right-0 top-0 w-1.5 h-1.5 border-r-[1.5px] border-t-[1.5px] border-foreground rounded-tr-sm opacity-60" />
                              </div>

                              <span className="font-serif text-[10px] font-normal tracking-tight text-muted-foreground/50">
                                Loom & Page
                              </span>

                              <p className="text-[6px] text-center text-muted-foreground/40 leading-relaxed max-w-[180px] italic">
                                AI-generated content for creative inspiration only. Not professional advice.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legend for guides */}
                  {showKdpGuides && (
                    <div className="flex flex-wrap justify-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border border-dashed border-red-500" /> Bleed (0.125")</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-500" /> Trim Edge</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border border-dashed border-green-500" /> Safe Zone (0.25")</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-2 bg-orange-200 border border-dashed border-orange-400" /> Barcode Area</span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    PDF dimensions: 12.485" × 9.25" (optimized for 6×9" trim with ~200 page spine)
                  </p>
                </div>
              </TabsContent>

              {/* TAB 5: Export - Unified KDP Package */}
              <TabsContent value="manuscript" className="space-y-4 pt-4">
                <div className="max-w-lg mx-auto text-center space-y-6">
                  {/* Unified KDP Package */}
                  <div className="p-8 border-2 border-primary/20 rounded-lg bg-primary/5">
                    <Package className="w-16 h-16 mx-auto mb-4 text-primary" />
                    <h3 className="text-xl font-bold mb-2">Complete KDP Package</h3>
                    <p className="text-muted-foreground mb-6">
                      Download everything you need for Amazon KDP in one ZIP file:
                    </p>
                    <ul className="text-left list-disc list-inside space-y-2 mb-6 text-sm text-muted-foreground">
                      <li><strong>Cover-File.pdf</strong> — Full wrap cover with spine</li>
                      <li><strong>Manuscript.pdf</strong> — Interior text with TOC & images</li>
                      <li><strong>Kindle-eBook.epub</strong> — Kindle eBook format</li>
                      <li><strong>Kindle_Cover.jpg</strong> — eBook cover image</li>
                    </ul>
                    
                    <Button 
                      onClick={handleDownloadKDPPackage} 
                      disabled={isGeneratingPackage || !bookData}
                      className="w-full"
                      size="lg"
                    >
                      {isGeneratingPackage ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating Package...
                        </>
                      ) : (
                        <>
                          <Package className="w-4 h-4 mr-2" />
                          Download KDP Package (ZIP)
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Individual Downloads */}
                  <div className="p-6 border rounded-lg bg-secondary/10">
                    <h4 className="font-medium mb-4">Or Download Individually</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <Button 
                        variant="outline"
                        onClick={handleDownloadKDP} 
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Cover PDF
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={handleDownloadManuscript} 
                        disabled={isDownloadingManuscript || !bookData}
                        className="w-full"
                      >
                        {isDownloadingManuscript ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4 mr-2" />
                        )}
                        Download Manuscript PDF
                      </Button>
                      <Button 
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                          const blob = await generateCoverJPGBlob();
                          if (blob) {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Kindle_Cover.jpg`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success('Kindle Cover (JPG) downloaded!');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          <div className="bg-primary/10 p-1 rounded mr-2">
                            <div className="w-3 h-4 border border-current rounded-[1px]" />
                          </div>
                          Download Kindle Cover (JPG)
                        </div>
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={async () => {
                          const epubBlob = await generateEPUBBlob();
                          if (epubBlob) {
                            const url = URL.createObjectURL(epubBlob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}-Kindle.epub`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success('Kindle eBook downloaded!');
                          }
                        }}
                        disabled={!bookData}
                        className="w-full"
                      >
                        <BookOpen className="w-4 h-4 mr-2" />
                        Download Kindle eBook (EPUB)
                      </Button>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground space-y-2">
                    <p><strong>Tip:</strong> For Amazon KDP, select 6" × 9" trim size.</p>
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
