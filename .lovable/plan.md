
# Plan: Four-Part Fix - Advanced Options Labels, Search Tabs, Navigation, and Image Margins

## Summary

This plan addresses four distinct issues identified from the screenshots:

1. **Advanced Options Panel**: Fix remaining label formatting issues (add spaces between words)
2. **Vectors & Locations Tabs**: Debug and fix the search function to return results
3. **Back Navigation**: Ensure "Prev" button always goes back by exactly one page, never by chapter
4. **Image Attribution Margins**: Move attribution text higher to maintain KDP margin compliance

---

## Issue 1: Advanced Options Label Fixes

### Current Problems (Screenshot 1)
The labels are still showing without proper formatting:
- "advancedOptions" → should be "Advanced Options"
- "NARRATIVEVOICE" → should be "NARRATIVE VOICE"
- "BOOKSTRUCTURE" → should be "BOOK STRUCTURE"
- "FOCUSAREAS" → should be "FOCUS AREAS"

Additionally, the Focus Area tooltips overlap with the "Try:" text below.

### Root Cause
The issue is in `LanguageContext.tsx` - the translation keys don't exist, so `t('advancedOptions')` returns the key itself, which then gets displayed directly. The fallback strings are being used, but the uppercase labels for section headers are also coming from translation keys that don't exist.

Looking at the code more carefully:
- Line 69: `{t('advancedOptions') || 'Advanced Options'}` - `t()` returns the key if not found
- Line 78: `{t('narrativeVoice') || 'Narrative Voice'}` - same issue
- Line 106: `{t('bookStructure') || 'Book Structure'}` - same issue
- Line 134: `{t('focusAreas') || 'Focus Areas'}` - same issue

The `t()` function in `LanguageContext.tsx` line 386-388:
```typescript
const t = useCallback((key: string): string => {
  return translations[language][key] || translations.en[key] || key;
}, [language]);
```

Since these keys don't exist in the translations object, it returns the key itself, which is truthy, so the fallback never triggers.

### Files to Modify
- `src/contexts/LanguageContext.tsx` - Add the missing translation keys
- `src/pages/Index.tsx` - Add spacing between Advanced Options and "Try:" text

### Solution

**Add translation keys to all 8 languages in `LanguageContext.tsx`:**

Add these keys to each language's translations object:
```typescript
advancedOptions: 'Advanced Options',
narrativeVoice: 'NARRATIVE VOICE',
bookStructure: 'BOOK STRUCTURE',
focusAreas: 'FOCUS AREAS',
```

**Add spacing in Index.tsx (line 835):**

Change the `mt-8` margin to `mt-12` or add `pt-4` to prevent tooltip overlap:
```typescript
<p className="text-sm text-muted-foreground mt-12 animate-fade-up animation-delay-300">
```

---

## Issue 2: Vectors & Locations Tabs Returning 0 Results

### Current Problems (Screenshot 2)
- Gallery tab shows 150 results for "Tokyo"
- Locations tab shows 0 results
- Vectors tab shows 0 results

### Root Cause Analysis

Looking at the frontend filtering logic in `ImageSearchGallery.tsx` (lines 639-652):

```typescript
// Gallery: High-quality stock photos (Unsplash, Pexels, Pixabay photos)
const galleryImages = images.filter(img => 
  img.source === 'unsplash' || img.source === 'pexels' || 
  (img.source === 'pixabay' && (img as any).imageType !== 'vector')
);

// Locations & Landmarks: Specific places (Openverse, Wikimedia)
const locationsImages = images.filter(img => 
  img.source === 'openverse' || img.source === 'wikimedia'
);

// Vectors & Icons: Diagrams, symbols (Pixabay vectors)
const vectorImages = images.filter(img => 
  (img as any).imageType === 'vector'
);
```

The problem is that the backend doesn't call Openverse/Wikimedia or Pixabay vectors when `searchAllSources` is false and the query is detected as "realistic" mode.

Looking at the backend logic (line 933-973), for a "realistic" query like "Tokyo":
- If it's a "specific location", it calls Openverse and Wikimedia
- If not, it prioritizes Unsplash/Pexels and only includes "some Openverse"

**The real issue**: The frontend calls the search API but the smart routing may not include all sources. The `searchAllSources` parameter exists but might not be passed from the frontend.

Looking at the frontend search call, I need to verify if `searchAllSources: true` is being passed when the user is in the gallery modal.

### Solution

**Frontend (`ImageSearchGallery.tsx`)**: Ensure the search call includes `searchAllSources: true` to force all source searches for the manual gallery.

**Backend verification**: The backend already has logic for `searchAllSources = true` (line 978-999) that searches all sources including vectors and Openverse/Wikimedia. We need to ensure this is being passed correctly.

The issue is likely in the frontend's `handleSearch` function - need to pass `searchAllSources: true` in the request body.

---

## Issue 3: "Back" Button Goes by Chapter Instead of Page

### Current Problems (Screenshot 3)
The "Prev" button in the book viewer sometimes navigates back by an entire chapter instead of a single page.

### Root Cause Analysis

Looking at the `goPrev` function in `PageViewer.tsx` (lines 2154-2162):

```typescript
const goPrev = useCallback(() => {
  if (currentIndex > 0) {
    setCurrentIndex(prev => prev - 1);  // Go back ONE page
  } else if (currentChapter > 1) {
    goToPrevChapter();  // Problem: jumps to previous chapter
  }
}, [currentIndex, currentChapter, goToPrevChapter, onPageChange]);
```

The issue: When `currentIndex === 0` (first page of chapter), clicking Prev calls `goToPrevChapter()` instead of staying on the current page or providing proper feedback.

However, this is intentional behavior - when you're on the first page of Chapter 5, pressing "Prev" should take you to the last page of Chapter 4.

**The actual bug** is that `goToPrevChapter()` (lines 2132-2152) has issues:
1. It calls `setLoading(true)` which shows the loading spinner
2. If `prevChapterBlocks` exists, it tries to set blocks and index
3. But then it ALWAYS calls `fetchBlocks(prevChapter)` which may reset state

The problem is race conditions between setting state and triggering async operations.

### Solution

The `goToPrevChapter` function should be synchronous if we have preloaded blocks, and should NOT call `fetchBlocks` if blocks are already available:

```typescript
const goToPrevChapter = useCallback(() => {
  if (currentChapter > 1) {
    const prevChapter = currentChapter - 1;
    const prevChapterBlocks = preloadedBlocks?.[prevChapter];
    
    setCurrentChapter(prevChapter);
    
    if (prevChapterBlocks && prevChapterBlocks.length > 0) {
      // Have preloaded blocks - use them immediately, NO fetch
      setBlocks(prevChapterBlocks);
      setCurrentIndex(prevChapterBlocks.length - 1);
      setLoading(false);
    } else {
      // Need to fetch - show loading
      setLoading(true);
      setCurrentIndex(0);
      fetchBlocks(prevChapter);
    }
    
    onChapterChange?.(prevChapter);
  }
}, [currentChapter, preloadedBlocks, onChapterChange, fetchBlocks]);
```

---

## Issue 4: Image Attribution Too Low (KDP Margin Violation)

### Current Problems (Screenshot 3)
The uploaded photo shows attribution text "Photo by Daiji Sashida via Unsplash" very close to the bottom of the page, which could cause issues with KDP page numbering.

### Root Cause Analysis

Looking at `ImageFullPage` component (lines 560-641), the attribution is positioned:
```typescript
{attribution && (
  <p className="text-[8px] text-muted-foreground/40 text-center mt-1">
    {attribution}
  </p>
)}
```

This is inside a flex container with:
- `py-8 px-6` padding on the main content area
- `max-h-[65vh]` on the image

The issue is that on tall images, the caption + attribution extend very close to the bottom.

### Solution

**Option 1**: Move attribution ABOVE the image (as part of a header area) instead of below the caption
**Option 2**: Reduce image max-height to leave more bottom margin
**Option 3**: Add explicit bottom padding/margin to ensure KDP compliance

For KDP 6x9 books, the minimum bottom margin should be 0.375" (0.5" preferred). The current layout doesn't guarantee this.

**Recommended approach**: 
1. Cap the image container height more conservatively
2. Add a minimum bottom margin to the page container
3. Consider moving attribution to a less prominent position (e.g., below caption on same line, or at the top of the image)

### Implementation

Update `ImageFullPage` to:
1. Reduce `max-h-[65vh]` to `max-h-[55vh]` for more bottom space
2. Add `mb-8` to the outer container to ensure minimum margin
3. Keep attribution compact by combining with caption line

---

## Files Summary

| File | Action | Changes |
|------|--------|---------|
| `src/contexts/LanguageContext.tsx` | MODIFY | Add `advancedOptions`, `narrativeVoice`, `bookStructure`, `focusAreas` translation keys to all 8 languages |
| `src/pages/Index.tsx` | MODIFY | Increase margin between Advanced Options and "Try:" text |
| `src/components/ImageSearchGallery.tsx` | MODIFY | Pass `searchAllSources: true` to the search API call |
| `src/components/PageViewer.tsx` | MODIFY | Fix `goToPrevChapter` to not trigger unnecessary fetch, fix image layout margins |

---

## Visual Changes After Fixes

### Advanced Options (After Fix)
```text
[  v Advanced Options ]   <- Proper spacing

       NARRATIVE VOICE    <- All caps with space
[The Insider] [The Bestie] [The Poet] [The Professor]

       BOOK STRUCTURE     <- All caps with space
[Curated Guide] [Playbook] [Balanced]

       FOCUS AREAS        <- All caps with space
[History] [Wellness] [Nightlife] [Art & Design]


                          <- Extra spacing before "Try:"
Try: "Sourdough bread baking" or "Watercolor painting basics"
```

### Search Gallery (After Fix)
- Gallery tab: 150 results (unchanged)
- Locations tab: 50+ results from Openverse and Wikimedia
- Vectors tab: 100+ results from Pixabay vectors

### Page Navigation (After Fix)
- Prev button always goes back exactly one page
- At first page of Chapter 5 → goes to last page of Chapter 4 smoothly
- No infinite loading spinners

### Image Layout (After Fix)
- Images constrained to `max-h-[55vh]` instead of `65vh`
- Attribution text positioned with adequate margin from page bottom
- Complies with Amazon KDP 0.375" minimum margin requirement

---

## Technical Details

### Translation Key Updates

All 8 languages need these keys added:

**English (en):**
```typescript
advancedOptions: 'Advanced Options',
narrativeVoice: 'NARRATIVE VOICE',
bookStructure: 'BOOK STRUCTURE',
focusAreas: 'FOCUS AREAS',
```

**Spanish (es):**
```typescript
advancedOptions: 'Opciones Avanzadas',
narrativeVoice: 'VOZ NARRATIVA',
bookStructure: 'ESTRUCTURA DEL LIBRO',
focusAreas: 'ÁREAS DE ENFOQUE',
```

**French (fr):**
```typescript
advancedOptions: 'Options Avancées',
narrativeVoice: 'VOIX NARRATIVE',
bookStructure: 'STRUCTURE DU LIVRE',
focusAreas: 'DOMAINES DE FOCUS',
```

**German (de):**
```typescript
advancedOptions: 'Erweiterte Optionen',
narrativeVoice: 'ERZÄHLSTIMME',
bookStructure: 'BUCHSTRUKTUR',
focusAreas: 'SCHWERPUNKTE',
```

**Italian (it):**
```typescript
advancedOptions: 'Opzioni Avanzate',
narrativeVoice: 'VOCE NARRATIVA',
bookStructure: 'STRUTTURA DEL LIBRO',
focusAreas: 'AREE DI FOCUS',
```

**Portuguese (pt):**
```typescript
advancedOptions: 'Opções Avançadas',
narrativeVoice: 'VOZ NARRATIVA',
bookStructure: 'ESTRUTURA DO LIVRO',
focusAreas: 'ÁREAS DE FOCO',
```

**Chinese (zh):**
```typescript
advancedOptions: '高级选项',
narrativeVoice: '叙事风格',
bookStructure: '书籍结构',
focusAreas: '关注领域',
```

**Japanese (ja):**
```typescript
advancedOptions: '詳細オプション',
narrativeVoice: 'ナラティブボイス',
bookStructure: 'ブック構造',
focusAreas: 'フォーカスエリア',
```

### Search API Fix

In `ImageSearchGallery.tsx`, update the search invocation to include `searchAllSources: true`:

```typescript
const { data, error } = await supabase.functions.invoke('search-book-images', {
  body: {
    query: searchQuery,
    orientation,
    limit: 300,
    bookTopic,
    forCover,
    searchAllSources: true,  // CRITICAL: Force all sources for manual gallery
  },
});
```
