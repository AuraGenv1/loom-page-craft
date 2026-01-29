

# Plan: Fix Image Gallery Filtering + AI Studio Improvements

## Summary

This plan addresses 3 categories of issues:
1. **Filter Bug Fixes**: Vectors and Locations tabs showing 0 results due to incorrect frontend filtering
2. **AI Studio Layout**: Convert from vertical to horizontal side-by-side layout
3. **AI Studio Features**: Add freshness guarantee, Magic Enhance toggle, and robust error handling

---

## Issue Analysis

### Issue 1: Vectors Tab Always Shows 0

**Root Cause:** The frontend filter uses `img.imageUrl?.includes('vector')`:
```typescript
const vectorImages = images.filter(img => 
  img.source === 'pixabay' && img.imageUrl?.includes('vector')
);
```

This is wrong because Pixabay vector URLs don't literally contain the word "vector" - the URL looks like `https://cdn.pixabay.com/photo/...` for all image types.

**Solution:** The backend already distinguishes vectors via the `image_type` parameter and marks them with `isPrintReady: true` for vectors. However, we need a better way to identify vectors. Options:
- **Option A:** Add a `imageType` field to the ImageResult from the backend
- **Option B:** Change the filtering to look for Pixabay images with `license === 'Pixabay License'` and check if they came from a vector search

**Best fix:** Modify the backend to include an `imageType` field ('photo' | 'vector' | 'illustration') in the response, then filter by that on the frontend.

### Issue 2: Locations Tab Shows 0 for "Lake Como"

**Root Cause:** The backend IS searching Openverse and Wikimedia (as shown in logs). However:
1. Openverse requires OAuth2 credentials (`OPENVERSE_CLIENT_ID`/`OPENVERSE_CLIENT_SECRET`) - if missing, returns 0
2. Wikimedia has a 1200px minimum width filter that may exclude many results
3. "Lake Como" with 2 capitalized words triggers `isSpecificLocation = true` so Openverse is prioritized

**Solution:** 
1. Add a "search all sources always" approach for the Gallery page (vs. the smart routing which is meant for auto-selection)
2. Alternatively, relax the filter for the Locations tab to also include high-quality Unsplash/Pexels location photos

For now, the best UX fix is to **always search ALL sources** in the manual gallery, then let the frontend filter by purpose. This gives users maximum choice.

### Issue 3: AI Studio Layout Needs Horizontal Layout

**Current:** Vertical stack in 400px ScrollArea - forces scrolling
**Desired:** Side-by-side layout with controls on left, preview on right

---

## Implementation Plan

### Part 1: Fix Vectors Tab - Add imageType Field

**Backend: `supabase/functions/search-book-images/index.ts`**

Add `imageType` field to ImageResult interface and populate it:

```typescript
interface ImageResult {
  // ... existing fields
  imageType?: 'photo' | 'vector' | 'illustration'; // NEW FIELD
}
```

In `searchPixabayMultiple()`, set the imageType based on the `imageType` parameter and actual API response:

```typescript
results.push({
  // ... existing fields
  imageType: isVector ? 'vector' : (imageType === 'illustration' ? 'illustration' : 'photo'),
});
```

**Frontend: `src/components/ImageSearchGallery.tsx`**

Update the filter logic:

```typescript
// Vectors & Icons: Pixabay vectors
const vectorImages = images.filter(img => 
  (img as any).imageType === 'vector' || 
  (img.source === 'pixabay' && img.license?.toLowerCase().includes('vector'))
);
```

### Part 2: Fix Locations Tab - Search All Sources

**Backend:** Modify the search logic to ALWAYS include Openverse + Wikimedia in the search, regardless of search mode. This ensures the Locations tab always has potential results.

Currently the backend routes based on `searchMode` (abstract/realistic/mixed) and `isSpecificLocation`. For the manual gallery, we should always search all sources.

**Quick Fix (Frontend Only):** For now, expand what counts as "Locations":
- Include any Unsplash/Pexels images with location-related keywords in attribution
- This is a fallback when Openverse/Wikimedia return nothing

**Proper Fix (Backend):** Add a `searchAllSources: true` parameter when called from the manual gallery to ensure all 5 sources are always searched.

### Part 3: AI Studio Horizontal Layout

Convert the AiStudioPanel from vertical ScrollArea to a horizontal flexbox layout:

```tsx
<div className="flex gap-6 p-4 h-[400px]">
  {/* Left Side: Controls */}
  <div className="w-1/2 space-y-4 overflow-y-auto">
    {/* Header */}
    <div className="text-center space-y-1">
      <Sparkles className="w-6 h-6 mx-auto text-primary" />
      <h3 className="font-semibold text-sm">AI Studio</h3>
      <p className="text-xs text-muted-foreground">
        Generate custom images when stock photos fail
      </p>
    </div>
    
    {/* Prompt Input */}
    {/* Style Selector */}
    {/* Enhance Toggle */}
    {/* Generate Button */}
    {/* Licensing Note */}
  </div>
  
  {/* Right Side: Preview */}
  <div className="w-1/2 flex flex-col">
    {generatedImageUrl ? (
      /* Generated image preview with Insert button */
    ) : (
      /* Empty state placeholder */
    )}
  </div>
</div>
```

### Part 4: Freshness Guarantee (No Duplicates)

Add seed + timestamp to every Pollinations request:

```typescript
const handleGenerate = useCallback(() => {
  // Generate unique seed for freshness
  const seed = Math.floor(Math.random() * 1000000);
  const timestamp = Date.now();
  
  const fullPrompt = enhanceMode 
    ? `${aiPrompt.trim()}, ${STYLE_PRESETS[selectedStyle]}, masterfully composed, professional lighting, vivid colors`
    : `${aiPrompt.trim()}, ${STYLE_PRESETS[selectedStyle]}`;
  
  const encodedPrompt = encodeURIComponent(fullPrompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}&_t=${timestamp}`;
  
  setGeneratedImageUrl(url);
  // ...
}, [aiPrompt, selectedStyle, enhanceMode]);
```

### Part 5: Magic Enhance Toggle

Add a toggle switch next to the Generate button:

```typescript
const [enhanceMode, setEnhanceMode] = useState(false);
```

```tsx
{/* Enhance Toggle */}
<div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
  <div className="flex items-center gap-2">
    <Sparkles className="w-4 h-4 text-primary" />
    <Label htmlFor="enhance-toggle" className="text-sm font-medium cursor-pointer">
      Enhance Prompt
    </Label>
  </div>
  <Switch 
    id="enhance-toggle"
    checked={enhanceMode}
    onCheckedChange={setEnhanceMode}
  />
</div>
```

When enabled, automatically append enhancement keywords:
```typescript
const enhancementSuffix = "masterfully composed, professional lighting, vivid colors, sharp focus";
```

### Part 6: Robust Error Handling (15-Second Timeout)

Add timeout logic with retry option:

```typescript
const [loadError, setLoadError] = useState(false);
const timeoutRef = useRef<NodeJS.Timeout | null>(null);

const handleGenerate = useCallback(() => {
  setIsGenerating(true);
  setImageLoaded(false);
  setLoadError(false);
  
  // Start 15-second timeout
  if (timeoutRef.current) clearTimeout(timeoutRef.current);
  timeoutRef.current = setTimeout(() => {
    if (!imageLoaded) {
      setIsGenerating(false);
      setLoadError(true);
    }
  }, 15000);
  
  // ... generate URL
}, []);

const handleImageLoad = useCallback(() => {
  if (timeoutRef.current) clearTimeout(timeoutRef.current);
  setIsGenerating(false);
  setImageLoaded(true);
  setLoadError(false);
}, []);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };
}, []);
```

Display retry option when timeout occurs:
```tsx
{loadError && (
  <div className="flex flex-col items-center justify-center h-full p-4 text-center">
    <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
    <p className="text-sm text-muted-foreground mb-3">
      Server busy. Please click Retry.
    </p>
    <Button 
      variant="outline" 
      onClick={handleGenerate}
      disabled={cooldown > 0}
      className="gap-2"
    >
      <RefreshCw className="w-4 h-4" />
      Retry
    </Button>
  </div>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ImageSearchGallery.tsx` | 1) Fix vector/location filtering logic; 2) Redesign AI Studio to horizontal layout; 3) Add freshness seed+timestamp; 4) Add Enhance toggle; 5) Add 15-second timeout with retry |
| `supabase/functions/search-book-images/index.ts` | Add `imageType` field to ImageResult for proper vector detection |

---

## Visual Changes

### AI Studio Layout (Before vs After)

**Before (Vertical - Requires Scrolling):**
```
+----------------------------------+
|         ✨ AI Studio             |
|   Generate custom images...      |
|                                  |
| Describe your image:             |
| [________________________]       |
|                                  |
| Style:                           |
| [▾ Photorealistic      ]         |
|                                  |
| [   🪄 Generate Image   ]        |
|                                  |
| +------------------------------+ |
| |                              | |
| |    [Generated Image]         | |
| |    (BELOW THE FOLD)          | |
| +------------------------------+ |
| [    ✓ Insert into Book       ]  |
+----------------------------------+
```

**After (Horizontal - No Scrolling):**
```
+------------------------------------------------------------------+
| LEFT SIDE (Controls)        |  RIGHT SIDE (Preview)              |
+-----------------------------+------------------------------------+
| ✨ AI Studio                |                                    |
| Generate when stock fails   |  +------------------------------+  |
|                             |  |                              |  |
| Describe your image:        |  |    [Generated Image]         |  |
| [____________________]      |  |                              |  |
|                             |  +------------------------------+  |
| Style:                      |  [    ✓ Insert into Book       ]   |
| [▾ Photorealistic     ]     |                                    |
|                             |                                    |
| [⚡ Enhance Prompt]    [ON] |                                    |
|                             |                                    |
| [   🪄 Generate Image   ]   |                                    |
|                             |                                    |
| Public Domain - free use    |                                    |
+-----------------------------+------------------------------------+
```

---

## Technical Notes

### Pollinations URL Parameters
- `seed={random}` - Forces unique generation each time
- `_t={timestamp}` - Cache-busting parameter
- `nologo=true` - Removes watermark
- `model=flux` - Uses Flux model (best quality)

### Client-Side Image Loading
The image is loaded directly via `<img src={pollinationsUrl}>` which means:
- Each user's browser makes the request from their own IP
- No backend routing = no IP bans on our server
- Already compliant with the scalability requirement

### Enhance Mode Keywords
When "Enhance Prompt" is enabled, append:
```
masterfully composed, professional lighting, vivid colors, sharp focus, award-winning photography
```

