import React, { useState, useCallback } from 'react';
import { Search, Loader2, Check, Image as ImageIcon, AlertTriangle, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageCropper } from '@/components/ImageCropper';

interface ImageResult {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia' | 'pexels' | 'pixabay';
  width?: number;
  height?: number;
  isPrintReady?: boolean;
  license?: string; // License type for metadata tracking
}

// Extended metadata passed to handlers for provenance tracking
export interface ImageSelectMetadata {
  source: 'unsplash' | 'pexels' | 'wikimedia' | 'pixabay';
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
}

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
  }, [query, orientation, forCover]);

  // Helper to get license string for a source
  const getLicenseForSource = (source: 'unsplash' | 'pexels' | 'wikimedia' | 'pixabay'): string => {
    switch (source) {
      case 'unsplash': return 'Unsplash License';
      case 'pexels': return 'Pexels License';
      case 'pixabay': return 'Pixabay License';
      case 'wikimedia': return 'CC0 Public Domain';
      default: return 'Unknown License';
    }
  };

  // Helper to get display name for a source
  const getSourceDisplayName = (source: 'unsplash' | 'pexels' | 'wikimedia' | 'pixabay'): string => {
    switch (source) {
      case 'unsplash': return 'Unsplash';
      case 'pexels': return 'Pexels';
      case 'pixabay': return 'Pixabay';
      case 'wikimedia': return 'Wikimedia Commons';
      default: return source;
    }
  };

  // Create metadata object from selected image
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

  // handleKeyDown moved inline to avoid any issues with event handling

  // Group images by source
  const unsplashImages = images.filter(img => img.source === 'unsplash');
  const pexelsImages = images.filter(img => img.source === 'pexels');
  const pixabayImages = images.filter(img => img.source === 'pixabay');
  const wikimediaImages = images.filter(img => img.source === 'wikimedia');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Search Images
          </DialogTitle>
          <DialogDescription>
            Search Unsplash, Pexels, and Wikimedia for the perfect image. Click to select, then confirm.
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

        {/* Results */}
        <div className="flex-1 min-h-0">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Searching...</p>
            </div>
          ) : !hasSearched ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Enter a search term and click Search to find images
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Tip: Be specific! "London skyline sunset" works better than "city"
              </p>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No images found for "{query}"
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try different keywords or a broader search term
              </p>
            </div>
          ) : (
            <Tabs defaultValue="all" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-5 mb-2">
                <TabsTrigger value="all">All ({images.length})</TabsTrigger>
                <TabsTrigger value="unsplash">Unsplash ({unsplashImages.length})</TabsTrigger>
                <TabsTrigger value="pexels">Pexels ({pexelsImages.length})</TabsTrigger>
                <TabsTrigger value="pixabay">Pixabay ({pixabayImages.length})</TabsTrigger>
                <TabsTrigger value="wikimedia">Wikimedia ({wikimediaImages.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="flex-1 min-h-0 mt-0">
                <ImageGrid 
                  images={images} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              </TabsContent>
              
              <TabsContent value="unsplash" className="flex-1 min-h-0 mt-0">
                <ImageGrid 
                  images={unsplashImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              </TabsContent>

              <TabsContent value="pexels" className="flex-1 min-h-0 mt-0">
                <ImageGrid 
                  images={pexelsImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              </TabsContent>

              <TabsContent value="pixabay" className="flex-1 min-h-0 mt-0">
                <ImageGrid 
                  images={pixabayImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              </TabsContent>
              
              <TabsContent value="wikimedia" className="flex-1 min-h-0 mt-0">
                <ImageGrid 
                  images={wikimediaImages} 
                  selectedImage={selectedImage}
                  onSelectImage={setSelectedImage}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Selection Preview & Consent */}
        {selectedImage && (
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
                  <strong>Commercial Risk:</strong> Do not use images with recognizable people. Without a signed Model Release, using a stranger's likeness on a product is a legal risk. Loom & Page is not liable for copyright infringement or misuse of selected content.
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
                <span className={`
                  text-[10px] px-1.5 py-0.5 rounded-full font-medium
                  ${image.source === 'unsplash' 
                    ? 'bg-foreground/70 text-background' 
                    : image.source === 'pexels'
                    ? 'bg-emerald-600 text-white'
                    : image.source === 'pixabay'
                    ? 'bg-teal-600 text-white'
                    : 'bg-primary/80 text-primary-foreground'
                  }
                `}>
                  {image.source === 'unsplash' ? 'Unsplash' : image.source === 'pexels' ? 'Pexels' : image.source === 'pixabay' ? 'Pixabay' : 'Wikimedia'}
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
