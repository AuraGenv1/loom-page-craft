import { Download, Loader2 } from 'lucide-react';
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
  /** Book data required for PDF generation */
  bookData?: BookData | null;
  /** Topic for filename */
  topic?: string;
  /** Cover image URL(s) */
  coverImageUrls?: string[];
}

/**
 * Convert image URL to Base64 data URL for PDF embedding
 * This ensures images are embedded directly in the PDF and avoids CORS issues
 */
const convertImageToBase64 = async (url: string): Promise<string | null> => {
  if (!url) return null;
  if (url.startsWith('data:')) return url; // Already a data URL

  try {
    console.log('[PDF] Converting image to Base64:', url.substring(0, 80) + '...');
    
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });

    if (error) {
      console.warn('[PDF] fetch-image-data-url failed:', error);
      return null;
    }

    if (data?.dataUrl && typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:')) {
      console.log('[PDF] Successfully converted image to Base64');
      return data.dataUrl;
    }

    console.warn('[PDF] Invalid response from fetch-image-data-url');
    return null;
  } catch (e) {
    console.warn('[PDF] convertImageToBase64 exception:', e);
    return null;
  }
};

/**
 * Try multiple cover URLs until one successfully converts to Base64
 */
const getBase64CoverImage = async (coverImageUrls: string[]): Promise<string | null> => {
  if (!coverImageUrls || coverImageUrls.length === 0) return null;

  for (let i = 0; i < coverImageUrls.length; i++) {
    const url = coverImageUrls[i];
    console.log(`[PDF] Trying cover image ${i + 1}/${coverImageUrls.length}...`);
    
    const base64Url = await convertImageToBase64(url);
    if (base64Url) {
      console.log(`[PDF] Cover image ${i + 1} converted successfully`);
      return base64Url;
    }
  }

  console.warn('[PDF] All cover images failed to convert');
  return null;
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
}: ProgressDownloadButtonProps) => {
  const [isConverting, setIsConverting] = useState(false);
  
  const progress = useMemo(() => {
    return Math.round((completedChapters / totalChapters) * 100);
  }, [completedChapters, totalChapters]);

  const isComplete = completedChapters >= totalChapters;
  const isWeaving = completedChapters < totalChapters;
  const isCompiling = externalIsCompiling || isConverting;

  // For purchased users: must wait for all 10 chapters
  const canDownload = isPurchased ? isComplete && !isCompiling : !disabled && !isCompiling;
  
  // Button label based on state
  const getButtonLabel = () => {
    if (isConverting) {
      return 'Preparing High-Resolution PDF...';
    }
    if (isCompiling) {
      return 'Compiling your guide...';
    }
    if (isPurchased && !isComplete) {
      return `Weaving... ${completedChapters}/${totalChapters} chapters`;
    }
    return 'Download Full Guide (PDF)';
  };

  /**
   * Handle PDF download with robust Base64 image conversion
   * Converts ALL cover images to Base64 before PDF generation to avoid CORS issues
   */
  const handleDownload = async () => {
    if (!bookData) {
      toast.error('Book data not available');
      return;
    }

    try {
      setIsConverting(true);
      
      // Show persistent loading toast
      toast.loading('Preparing High-Resolution PDF...', { 
        id: 'pdf-progress',
        description: 'Converting images for embedding (this may take a moment)...' 
      });

      console.log('[PDF] Starting PDF preparation...');
      console.log('[PDF] Cover URLs available:', coverImageUrls.length);

      // STEP 1: Convert cover image to Base64 for PDF embedding
      // Try multiple URLs until one works (fallback logic)
      const base64CoverUrl = await getBase64CoverImage(coverImageUrls);
      
      if (base64CoverUrl) {
        console.log('[PDF] Cover image ready for embedding');
      } else {
        console.log('[PDF] No cover image available, proceeding without');
      }

      // STEP 2: Wait for any async operations to settle
      // This ensures the Base64 data is fully available before PDF generation
      console.log('[PDF] Waiting for image processing to complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // STEP 3: Update toast and generate PDF
      toast.loading('Generating PDF...', { 
        id: 'pdf-progress',
        description: 'Creating your clean, content-only guide.' 
      });

      console.log('[PDF] Calling generateCleanPDF...');

      // Generate PDF with Base64 cover image
      await generateCleanPDF({
        topic,
        bookData,
        coverImageUrl: base64CoverUrl,
      });

      toast.success('PDF downloaded!', { 
        id: 'pdf-progress',
        description: 'Your guide has been saved.' 
      });

      console.log('[PDF] PDF generation complete');

      // Call external onClick if provided
      onClick?.();
    } catch (error) {
      console.error('[PDF] PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.', { id: 'pdf-progress' });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress Button with left-to-right fill */}
      <button
        onClick={handleDownload}
        disabled={!canDownload}
        className="relative overflow-hidden min-w-[280px] h-12 rounded border border-foreground/20 font-serif text-base transition-all duration-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-90"
        style={{
          background: 'hsl(var(--muted))',
        }}
      >
        {/* Progress fill bar - moves left to right */}
        <div 
          className="absolute inset-0 bg-foreground transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
          }}
        />
        
        {/* Button text - use mix-blend-mode for automatic contrast */}
        <span 
          className="relative z-10 flex items-center justify-center gap-2 h-full px-6 font-serif"
          style={{
            mixBlendMode: 'difference',
            color: 'white',
          }}
        >
          {isCompiling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="font-medium">{getButtonLabel()}</span>
        </span>
      </button>
      
      {/* Elegant italic status text - centered below button */}
      {isWeaving && !isCompiling && (
        <p className="text-sm text-muted-foreground font-serif italic text-center">
          {isPurchased 
            ? `Please wait while we weave all ${totalChapters} chapters...`
            : 'Our Artisan is weaving your custom details...'
          }
        </p>
      )}
      
      {isCompiling && (
        <p className="text-sm text-muted-foreground font-serif italic text-center">
          Preparing your premium PDF with all content and cover image...
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
