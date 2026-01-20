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
import { BookData } from '@/lib/bookTypes';
import { generateCleanPDF } from '@/lib/generateCleanPDF';
import { generateGuideEPUB } from '@/lib/generateEPUB';
import { registerPlayfairFont, setSerifFont, FONT_SIZES, LINE_HEIGHTS } from '@/lib/pdfFonts';
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
    const calculateEstimatedPages = useCallback(() => {
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
    }, [bookData]);
    
    const estimatedPages = calculateEstimatedPages();
    const showSpineText = estimatedPages >= 80;
    
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

      try {
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) {
          const blob = await response.blob();
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(TRANSPARENT_PIXEL);
            reader.readAsDataURL(blob);
          });
        }
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
      
      // Back cover text widths - calibrated to match preview exactly
      // Preview uses max-w-[90%] for body, header spans almost full width
      const headerMaxW = backInnerW * 0.95;
      // Body width tuned to wrap to exactly 5 lines as specified
      const bodyMaxW = backInnerW * 0.58;

      // === SECTION 1: Header "CREATED WITH LOOM & PAGE" ===
      // Preview: text-sm (14px) tracking-wide uppercase font-medium
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(FONT_SIZES.backHeader); // 14pt
      const splitHeader = pdf.splitTextToSize(backCoverTitle.toUpperCase(), headerMaxW);
      // Add letter-spacing to match tracking-wide (0.025em)
      pdf.text(splitHeader, backCenterX, backSafeTop + 0.5, { 
        align: 'center',
        charSpace: 0.02 // tracking-wide
      });

      let backY = backSafeTop + 1.0;
      
      // Dedication (if present)
      if (dedicationText) {
        pdf.setFont(fontName, 'italic');
        pdf.setFontSize(FONT_SIZES.backDedication); // 10pt
        pdf.setTextColor(80, 80, 80);
        pdf.text(dedicationText, backCenterX, backY, { align: 'center' });
        backY += 0.35;
      }

      // === SECTION 2: Body paragraph ===
      // Preview: text-[9px] leading-relaxed (1.625 line-height)
      // Must wrap to exactly 5 lines as specified
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(FONT_SIZES.backBody); // 9pt
      pdf.setTextColor(40, 40, 40);
      const splitBody = pdf.splitTextToSize(backCoverBody, bodyMaxW);
      // leading-relaxed = 1.625 line-height factor
      const ptToIn = (pt: number) => pt / 72;
      const bodyLineHeight = ptToIn(FONT_SIZES.backBody) * 1.625;
      pdf.text(splitBody, backCenterX, backY, { 
        align: 'center', 
        lineHeightFactor: 1.625 
      });

      backY += splitBody.length * bodyLineHeight + 0.3;
      
      // === SECTION 3: CTA "Create yours at www.LoomandPage.com" ===
      // Preview: text-[9px] font-bold
      pdf.setFont(fontName, 'bold');
      pdf.setFontSize(FONT_SIZES.backCTA); // 9pt
      pdf.setTextColor(0, 0, 0);
      pdf.text(backCoverCTA, backCenterX, backY, { align: 'center' });

      // === SPINE ===
      const spineRgb = hexToRgb(spineColor);
      pdf.setFillColor(spineRgb.r, spineRgb.g, spineRgb.b);
      pdf.rect(coverWidth, 0, spineWidth, pageHeight, 'F');

      if (showSpineText) {
        const textRgb = hexToRgb(spineTextColor);
        pdf.setTextColor(textRgb.r, textRgb.g, textRgb.b);
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(FONT_SIZES.spineEdition);
        pdf.text(editionText, coverWidth + spineWidth / 2, 0.4, { angle: 90, align: 'left' });
        pdf.setFontSize(FONT_SIZES.spineTitle);
        pdf.text((spineText || title).slice(0, 35), coverWidth + spineWidth / 2, pageHeight - 0.4, { angle: 90, align: 'right' });
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

    // Download KDP Full Wrap PDF - Pixel-perfect match to visual preview
    const handleDownloadKDP = async () => {
      toast.info('Generating KDP cover PDF...');

      try {
        const { pdf } = createKdpCoverPdf();
        await renderKdpCoverToPdf(pdf, false);
        const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_KDP_Cover.pdf`;
        pdf.save(filename);
        toast.success('KDP cover PDF downloaded!');
      } catch (err) {
        console.error('Failed to generate PDF:', err);
        toast.error('Failed to generate PDF');
      }
    };

    const handleDownloadKDPDebugGuides = async () => {
      toast.info('Generating KDP cover PDF (with guides)...');

      try {
        const { pdf } = createKdpCoverPdf();
        await renderKdpCoverToPdf(pdf, true);
        const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_KDP_Cover_GUIDES.pdf`;
        pdf.save(filename);
        toast.success('Debug cover PDF downloaded!');
      } catch (err) {
        console.error('Failed to generate debug PDF:', err);
        toast.error('Failed to generate debug PDF');
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
          coverImageUrl: validCoverUrl,
          isKdpManuscript: true
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

    // Helper: Generate Kindle Cover JPG as Blob (canvas-based)
    const generateCoverJPGBlob = async (): Promise<Blob | null> => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600; canvas.height = 2560; const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Background
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1600, 2560);

      // 1. IMAGE (1000px wide = ~60% Width, Centered)
      if (displayUrl) {
        const img = new Image(); img.crossOrigin = "Anonymous"; img.src = displayUrl;
        await new Promise((r) => { img.onload = r; img.onerror = r; });
        ctx.drawImage(img, 300, 250, 1000, 1000); 
      }

      // 2. TITLE
      ctx.fillStyle = '#000000'; ctx.font = '500 110px serif'; ctx.textAlign = 'center';
      const words = title.split(' '); let line = ''; let y = 1450;
      for(let n = 0; n < words.length; n++) {
        if (ctx.measureText(line + words[n]).width > 1200 && n > 0) { ctx.fillText(line, 800, y); line = words[n] + ' '; y += 130; }
        else { line += words[n] + ' '; }
      }
      ctx.fillText(line, 800, y);

      // 3. SEPARATOR
      y += 80; ctx.beginPath(); ctx.moveTo(700, y); ctx.lineTo(900, y);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 4; ctx.stroke();

      // 4. SUBTITLE
      if (subtitle) {
         y += 100; ctx.font = 'italic 40px serif'; ctx.fillStyle = '#666666';
         ctx.fillText(subtitle.toUpperCase(), 800, y);
      }

      // 5. LOGO (Large & Clear)
      y += 200; const lx = 760; 
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 5; ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(lx+10, y); ctx.lineTo(lx+10, y+100);
      ctx.moveTo(lx+40, y); ctx.lineTo(lx+40, y+100);
      ctx.moveTo(lx+70, y); ctx.lineTo(lx+70, y+100);
      ctx.moveTo(lx, y+50); ctx.lineTo(lx+80, y+50);
      ctx.stroke(); ctx.globalAlpha = 1.0;

      // 6. BRAND
      y += 150; ctx.font = '400 30px serif'; ctx.fillStyle = '#999999';
      ctx.fillText("Loom & Page", 800, y);

      // 7. DISCLAIMER
      y += 80; ctx.font = 'italic 20px sans-serif'; ctx.fillStyle = '#aaaaaa';
      ctx.fillText("AI-generated content for creative inspiration only.", 800, y);
      ctx.fillText("Not professional advice.", 800, y + 30);

      return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
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

        const epubBlob = await generateGuideEPUB({
          title,
          topic: topic || title,
          bookData: bookData!,
          coverImageUrl: displayUrl,
          returnBlob: true
        });
        if (epubBlob) zip.file('Kindle-eBook.epub', epubBlob);

        // CHANGED: Use the new generator instead of raw URL
        const kindleCoverBlob = await generateCoverJPGBlob();
        if (kindleCoverBlob) zip.file('Kindle_Cover.jpg', kindleCoverBlob);

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}-KDP-Package.zip`;
        a.click();
        URL.revokeObjectURL(url);

        toast.success('KDP Package downloaded successfully!');
      } catch (err) {
        console.error('Failed to generate KDP package:', err);
        toast.error('Failed to generate KDP package');
      } finally {
        setIsGeneratingPackage(false);
      }
    };

    // Helper: Generate Cover PDF as Blob (matches handleDownloadKDP exactly)
    const generateCoverPDFBlob = async (): Promise<Blob | null> => {
      try {
        const { pdf } = createKdpCoverPdf();
        await renderKdpCoverToPdf(pdf, false);
        return pdf.output('blob');
      } catch (e) {
        console.error('Error generating cover PDF blob:', e);
        return null;
      }
    };

    // Helper: Generate Manuscript PDF as Blob
    const generateManuscriptPDFBlob = async (): Promise<Blob | null> => {
      try {
        const validCoverUrl = displayUrl && displayUrl.trim().length > 0 ? displayUrl : undefined;
        
        const blob = await generateCleanPDF({
          topic: topic || title,
          bookData: bookData!,
          coverImageUrl: validCoverUrl,
          isKdpManuscript: true, // Forces 6x9 size
          returnBlob: true // Returns blob instead of saving
        });
        
        return (blob as Blob) || null;
      } catch (err) {
        console.error('Error generating manuscript PDF:', err);
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
                      
                      {/* Back Cover - Clean White Design */}
                      <div className="w-[100px] sm:w-[130px] aspect-[3/4] bg-white relative flex-shrink-0 p-2 flex flex-col items-center text-center">
                        {/* Content Area - Top 2/3 */}
                        <div className="flex-1 flex flex-col items-center justify-start gap-1">
                          <h4 className="font-serif text-[6px] font-medium text-black tracking-wide uppercase">
                            {backCoverTitle}
                          </h4>
                          
                          {dedicationText && (
                            <p className="font-serif text-[4px] text-gray-600 italic">
                              {dedicationText}
                            </p>
                          )}
                          
                          <p className="font-serif text-[4px] text-gray-800 leading-relaxed max-w-[90%]">
                            {backCoverBody}
                          </p>
                          <p className="font-serif text-[4px] font-bold text-black mt-0.5">
                            {backCoverCTA}
                          </p>
                        </div>
                        {/* Bottom 1/3 Empty Space */}
                        <div className="h-[33%] w-full flex-shrink-0" />
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
                        onClick={handleDownloadKDPDebugGuides} 
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Cover PDF (with Guides)
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
