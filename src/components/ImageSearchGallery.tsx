import React, { useState, useCallback } from 'react';
import { Search, Loader2, Check, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImageResult {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia';
}

interface ImageSearchGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  onSelect: (imageUrl: string, attribution?: string) => void;
  orientation?: 'landscape' | 'portrait';
}

export const ImageSearchGallery: React.FC<ImageSearchGalleryProps> = ({
  open,
  onOpenChange,
  initialQuery,
  onSelect,
  orientation = 'landscape',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageResult | null>(null);
  const [hasConsented, setHasConsented] = useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setImages([]);
      setHasSearched(false);
      setSelectedImage(null);
      setHasConsented(false);
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
          limit: 30,
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
  }, [query, orientation]);

  const handleSelect = useCallback(() => {
    if (!selectedImage || !hasConsented) return;
    onSelect(selectedImage.imageUrl, selectedImage.attribution);
    onOpenChange(false);
  }, [selectedImage, hasConsented, onSelect, onOpenChange]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  // Group images by source
  const unsplashImages = images.filter(img => img.source === 'unsplash');
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
            Search Unsplash and Wikimedia for the perfect image. Click to select, then confirm.
          </DialogDescription>
        </DialogHeader>

        {/* Search Bar */}
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search for images..."
            className="flex-1"
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
              <TabsList className="grid w-full grid-cols-3 mb-2">
                <TabsTrigger value="all">All ({images.length})</TabsTrigger>
                <TabsTrigger value="unsplash">Unsplash ({unsplashImages.length})</TabsTrigger>
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
                  Selected from {selectedImage.source === 'unsplash' ? 'Unsplash' : 'Wikimedia'}
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
                  Loom & Page is not liable for copyright infringement or misuse of selected content.
                </p>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex justify-end">
              <Button 
                onClick={handleSelect} 
                disabled={!hasConsented}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Use This Image
              </Button>
            </div>
          </div>
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
    <ScrollArea className="h-[350px]">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
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
                relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all
                ${isSelected 
                  ? 'border-primary ring-2 ring-primary/30 scale-[1.02]' 
                  : 'border-transparent hover:border-muted-foreground/30'
                }
              `}
            >
              {/* Loading skeleton */}
              {!isLoaded && (
                <div className="absolute inset-0 bg-muted animate-pulse" />
              )}
              
              <img
                src={image.thumbnailUrl}
                alt=""
                className={`w-full h-full object-cover transition-opacity ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => handleImageLoad(image.id)}
                loading="lazy"
              />
              
              {/* Source badge */}
              <div className="absolute bottom-1 left-1">
                <span className={`
                  text-[9px] px-1.5 py-0.5 rounded-full font-medium
                  ${image.source === 'unsplash' 
                    ? 'bg-black/60 text-white' 
                    : 'bg-blue-600/80 text-white'
                  }
                `}>
                  {image.source === 'unsplash' ? 'U' : 'W'}
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
