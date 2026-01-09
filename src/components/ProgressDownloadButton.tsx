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
 */
const convertImageToBase64 = async (url: string): Promise<string | null> => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  try {
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });

    if (error) {
      console.warn('fetch-image-data-url failed:', error);
      return null;
    }

    if (data?.dataUrl && typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:')) {
      return data.dataUrl;
    }

    return null;
  } catch (e) {
    console.warn('convertImageToBase64 exception:', e);
    return null;
  }
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
      return 'Preparing images for PDF...';
    }
    if (isCompiling) {
      return 'Compiling your high-quality PDF...';
    }
    if (isPurchased && !isComplete) {
      return `Weaving... ${completedChapters}/${totalChapters} chapters`;
    }
    return 'Download Full Guide (PDF)';
  };

  /**
   * Handle PDF download with Base64 image conversion
   */
  const handleDownload = async () => {
    if (!bookData) {
      toast.error('Book data not available');
      return;
    }

    try {
      setIsConverting(true);
      toast.info('Preparing PDF...', { 
        id: 'pdf-progress',
        description: 'Converting images for embedding...' 
      });

      // Convert cover image to Base64 for PDF embedding
      let base64CoverUrl: string | null = null;
      
      if (coverImageUrls.length > 0) {
        // Try each cover URL until one succeeds
        for (const url of coverImageUrls) {
          base64CoverUrl = await convertImageToBase64(url);
          if (base64CoverUrl) break;
        }
      }

      // Allow 3 seconds for conversion to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      toast.info('Generating PDF...', { 
        id: 'pdf-progress',
        description: 'Creating your clean, content-only guide.' 
      });

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

      // Call external onClick if provided
      onClick?.();
    } catch (error) {
      console.error('PDF generation error:', error);
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
          Preparing your premium PDF with all diagrams and formatting...
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
