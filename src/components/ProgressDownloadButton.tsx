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

// Transparent 1x1 pixel PNG as fail-safe placeholder
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Convert image URL to Base64 data URL for PDF embedding
 * This ensures images are embedded directly in the PDF and avoids CORS issues
 * FAIL-SAFE: Returns transparent 1x1 pixel if conversion fails
 */
const convertImageToBase64 = async (url: string): Promise<string> => {
  if (!url) return TRANSPARENT_PIXEL;
  if (url.startsWith('data:')) return url; // Already a data URL

  try {
    console.log('[PDF] Converting image to Base64:', url.substring(0, 80) + '...');
    
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });

    if (error) {
      console.warn('[PDF] fetch-image-data-url failed:', error);
      return TRANSPARENT_PIXEL;
    }

    if (data?.dataUrl && typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:')) {
      console.log('[PDF] Successfully converted image to Base64');
      return data.dataUrl;
    }

    console.warn('[PDF] Invalid response from fetch-image-data-url');
    return TRANSPARENT_PIXEL;
  } catch (e) {
    console.warn('[PDF] convertImageToBase64 exception:', e);
    return TRANSPARENT_PIXEL;
  }
};

/**
 * Try multiple cover URLs until one successfully converts to Base64
 * FAIL-SAFE: Returns transparent pixel if all URLs fail
 */
const getBase64CoverImage = async (coverImageUrls: string[]): Promise<string> => {
  if (!coverImageUrls || coverImageUrls.length === 0) return TRANSPARENT_PIXEL;

  for (let i = 0; i < coverImageUrls.length; i++) {
    const url = coverImageUrls[i];
    console.log(`[PDF] Trying cover image ${i + 1}/${coverImageUrls.length}...`);
    
    const base64Url = await convertImageToBase64(url);
    if (base64Url && base64Url !== TRANSPARENT_PIXEL) {
      console.log(`[PDF] Cover image ${i + 1} converted successfully`);
      return base64Url;
    }
  }

  console.warn('[PDF] All cover images failed to convert, using transparent pixel');
  return TRANSPARENT_PIXEL;
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
 * FAIL-SAFE: Failed images are replaced with transparent 1x1 pixel
 * 
 * GUEST PREVIEW: If isPurchased=false, only process Chapter 1
 */
const processBookImages = async (
  bookData: BookData,
  coverImageUrls: string[],
  onProgress?: (message: string) => void,
  isPurchased: boolean = false
): Promise<{ processedBookData: BookData; base64CoverUrl: string }> => {
  onProgress?.('Embedding cover image...');
  
  // Step 1: Convert cover image (with fail-safe)
  const base64CoverUrl = await getBase64CoverImage(coverImageUrls);
  
  // GUEST PREVIEW: For non-purchased users, only include Chapter 1 in PDF
  // Create a cleaned copy with only Chapter 1 content
  let bookDataToProcess = { ...bookData };
  
  if (!isPurchased) {
    console.log('[PDF] GUEST MODE: Only processing Chapter 1 for PDF');
    bookDataToProcess = {
      ...bookData,
      chapter2Content: undefined,
      chapter3Content: undefined,
      chapter4Content: undefined,
      chapter5Content: undefined,
      chapter6Content: undefined,
      chapter7Content: undefined,
      chapter8Content: undefined,
      chapter9Content: undefined,
      chapter10Content: undefined,
    };
  }
  
  // Step 2: Extract and convert all chapter images
  const chapterImageUrls = extractAllImageUrls(bookDataToProcess);
  console.log(`[PDF] Found ${chapterImageUrls.length} chapter images to convert`);
  
  if (chapterImageUrls.length === 0) {
    return { processedBookData: bookDataToProcess, base64CoverUrl };
  }
  
  onProgress?.(`Embedding ${chapterImageUrls.length} chapter images...`);
  
  // Convert all chapter images in parallel (up to 5 at a time to avoid overwhelming the server)
  // FAIL-SAFE: Failed images get transparent pixel
  const urlToBase64Map: Record<string, string> = {};
  
  for (let i = 0; i < chapterImageUrls.length; i += 5) {
    const batch = chapterImageUrls.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const base64 = await convertImageToBase64(url);
          return { url, base64 };
        } catch (e) {
          console.warn(`[PDF] Failed to convert image, using transparent pixel:`, url);
          return { url, base64: TRANSPARENT_PIXEL };
        }
      })
    );
    
    results.forEach(({ url, base64 }) => {
      urlToBase64Map[url] = base64;
    });
  }
  
  const successCount = Object.values(urlToBase64Map).filter(v => v !== TRANSPARENT_PIXEL).length;
  console.log(`[PDF] Successfully converted ${successCount}/${chapterImageUrls.length} chapter images`);
  
  // Step 3: Create a deep copy of bookData with URLs replaced
  const processedBookData = { ...bookDataToProcess };
  
  // Replace URLs in all chapter content (only Chapter 1 for guests)
  const chapterKeys = isPurchased 
    ? ['chapter1Content', 'chapter2Content', 'chapter3Content', 'chapter4Content',
       'chapter5Content', 'chapter6Content', 'chapter7Content', 'chapter8Content',
       'chapter9Content', 'chapter10Content'] as const
    : ['chapter1Content'] as const;
  
  chapterKeys.forEach((key) => {
    let content = (processedBookData as any)[key];
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
   * FAIL-SAFE: Failed images become transparent pixels (no crashes)
   */
  const handleDownload = async () => {
    if (!bookData) {
      toast.error('Book data not available');
      console.error('[PDF] No bookData provided');
      return;
    }

    // DEBUG: Log incoming book data
    console.log('[PDF] === PDF DOWNLOAD STARTED ===');
    console.log('[PDF] Topic:', topic);
    console.log('[PDF] Cover URLs available:', coverImageUrls.length);
    console.log('[PDF] Book title:', bookData.title);
    console.log('[PDF] Chapter 1 content length:', bookData.chapter1Content?.length || 0);
    
    // Count all chapters
    const chapterKeys = ['chapter1Content', 'chapter2Content', 'chapter3Content', 'chapter4Content', 
                         'chapter5Content', 'chapter6Content', 'chapter7Content', 'chapter8Content',
                         'chapter9Content', 'chapter10Content'] as const;
    const chaptersWithContent = chapterKeys.filter(key => bookData[key] && bookData[key]!.length > 0);
    console.log('[PDF] Total chapters with content:', chaptersWithContent.length);
    chaptersWithContent.forEach(key => {
      console.log(`[PDF] ${key} length: ${bookData[key]?.length || 0} chars`);
    });

    try {
      setIsConverting(true);
      setConversionStatus('Embedding High-Res Images...');
      
      // Show persistent loading toast with clear messaging
      toast.loading('Embedding High-Res Images...', { 
        id: 'pdf-progress',
        description: 'Converting all images for embedding (please wait ~5 seconds)...' 
      });

      // STEP 1: Process ALL images (cover + chapters) to Base64
      // FAIL-SAFE: Any failed images become transparent 1x1 pixels
      // GUEST PREVIEW: If not purchased, only process Chapter 1
      const { processedBookData, base64CoverUrl } = await processBookImages(
        bookData,
        coverImageUrls,
        (message) => {
          setConversionStatus(message);
          toast.loading('Embedding High-Res Images...', { 
            id: 'pdf-progress',
            description: message 
          });
        },
        isPurchased // Pass isPurchased flag to limit content for guests
      );
      
      // DEBUG: Log processed book data
      console.log('[PDF] After processing - Chapter 1 length:', processedBookData.chapter1Content?.length || 0);
      
      if (base64CoverUrl && base64CoverUrl !== TRANSPARENT_PIXEL) {
        console.log('[PDF] Cover image ready for embedding (Base64 length:', base64CoverUrl.length, ')');
      } else {
        console.log('[PDF] No valid cover image, proceeding without');
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

      console.log('[PDF] Calling generateCleanPDF with:');
      console.log('[PDF]   - topic:', topic);
      console.log('[PDF]   - processedBookData.title:', processedBookData.title);
      console.log('[PDF]   - processedBookData.chapter1Content length:', processedBookData.chapter1Content?.length || 0);
      console.log('[PDF]   - coverImageUrl is Base64:', base64CoverUrl?.startsWith('data:') || false);

      // Generate PDF with Base64 cover image and processed book data
      // CRITICAL: Pass null for cover if it's just a transparent pixel
      await generateCleanPDF({
        topic,
        bookData: processedBookData,
        coverImageUrl: base64CoverUrl !== TRANSPARENT_PIXEL ? base64CoverUrl : null,
      });

      toast.success('PDF downloaded!', { 
        id: 'pdf-progress',
        description: 'Your guide has been saved.' 
      });

      console.log('[PDF] === PDF DOWNLOAD COMPLETE ===');

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