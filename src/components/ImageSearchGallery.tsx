import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader2, Check, Image as ImageIcon, AlertTriangle, Crop, Lock, Sparkles, Wand2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageCropper } from '@/components/ImageCropper';

interface ImageResult {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia' | 'pexels' | 'pixabay' | 'openverse' | 'pollinations';
  width?: number;
  height?: number;
  isPrintReady?: boolean;
  license?: string; // License type from API for metadata tracking
  imageType?: 'photo' | 'vector' | 'illustration'; // Type for frontend filtering
}

// Extended metadata passed to handlers for provenance tracking
export interface ImageSelectMetadata {
  source: 'unsplash' | 'pexels' | 'wikimedia' | 'pixabay' | 'openverse' | 'pollinations';
  originalUrl: string;
  license: string;
  attribution: string;
}

interface ImageSearchGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  onSelect: (imageUrl: string, attribution?: string, metadata?: ImageSelectMetadata) => void;
  onSelectBlob?: (blob: Blob, attribution?: string, metadata?: ImageSelectMetadata) => void; // For cropped images
  orientation?: 'landscape' | 'portrait';
  enableCrop?: boolean; // Enable crop feature for 6x9 format
  cropAspectRatio?: number; // Defaults to 6/9 for book pages; use 1 for cover image box
  bookTopic?: string; // Book topic for anchoring searches geographically
  forCover?: boolean; // Filter out restrictive licenses (CC BY-SA) for cover images
  /** Window Shopper Mode: Allow searching but block selection (for guests) */
  windowShopperMode?: boolean;
  /** Callback when guest tries to select in window shopper mode */
  onWindowShopperBlock?: () => void;
}

// Style presets for AI Studio
const STYLE_PRESETS: Record<string, string> = {
  'watercolor': 'watercolor style, white background, artistic',
  'photorealistic': 'highly detailed, 8k, realistic',
  'lineart': 'black and white, vector line art, minimal',
};

// Enhancement suffix for Magic Enhance mode
const ENHANCE_SUFFIX = 'masterfully composed, professional lighting, vivid colors, sharp focus, award-winning photography';

// AI Studio Panel Component - Horizontal Layout
interface AiStudioPanelProps {
  initialPrompt: string;
  onSelectImage: (imageUrl: string) => void;
}

const AiStudioPanel: React.FC<AiStudioPanelProps> = ({ initialPrompt, onSelectImage }) => {
  const [aiPrompt, setAiPrompt] = useState(initialPrompt);
  const [selectedStyle, setSelectedStyle] = useState('photorealistic');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [enhanceMode, setEnhanceMode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imageLoadedRef = useRef(false); // Track loaded state for timeout closure

  // Update prompt when initialPrompt changes
  useEffect(() => {
    setAiPrompt(initialPrompt);
  }, [initialPrompt]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Generate a new image URL with fresh seed
  const generateNewImageUrl = useCallback(() => {
    const seed = Math.floor(Math.random() * 1000000);
    const timestamp = Date.now();
    const styleAppendix = STYLE_PRESETS[selectedStyle] || '';
    const fullPrompt = enhanceMode 
      ? `${aiPrompt.trim()}, ${styleAppendix}, ${ENHANCE_SUFFIX}`
      : `${aiPrompt.trim()}, ${styleAppendix}`;
    const encodedPrompt = encodeURIComponent(fullPrompt);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}&_t=${timestamp}`;
  }, [aiPrompt, selectedStyle, enhanceMode]);

  const handleGenerate = useCallback(() => {
    if (cooldown > 0 || !aiPrompt.trim()) return;

    setIsGenerating(true);
    setImageLoaded(false);
    setLoadError(false);
    imageLoadedRef.current = false; // Reset ref

    // Clear any existing timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Generate and set image URL
    const url = generateNewImageUrl();
    setGeneratedImageUrl(url);

    // Start 20-second timeout with auto-retry logic
    timeoutRef.current = setTimeout(() => {
      if (!imageLoadedRef.current) {
        if (retryCount < 1) {
          // Auto-retry once with new seed
          setRetryCount(prev => prev + 1);
          const newUrl = generateNewImageUrl();
          setGeneratedImageUrl(newUrl);
          // Reset timeout for retry
          timeoutRef.current = setTimeout(() => {
            if (!imageLoadedRef.current) {
              setIsGenerating(false);
              setLoadError(true);
            }
          }, 20000);
        } else {
          // Show friendly error after 1 retry
          setIsGenerating(false);
          setLoadError(true);
        }
      }
    }, 20000);

    // Start 5-second cooldown
    setCooldown(5);
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [aiPrompt, cooldown, generateNewImageUrl, retryCount]);

  const handleImageLoad = useCallback(() => {
    imageLoadedRef.current = true; // Update ref immediately
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsGenerating(false);
    setImageLoaded(true);
    setLoadError(false);
    setRetryCount(0); // Reset retry count on success
  }, []);

  const handleImageError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsGenerating(false);
    setImageLoaded(false);
    setLoadError(true);
  }, []);

  // Manual retry resets counter
  const handleManualRetry = useCallback(() => {
    setRetryCount(0);
    handleGenerate();
  }, [handleGenerate]);

  return (
    <div className="flex gap-4 p-3 h-[400px]">
      {/* Left Side: Controls - Compressed */}
      <div className="w-1/2 space-y-2 overflow-y-auto pr-2">
        {/* Prompt Input - Label as placeholder */}
        <Textarea
          id="ai-prompt"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="Describe your image... (e.g., sunset over Lake Como)"
          className="min-h-[56px] resize-none text-sm"
        />

        {/* Style + Generate - Same row */}
        <div className="flex gap-2">
          <Select value={selectedStyle} onValueChange={setSelectedStyle}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Style..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="watercolor">Watercolor Sketch</SelectItem>
              <SelectItem value="photorealistic">Photorealistic</SelectItem>
              <SelectItem value="lineart">Line Art / Diagram</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleGenerate}
            disabled={!aiPrompt.trim() || cooldown > 0 || isGenerating}
            size="sm"
            className="shrink-0 gap-1"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : cooldown > 0 ? (
              <span className="text-xs">{cooldown}s</span>
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {!isGenerating && cooldown === 0 && <span className="hidden sm:inline">Generate</span>}
          </Button>
        </div>

        {/* Enhance + License - Same row, compact */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch 
              id="enhance-toggle"
              checked={enhanceMode}
              onCheckedChange={setEnhanceMode}
            />
            <Label htmlFor="enhance-toggle" className="text-xs cursor-pointer">Enhance</Label>
          </div>
          <span className="text-[9px] text-muted-foreground">
            Pollinations.ai · Public Domain
          </span>
        </div>
      </div>

      {/* Right Side: Preview */}
      <div className="w-1/2 flex flex-col">
        {loadError ? (
          /* Error State - Friendly message */
          <div className="flex flex-col items-center justify-center h-full p-4 text-center border rounded-lg bg-muted/30">
            <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-sm font-medium mb-1">Almost there!</p>
            <p className="text-xs text-muted-foreground mb-3">
              The image is taking a bit longer than usual.<br />
              Try again or tweak your prompt.
            </p>
            <Button 
              variant="outline" 
              onClick={handleManualRetry}
              disabled={cooldown > 0}
              className="gap-2"
              size="sm"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        ) : generatedImageUrl ? (
          /* Generated Image Preview */
          <div className="flex flex-col h-full border rounded-lg overflow-hidden">
            <div className="relative flex-1 bg-muted flex items-center justify-center min-h-0">
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <img
                src={generatedImageUrl}
                alt="AI Generated"
                className={`max-w-full max-h-full object-contain transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            </div>
            {imageLoaded && (
              <Button
                onClick={() => onSelectImage(generatedImageUrl)}
                className="rounded-t-none gap-2 shrink-0"
                size="sm"
              >
                <Check className="w-4 h-4" />
                Insert into Book
              </Button>
            )}
          </div>
        ) : (
          /* Empty State Placeholder */
          <div className="flex flex-col items-center justify-center h-full border rounded-lg bg-muted/30 text-center p-4">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Your generated image will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const ImageSearchGallery: React.FC<ImageSearchGalleryProps> = ({
  open,
  onOpenChange,
  initialQuery,
  onSelect,
  onSelectBlob,
  orientation = 'landscape',
  enableCrop = false,
  cropAspectRatio = 6 / 9,
  bookTopic,
  forCover = false,
  windowShopperMode = false,
  onWindowShopperBlock,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageResult | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [showCropper, setShowCropper] = useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setImages([]);
      setHasSearched(false);
      setSelectedImage(null);
      setHasConsented(false);
      setShowCropper(false);
    }
  }, [open, initialQuery]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setSelectedImage(null);
    setHasConsented(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('search-book-images', {
        body: { 
          query: query.trim(),
          orientation,
          limit: 150, // More variety (server enforces print-quality + no-faces)
          bookTopic, // Anchor search to book's topic for relevance
          forCover, // Filter restrictive licenses (CC BY-SA) for cover images
          searchAllSources: true, // ALWAYS search all sources in manual gallery for complete tab coverage
        }
      });

      if (error) throw error;

      setImages(data?.images || []);
      setHasSearched(true);
      
      if (!data?.images?.length) {
        toast.info('No images found. Try different keywords.');
      }
    } catch (err) {
      console.error('Image search error:', err);
      toast.error('Failed to search images');
      setImages([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, orientation, forCover, bookTopic]);

  // Helper to get license string for a source
  const getLicenseForSource = (source: ImageResult['source']): string => {
    switch (source) {
      case 'unsplash': return 'Unsplash License';
      case 'pexels': return 'Pexels License';
      case 'pixabay': return 'Pixabay License';
      case 'wikimedia': return 'CC0 Public Domain';
      case 'openverse': return 'CC Commercial License';
      case 'pollinations': return 'Public Domain (Pollinations.ai)';
      default: return 'Unknown License';
    }
  };

  // Helper to get display name for a source
  const getSourceDisplayName = (source: ImageResult['source']): string => {
    switch (source) {
      case 'unsplash': return 'Unsplash';
      case 'pexels': return 'Pexels';
      case 'pixabay': return 'Pixabay';
      case 'wikimedia': return 'Wikimedia Commons';
      case 'openverse': return 'Openverse';
      case 'pollinations': return 'Pollinations.ai';
      default: return source;
    }
  };

  // Create metadata object from selected image
  // Uses API-provided license when available, falls back to source-based license
  const createMetadata = (image: ImageResult): ImageSelectMetadata => ({
    source: image.source,
    originalUrl: image.imageUrl,
    license: image.license || getLicenseForSource(image.source),
    attribution: image.attribution || `Photo from ${getSourceDisplayName(image.source)}`,
  });

  const handleSelect = useCallback(() => {
    if (!selectedImage || !hasConsented) return;
    const metadata = createMetadata(selectedImage);
    onSelect(selectedImage.imageUrl, selectedImage.attribution, metadata);
    onOpenChange(false);
  }, [selectedImage, hasConsented, onSelect, onOpenChange]);

  const handleCropAndSelect = useCallback(() => {
    if (!selectedImage || !hasConsented) return;
    setShowCropper(true);
  }, [selectedImage, hasConsented]);

  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    if (!selectedImage) return;
    
    const metadata = createMetadata(selectedImage);
    
    // Always use onSelectBlob if available (it properly uploads cropped images)
    if (onSelectBlob) {
      await onSelectBlob(croppedBlob, selectedImage.attribution, metadata);
      setShowCropper(false);
      onOpenChange(false);
    } else {
      // Fallback: convert blob to data URL (for backwards compatibility)
      const reader = new FileReader();
      reader.onloadend = () => {
        onSelect(reader.result as string, selectedImage.attribution, metadata);
        setShowCropper(false);
        onOpenChange(false);
      };
      reader.readAsDataURL(croppedBlob);
    }
  }, [selectedImage, onSelectBlob, onSelect, onOpenChange]);

  // Handle AI Studio image selection
  const handleAiImageSelect = useCallback((imageUrl: string) => {
    const aiImage: ImageResult = {
      id: `pollinations-${Date.now()}`,
      imageUrl,
      thumbnailUrl: imageUrl,
      attribution: 'Generated by Pollinations.ai (Flux Model)',
      source: 'pollinations',
      width: 1024,
      height: 1024,
      isPrintReady: true,
      license: 'Public Domain',
    };
    setSelectedImage(aiImage);
    setHasConsented(false); // Require consent for AI images too
  }, []);

  // Group images by PURPOSE (not vendor)
  // Gallery: High-quality stock photos (Unsplash, Pexels, Pixabay photos)
  const galleryImages = images.filter(img => 
    img.source === 'unsplash' || img.source === 'pexels' || 
    (img.source === 'pixabay' && (img as any).imageType !== 'vector')
  );

  // Locations & Landmarks: Specific places, editorial content (Openverse, Wikimedia)
  const locationsImages = images.filter(img => 
    img.source === 'openverse' || img.source === 'wikimedia'
  );

  // Vectors & Icons: Diagrams, symbols (Pixabay vectors - using imageType field from backend)
  const vectorImages = images.filter(img => 
    (img as any).imageType === 'vector'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Search Images
          </DialogTitle>
          <DialogDescription>
            Browse stock photos, location images, vectors, or generate custom AI images.
          </DialogDescription>
        </DialogHeader>

        {/* Search Bar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
              // All other keys (including space) work normally
            }}
            placeholder="Search for images (e.g., London skyline sunset)..."
            className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            autoFocus
          />
          <Button 
            onClick={handleSearch} 
            disabled={!query.trim() || isSearching}
            className="gap-2"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </Button>
        </div>

        {/* Results with Purpose-Based Tabs */}
        <div className="flex-1 min-h-0">
          <Tabs defaultValue="gallery" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4 mb-2">
              <TabsTrigger value="gallery" className="text-xs sm:text-sm">
                Gallery {hasSearched && `(${galleryImages.length})`}
              </TabsTrigger>
              <TabsTrigger value="locations" className="text-xs sm:text-sm">
                Locations {hasSearched && `(${locationsImages.length})`}
              </TabsTrigger>
              <TabsTrigger value="vectors" className="text-xs sm:text-sm">
                Vectors {hasSearched && `(${vectorImages.length})`}
              </TabsTrigger>
              <TabsTrigger value="ai-studio" className="text-xs sm:text-sm gap-1">
                <Sparkles className="w-3 h-3" />
                AI Studio
              </TabsTrigger>
            </TabsList>

            {/* Gallery Tab - Stock Photos */}
            <TabsContent value="gallery" className="flex-1 min-h-0 mt-0">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Searching Unsplash, Pexels, Pixabay...</p>
                </div>
              ) : !hasSearched ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Enter a search term and click Search to find images
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Gallery shows high-quality stock photos for general vibes
                  </p>
                </div>
              ) : galleryImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No stock photos found for "{query}"
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try the AI Studio tab to generate a custom image
                  </p>
                </div>
              ) : (
                <ImageGrid 
                  images={galleryImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              )}
            </TabsContent>

            {/* Locations Tab - Openverse + Wikimedia */}
            <TabsContent value="locations" className="flex-1 min-h-0 mt-0">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Searching Openverse, Wikimedia...</p>
                </div>
              ) : !hasSearched ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Enter a search term and click Search to find images
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Locations shows specific hotels, towns, and editorial content
                  </p>
                </div>
              ) : locationsImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No location images found for "{query}"
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try searching for specific place names or landmarks
                  </p>
                </div>
              ) : (
                <ImageGrid 
                  images={locationsImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              )}
            </TabsContent>

            {/* Vectors Tab - Pixabay vectors */}
            <TabsContent value="vectors" className="flex-1 min-h-0 mt-0">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Searching vectors...</p>
                </div>
              ) : !hasSearched ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Enter a search term and click Search to find images
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Vectors shows diagrams, symbols, and icons
                  </p>
                </div>
              ) : vectorImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No vector images found for "{query}"
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try searching for symbols, icons, or diagrams
                  </p>
                </div>
              ) : (
                <ImageGrid 
                  images={vectorImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              )}
            </TabsContent>

            {/* AI Studio Tab */}
            <TabsContent value="ai-studio" className="flex-1 min-h-0 mt-0">
              <AiStudioPanel 
                initialPrompt={query}
                onSelectImage={handleAiImageSelect}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Window Shopper Mode - Block selection with premium prompt */}
        {selectedImage && windowShopperMode && (
          <div className="pt-4 border-t space-y-4">
            <div className="flex items-center gap-4">
              <img 
                src={selectedImage.thumbnailUrl} 
                alt="Selected" 
                className="w-16 h-12 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  Selected from {getSourceDisplayName(selectedImage.source)}
                </p>
              </div>
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-center">
              <Lock className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-semibold mb-1">Premium Feature</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Unlock to insert this image. Premium users get unlimited photo swaps.
              </p>
              <Button onClick={() => { onWindowShopperBlock?.(); onOpenChange(false); }} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Unlock Now
              </Button>
            </div>
          </div>
        )}

        {/* Selection Preview & Consent - Only for non-window-shopper mode */}
        {selectedImage && !windowShopperMode && (
          <div className="pt-4 border-t space-y-4">
            {/* Preview Row */}
            <div className="flex items-center gap-4">
              <img 
                src={selectedImage.thumbnailUrl} 
                alt="Selected" 
                className="w-16 h-12 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  Selected from {getSourceDisplayName(selectedImage.source)}
                </p>
                {selectedImage.attribution && (
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedImage.attribution}
                  </p>
                )}
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <Checkbox
                id="consent-checkbox"
                checked={hasConsented}
                onCheckedChange={(checked) => setHasConsented(checked === true)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="consent-checkbox" className="text-sm font-medium cursor-pointer">
                  <AlertTriangle className="w-4 h-4 inline-block mr-1 text-amber-600" />
                  I certify I have the rights to use this image.
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedImage.source === 'pollinations' ? (
                    <><strong>AI Generated:</strong> This image is Public Domain. You may use it freely for any purpose.</>
                  ) : (
                    <><strong>Commercial Risk:</strong> Do not use images with recognizable people. Without a signed Model Release, using a stranger's likeness on a product is a legal risk. Loom & Page is not liable for copyright infringement or misuse of selected content.</>
                  )}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              {enableCrop && (
                <Button 
                  variant="outline"
                  onClick={handleCropAndSelect} 
                  disabled={!hasConsented}
                  className="gap-2"
                >
                  <Crop className="w-4 h-4" />
                   {cropAspectRatio === 1 ? 'Crop to Fit' : 'Crop for 6×9'}
                </Button>
              )}
              <Button 
                onClick={handleSelect} 
                disabled={!hasConsented}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Use As-Is
              </Button>
            </div>
          </div>
        )}

        {/* Image Cropper Dialog */}
        {selectedImage && (
          <ImageCropper
            open={showCropper}
            onOpenChange={setShowCropper}
            imageUrl={selectedImage.imageUrl}
            onCropComplete={handleCropComplete}
            aspectRatio={cropAspectRatio}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

// Thumbnail grid component
interface ImageGridProps {
  images: ImageResult[];
  selectedImage: ImageResult | null;
  onSelectImage: (image: ImageResult) => void;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, selectedImage, onSelectImage }) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  const handleImageLoad = useCallback((id: string) => {
    setLoadedImages(prev => new Set(prev).add(id));
  }, []);

  // Get badge color based on source
  const getSourceBadgeClass = (source: ImageResult['source']): string => {
    switch (source) {
      case 'unsplash': return 'bg-foreground/70 text-background';
      case 'pexels': return 'bg-emerald-600 text-white';
      case 'pixabay': return 'bg-teal-600 text-white';
      case 'openverse': return 'bg-orange-600 text-white';
      case 'pollinations': return 'bg-violet-600 text-white';
      default: return 'bg-primary/80 text-primary-foreground';
    }
  };

  // Get display name for source
  const getSourceLabel = (source: ImageResult['source']): string => {
    switch (source) {
      case 'unsplash': return 'Unsplash';
      case 'pexels': return 'Pexels';
      case 'pixabay': return 'Pixabay';
      case 'openverse': return 'Openverse';
      case 'pollinations': return 'AI';
      default: return 'Wikimedia';
    }
  };

  return (
    <ScrollArea className="h-[400px]">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
        {images.map((image) => {
          const isSelected = selectedImage?.id === image.id;
          const isLoaded = loadedImages.has(image.id);
          
          return (
            <button
              key={image.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectImage(image);
              }}
              className={`
                relative rounded-lg overflow-hidden border-2 transition-all
                ${isSelected 
                  ? 'border-primary ring-2 ring-primary/30 scale-[1.02]' 
                  : 'border-transparent hover:border-muted-foreground/30'
                }
              `}
            >
              {/* Loading skeleton */}
              {!isLoaded && (
                <div className="w-full h-32 bg-muted animate-pulse" />
              )}
              
              {/* Full thumbnail - maintain aspect ratio, no cropping */}
              <img
                src={image.thumbnailUrl}
                alt=""
                className={`w-full h-auto max-h-40 object-contain bg-muted transition-opacity ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => handleImageLoad(image.id)}
                loading="lazy"
              />
              
              {/* Print Ready badge - top left for high-res images */}
              {image.isPrintReady && (
                <div className="absolute top-1 left-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-green-600 text-white">
                    Print Ready
                  </span>
                </div>
              )}
              
              {/* Source badge - bottom left */}
              <div className="absolute bottom-1 left-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getSourceBadgeClass(image.source)}`}>
                  {getSourceLabel(image.source)}
                </span>
              </div>
              
              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
};

export default ImageSearchGallery;
