import { Download, Loader2, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { generateCleanPDF } from '@/lib/generateCleanPDF';
import { BookData } from '@/lib/bookTypes';
import { toast } from 'sonner';

interface ProgressDownloadButtonProps {
  completedChapters: number;
  totalChapters?: number;
  onClick?: () => void;
  disabled?: boolean;
  isPurchased?: boolean;
  isCompiling?: boolean;
  bookData?: BookData | null;
  topic?: string;
  coverImageUrls?: string[];
  isAdmin?: boolean;
}

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Robust Image Converter (Fixes 400 Errors)
const convertImageToBase64 = async (url: string): Promise<string> => {
  if (!url) return TRANSPARENT_PIXEL;
  if (url.startsWith('data:')) return url;

  try {
    // 1. Try Direct Fetch (Fastest)
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(TRANSPARENT_PIXEL);
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.warn("Direct fetch failed, trying proxy...");
  }

  // 2. Try Supabase Edge Function (Fallback)
  try {
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });
    if (!error && data?.dataUrl) return data.dataUrl;
  } catch (e) {
    console.warn("Edge function failed", e);
  }

  return TRANSPARENT_PIXEL;
};

// Process images for PDF
const processBookImages = async (bookData: BookData, coverImageUrls: string[]) => {
  // Use first valid cover image
  const coverUrl = coverImageUrls?.[0] || '';
  const base64CoverUrl = await convertImageToBase64(coverUrl);
  
  // Clone data
  const processedData = { ...bookData };
  
  // (Optional: Add logic here to convert chapter images if needed)
  // For now, we return the data as-is but with the cover prepared
  return { processedBookData: processedData, base64CoverUrl };
};

const ProgressDownloadButton = ({
  completedChapters,
  totalChapters = 10,
  onClick,
  disabled = false,
  isPurchased = false,
  isCompiling: externalIsCompiling = false,
  bookData,
  topic = 'guide',
  coverImageUrls = [],
  isAdmin = false,
}: ProgressDownloadButtonProps) => {
  const [isConverting, setIsConverting] = useState(false);
  
  const progress = useMemo(() => Math.round((completedChapters / totalChapters) * 100), [completedChapters, totalChapters]);
  const isComplete = completedChapters >= totalChapters;
  const isCompiling = externalIsCompiling || isConverting;
  const canDownload = isPurchased ? isComplete && !isCompiling : !disabled && !isCompiling;

  // ADMIN HANDLER: Opens the KDP Studio
  const handleAdminClick = () => {
    const studioTrigger = document.getElementById('kdp-studio-trigger');
    if (studioTrigger) {
      studioTrigger.click();
      toast.info("Opening KDP Export Studio...");
      
      // Auto-switch to Export tab after a short delay
      setTimeout(() => {
        const exportTab = document.querySelector('[value="manuscript"]');
        if (exportTab instanceof HTMLElement) exportTab.click();
      }, 500);
    } else {
      toast.error("Could not open Studio. Please scroll up.");
    }
  };

  // USER HANDLER: Generates PDF
  const handleUserDownload = async () => {
    if (!bookData) { toast.error('Book data missing'); return; }
    
    try {
      setIsConverting(true);
      toast.loading('Preparing guide...', { id: 'pdf-gen' });

      // Process images
      const { processedBookData, base64CoverUrl } = await processBookImages(bookData, coverImageUrls || []);
      
      await generateCleanPDF({
        topic,
        bookData: processedBookData,
        coverImageUrl: base64CoverUrl !== TRANSPARENT_PIXEL ? base64CoverUrl : undefined,
      });

      toast.success('Downloaded!', { id: 'pdf-gen' });
      onClick?.();
    } catch (e) {
      console.error(e);
      toast.error('Download failed', { id: 'pdf-gen' });
    } finally {
      setIsConverting(false);
    }
  };

  // Button Label
  const getLabel = () => {
    if (isAdmin) return "Export KDP Package";
    if (isCompiling) return "Generating PDF...";
    if (isPurchased && !isComplete) return `Weaving... ${completedChapters}/${totalChapters}`;
    return "Download Full Guide (PDF)";
  };

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <button
        onClick={isAdmin ? handleAdminClick : handleUserDownload}
        disabled={!canDownload}
        className={`
          relative w-full max-w-xs h-14 rounded-lg font-serif text-base font-medium
          transition-all duration-300 overflow-hidden
          ${canDownload 
            ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer shadow-lg hover:shadow-xl' 
            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
          }
        `}
      >
        {/* Progress Bar (Users Only) */}
        {!isAdmin && (
          <div 
            className="absolute inset-0 bg-emerald-600/30 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        )}

        <span className="relative z-10 flex items-center justify-center gap-2">
          {isCompiling ? <Loader2 className="w-5 h-5 animate-spin" /> : isAdmin ? <Package className="w-5 h-5" /> : <Download className="w-5 h-5" />}
          {getLabel()}
        </span>
      </button>

      {/* Status Text */}
      {!isAdmin && !isCompiling && !isComplete && (
        <p className="text-xs text-muted-foreground text-center">
          {isPurchased ? `Please wait for all chapters...` : 'Our Artisan is weaving your custom details...'}
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
