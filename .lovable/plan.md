

# Plan: Gallery Grid - Unsplash Compliance with Safe Click Areas & Download Tracking

## Summary

Update the `ImageGrid` component in `ImageSearchGallery.tsx` to comply with Unsplash API guidelines:
1. Display attribution footer on hover (bottom 20% of card)
2. Separate click zones: Footer opens photographer profile, Image area selects for book
3. Trigger Unsplash `download_location` endpoint when user actually selects an image

## Architecture

```
+------------------------------------------+
|                                          |
|        Image Area (~80%)                 |
|        Click = Select for Book           |
|        + Trigger download_location       |
|                                          |
+------------------------------------------+
|  [Photo by Jane Doe / Unsplash  ↗]       |  <-- Footer (~20%)
|  Click = Open profile (stopPropagation)  |
+------------------------------------------+
```

---

## Part 1: Update Backend - Add `download_location` to Unsplash Results

### File: `supabase/functions/search-book-images/index.ts`

**Changes to ImageResult interface (line 13-24):**
```typescript
interface ImageResult {
  imageUrl: string;
  thumbnailUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia' | 'pexels' | 'pixabay' | 'openverse';
  id: string;
  width: number;
  height: number;
  isPrintReady: boolean;
  license?: string;
  imageType?: 'photo' | 'vector' | 'illustration';
  // NEW: Unsplash compliance
  downloadLocation?: string;  // Unsplash download tracking URL
  photographerUrl?: string;   // Photographer profile URL for attribution link
}
```

**Changes to searchUnsplashMultiple function (around lines 244-253):**
```typescript
results.push({
  id: `unsplash-${photo.id}`,
  imageUrl: imageUrl || photo.urls?.regular,
  thumbnailUrl: photo.urls?.small || photo.urls?.thumb,
  attribution: `Photo by ${photographerName} on Unsplash`,
  source: 'unsplash' as const,
  width,
  height,
  isPrintReady: width >= PRINT_READY_WIDTH,
  // NEW: Unsplash compliance fields
  downloadLocation: photo.links?.download_location,  // For tracking
  photographerUrl: photo.user?.links?.html,          // For attribution click
});
```

---

## Part 2: Update Frontend Interface

### File: `src/components/ImageSearchGallery.tsx`

**Update ImageResult interface (lines 18-29):**
```typescript
interface ImageResult {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  attribution?: string;
  source: 'unsplash' | 'wikimedia' | 'pexels' | 'pixabay' | 'openverse' | 'pollinations' | 'huggingface';
  width?: number;
  height?: number;
  isPrintReady?: boolean;
  license?: string;
  imageType?: 'photo' | 'vector' | 'illustration';
  // NEW: Unsplash compliance
  downloadLocation?: string;
  photographerUrl?: string;
}
```

---

## Part 3: Create Download Tracking Utility

### File: `src/lib/unsplashTracking.ts` (NEW)

```typescript
/**
 * Trigger Unsplash download tracking
 * Per Unsplash API guidelines, this must be called when a user
 * actually uses/downloads an image (not just views it)
 */
export async function triggerUnsplashDownload(downloadLocation: string): Promise<void> {
  if (!downloadLocation) return;
  
  try {
    // Fire-and-forget background request
    // The download_location URL already includes the client_id
    await fetch(downloadLocation, {
      method: 'GET',
      mode: 'no-cors', // Unsplash doesn't require response handling
    });
    console.log('[Unsplash] Download tracked:', downloadLocation.substring(0, 60) + '...');
  } catch (error) {
    // Non-blocking - don't fail the user action if tracking fails
    console.warn('[Unsplash] Download tracking failed:', error);
  }
}
```

---

## Part 4: Update ImageGrid Component with Hover Attribution Footer

### File: `src/components/ImageSearchGallery.tsx`

**Redesign ImageGrid (lines 860-964):**

The new card structure:
1. Outer container with `group` class for hover detection
2. Main image area (clickable for selection)
3. Hover-reveal attribution footer with separate click handler

```typescript
const ImageGrid: React.FC<ImageGridProps> = ({ images, selectedImage, onSelectImage }) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  const handleImageLoad = useCallback((id: string) => {
    setLoadedImages(prev => new Set(prev).add(id));
  }, []);

  // Get badge color based on source
  const getSourceBadgeClass = (source: ImageResult['source']): string => {
    // ... existing logic
  };

  // Extract photographer name from attribution string
  const extractPhotographerName = (attribution?: string): string => {
    if (!attribution) return 'Unknown';
    // "Photo by Jane Doe on Unsplash" -> "Jane Doe"
    const match = attribution.match(/Photo by (.+?) on/i);
    return match ? match[1] : attribution;
  };

  // Handle attribution footer click (open photographer profile)
  const handleFooterClick = useCallback((e: React.MouseEvent, image: ImageResult) => {
    e.stopPropagation(); // CRITICAL: Prevent image selection
    
    if (image.photographerUrl) {
      window.open(image.photographerUrl, '_blank', 'noopener,noreferrer');
    } else if (image.source === 'unsplash') {
      // Fallback: open Unsplash homepage
      window.open('https://unsplash.com', '_blank', 'noopener,noreferrer');
    }
  }, []);

  return (
    <ScrollArea className="h-[400px]">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
        {images.map((image) => {
          const isSelected = selectedImage?.id === image.id;
          const isLoaded = loadedImages.has(image.id);
          const isUnsplash = image.source === 'unsplash';
          
          return (
            <div
              key={image.id}
              className={`
                group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer
                ${isSelected 
                  ? 'border-primary ring-2 ring-primary/30 scale-[1.02]' 
                  : 'border-transparent hover:border-muted-foreground/30'
                }
              `}
            >
              {/* Main Image Area - Click to Select */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectImage(image);
                }}
                className="w-full block"
              >
                {/* Loading skeleton */}
                {!isLoaded && (
                  <div className="w-full h-32 bg-muted animate-pulse" />
                )}
                
                {/* Thumbnail */}
                <img
                  src={image.thumbnailUrl}
                  alt=""
                  className={`w-full h-auto max-h-40 object-contain bg-muted transition-opacity ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => handleImageLoad(image.id)}
                  loading="lazy"
                />
              </button>
              
              {/* Print Ready badge - top left */}
              {image.isPrintReady && (
                <div className="absolute top-1 left-1 pointer-events-none">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-green-600 text-white">
                    Print Ready
                  </span>
                </div>
              )}
              
              {/* Source badge - bottom left (visible when not hovering) */}
              <div className="absolute bottom-1 left-1 transition-opacity duration-200 group-hover:opacity-0 pointer-events-none">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getSourceBadgeClass(image.source)}`}>
                  {getSourceLabel(image.source)}
                </span>
              </div>
              
              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center pointer-events-none">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              
              {/* Hover Attribution Footer - Only for Unsplash */}
              {isUnsplash && (
                <button
                  onClick={(e) => handleFooterClick(e, image)}
                  className="
                    absolute bottom-0 left-0 right-0
                    bg-black/70 backdrop-blur-sm
                    px-2 py-1.5
                    flex items-center justify-between gap-1
                    translate-y-full group-hover:translate-y-0
                    transition-transform duration-200 ease-out
                  "
                >
                  <span className="text-[10px] text-white/90 truncate">
                    Photo by {extractPhotographerName(image.attribution)} / Unsplash
                  </span>
                  <ExternalLink className="w-3 h-3 text-white/70 shrink-0" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};
```

---

## Part 5: Trigger Download on Image Selection

When user selects an image (not when hovering, only when they click to add it to the book), trigger the download endpoint.

### Update `onSelectImage` handler in ImageSearchGallery

The download trigger should happen when the image is actually used (when user clicks "Use As-Is" or "Crop for 6x9"). Update `handleSelect` and `handleCropAndSelect`:

```typescript
// At top of ImageSearchGallery component
import { triggerUnsplashDownload } from '@/lib/unsplashTracking';

// Update handleSelect (around line 495)
const handleSelect = useCallback(() => {
  if (!selectedImage || !hasConsented) return;
  
  // CRITICAL: Trigger Unsplash download tracking when image is actually used
  if (selectedImage.source === 'unsplash' && selectedImage.downloadLocation) {
    triggerUnsplashDownload(selectedImage.downloadLocation);
  }
  
  const metadata = createMetadata(selectedImage);
  onSelect(selectedImage.imageUrl, selectedImage.attribution, metadata);
  onOpenChange(false);
}, [selectedImage, hasConsented, onSelect, onOpenChange]);

// Update handleCropAndSelect similarly (around line 502)
const handleCropAndSelect = useCallback(() => {
  if (!selectedImage || !hasConsented) return;
  
  // CRITICAL: Trigger Unsplash download tracking when image is actually used
  if (selectedImage.source === 'unsplash' && selectedImage.downloadLocation) {
    triggerUnsplashDownload(selectedImage.downloadLocation);
  }
  
  setShowCropper(true);
}, [selectedImage, hasConsented]);
```

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `supabase/functions/search-book-images/index.ts` | MODIFY | Add `downloadLocation` and `photographerUrl` to Unsplash results |
| `src/lib/unsplashTracking.ts` | CREATE | Utility to trigger Unsplash download endpoint |
| `src/components/ImageSearchGallery.tsx` | MODIFY | 1) Update ImageResult interface; 2) Redesign ImageGrid with hover footer; 3) Add download trigger on select |

---

## Visual Behavior Summary

### Default State (No Hover)
```
+-----------------------------+
|                             |
|      [Thumbnail Image]      |
|                             |
|  [Unsplash]                 |  <-- Source badge visible
+-----------------------------+
```

### Hover State
```
+-----------------------------+
|                             |
|      [Thumbnail Image]      |  <-- Click this = Select
|                             |
+-----------------------------+
| Photo by Jane / Unsplash ↗  |  <-- Click this = Open profile
+-----------------------------+
```

### Click Behaviors
1. **Click on image area (top ~80%)** → Select image for book + trigger `download_location`
2. **Click on footer strip** → Open photographer profile in new tab (no selection, no download trigger)

---

## Technical Notes

### Unsplash API Compliance
- Per [Unsplash guidelines](https://help.unsplash.com/en/articles/2511258-guideline-triggering-a-download), the `download_location` endpoint must be triggered when a user actually downloads/uses an image
- This is a GET request to a URL like: `https://api.unsplash.com/photos/:id/download?ixid=...`
- The tracking request is fire-and-forget; failure should not block user action

### Event Propagation
- The footer uses `e.stopPropagation()` to prevent the click from bubbling to the parent image selection handler
- This ensures clicking the attribution link does NOT select the image

### External Link Icon
- Import `ExternalLink` from lucide-react for the ↗ indicator

