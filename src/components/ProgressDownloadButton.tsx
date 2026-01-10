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

/**
 * Extract all image URLs from chapter content (e.g., [IMAGE: url] markers or inline images)
 * and from the bookData structure
 */
const extractAllImageUrls = (bookData: BookData): string[] => {
  const urls: string[] = [];
  
  // Extract from all chapter content
  const chapters = [
    bookData.chapter1Content,
    bookData.chapter2Content,
    bookData.chapter3Content,
    bookData.chapter4Content,
    bookData.chapter5Content,
    bookData.chapter6Content,
    bookData.chapter7Content,
    bookData.chapter8Content,
    bookData.chapter9Content,
    bookData.chapter10Content,
  ];
  
  // Look for markdown image syntax: ![alt](url) and HTML img tags
  const imagePatterns = [
    /!\[[^\]]*\]\(([^)]+)\)/g,  // Markdown images
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,  // HTML img tags
  ];
  
  chapters.forEach((content, idx) => {
    if (!content) return;
    
    imagePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const url = match[1];
        if (url && !url.startsWith('data:') && !urls.includes(url)) {
          console.log(`[PDF] Found image in chapter ${idx + 1}: ${url.substring(0, 50)}...`);
          urls.push(url);
        }
      }
    });
  });
  
  return urls;
};

/**
 * Process all images in bookData and convert them to Base64
 * Returns a deep copy of bookData with all URLs replaced
 */
const processBookImages = async (
  bookData: BookData,
  coverImageUrls: string[],
  onProgress?: (message: string) => void
): Promise<{ processedBookData: BookData; base64CoverUrl: string | null }> => {
  onProgress?.('Converting cover image...');
  
  // Step 1: Convert cover image
  const base64CoverUrl = await getBase64CoverImage(coverImageUrls);
  
  // Step 2: Extract and convert all chapter images
  const chapterImageUrls = extractAllImageUrls(bookData);
  console.log(`[PDF] Found ${chapterImageUrls.length} chapter images to convert`);
  
  if (chapterImageUrls.length === 0) {
    return { processedBookData: bookData, base64CoverUrl };
  }
  
  onProgress?.(`Converting ${chapterImageUrls.length} chapter images...`);
  
  // Convert all chapter images in parallel (up to 5 at a time to avoid overwhelming the server)
  const urlToBase64Map: Record<string, string> = {};
  
  for (let i = 0; i < chapterImageUrls.length; i += 5) {
    const batch = chapterImageUrls.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (url) => {
        const base64 = await convertImageToBase64(url);
        return { url, base64 };
      })
    );
    
    results.forEach(({ url, base64 }) => {
      if (base64) {
        urlToBase64Map[url] = base64;
      }
    });
  }
  
  console.log(`[PDF] Successfully converted ${Object.keys(urlToBase64Map).length} chapter images`);
  
  // Step 3: Create a deep copy of bookData with URLs replaced
  const processedBookData = { ...bookData };
  
  // Replace URLs in all chapter content
  const chapterKeys = [
    'chapter1Content', 'chapter2Content', 'chapter3Content', 'chapter4Content',
    'chapter5Content', 'chapter6Content', 'chapter7Content', 'chapter8Content',
    'chapter9Content', 'chapter10Content'
  ] as const;
  
  chapterKeys.forEach((key) => {
    let content = processedBookData[key];
    if (!content) return;
    
    Object.entries(urlToBase64Map).forEach(([url, base64]) => {
      content = content!.replace(new RegExp(escapeRegExp(url), 'g'), base64);
    });
    
    (processedBookData as any)[key] = content;
  });
  
  return { processedBookData, base64CoverUrl };
};

/**
 * Escape special regex characters in a string
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const [conversionStatus, setConversionStatus] = useState('');
  
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
      return conversionStatus || 'Embedding High-Res Images...';
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
   * Converts ALL images (cover + chapters) to Base64 before PDF generation
   * Uses a 4000ms delay to ensure all image processing completes
   */
  const handleDownload = async () => {
    if (!bookData) {
      toast.error('Book data not available');
      return;
    }

    try {
      setIsConverting(true);
      setConversionStatus('Embedding High-Res Images...');
      
      // Show persistent loading toast with clear messaging
      toast.loading('Embedding High-Res Images...', { 
        id: 'pdf-progress',
        description: 'Converting all images for embedding (please wait ~5 seconds)...' 
      });

      console.log('[PDF] Starting PDF preparation...');
      console.log('[PDF] Cover URLs available:', coverImageUrls.length);

      // STEP 1: Process ALL images (cover + chapters) to Base64
      const { processedBookData, base64CoverUrl } = await processBookImages(
        bookData,
        coverImageUrls,
        (message) => {
          setConversionStatus(message);
          toast.loading('Embedding High-Res Images...', { 
            id: 'pdf-progress',
            description: message 
          });
        }
      );
      
      if (base64CoverUrl) {
        console.log('[PDF] Cover image ready for embedding');
      } else {
        console.log('[PDF] No cover image available, proceeding without');
      }

      // STEP 2: Wait 4000ms (4 seconds) for all async operations to settle
      // This ensures the Base64 data is fully available before PDF generation
      console.log('[PDF] Waiting 4 seconds for image processing to complete...');
      setConversionStatus('Finalizing images...');
      toast.loading('Finalizing images...', { 
        id: 'pdf-progress',
        description: 'Ensuring all images are embedded properly...' 
      });
      await new Promise(resolve => setTimeout(resolve, 4000));

      // STEP 3: Update toast and generate PDF
      setConversionStatus('Generating PDF...');
      toast.loading('Generating PDF...', { 
        id: 'pdf-progress',
        description: 'Creating your clean, content-only guide.' 
      });

      console.log('[PDF] Calling generateCleanPDF with processed book data...');

      // Generate PDF with Base64 cover image and processed book data
      await generateCleanPDF({
        topic,
        bookData: processedBookData,
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
      setConversionStatus('');
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
          {conversionStatus || 'Preparing your premium PDF with all content and cover image...'}
        </p>
      )}
    </div>
  );
};

export default ProgressDownloadButton;
