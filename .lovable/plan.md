
# Plan: KDP Print Compliance, Image Attribution, and Book Length Fixes

## Summary

This plan addresses four critical issues identified in the Lake Como travel guide:

1. **Content overflow** - Text blocks are too long for 6x9 pages
2. **Incorrect "AI-selected image" disclaimer** - Shows on user-uploaded photos when it shouldn't
3. **Disclaimer placement** - Should be an overlay on the image itself, not below it (getting cut off)
4. **Insufficient book length** - Only 84 pages/9 chapters instead of 100+ pages minimum

---

## Issue Analysis

### Issue 1: Text Content Overflow
- **Root cause**: AI prompts in `generate-book-blocks` target 300-320 words, but `generate-chapter-blocks` targets 220-250 words - inconsistent and both can produce overflow
- **Evidence**: Database shows text blocks with 1,454+ characters (~250+ words), exceeding safe limits
- **Fix**: Standardize to 200-230 words maximum with strict enforcement

### Issue 2: "AI-selected image" Showing on Personal Photos
- **Root cause**: The `ImageFullPage` component doesn't receive or check `image_source` - it always shows the disclaimer when `canEditImages` is true
- **Evidence**: The block renderer passes `block.image_url` but NOT `block.image_source` to ImageFullPage
- **Fix**: Pass `imageSource` prop and only show disclaimer when `image_source !== 'upload'`

### Issue 3: Disclaimer Getting Cut Off at Bottom
- **Root cause**: Disclaimer is rendered below the caption outside the main image container
- **Fix**: Move disclaimer to be an overlay ON the image itself (top-right corner), hidden during print

### Issue 4: Insufficient Book Length (84 pages, 9 chapters)
- **Root cause**: `LUXURY_MIN_CHAPTERS = 10` but only 9 content chapters generated; `targetPagesPerChapter` varies
- **Evidence**: Query shows 84 pages across the Lake Como book
- **Fix**: Enforce minimum 12 chapters for travel topics, increase target pages per chapter to 12

---

## Implementation

### Part 1: Fix Image Disclaimer Logic

**File: `src/lib/pageBlockTypes.ts`**
- Add `image_source?: string` to the `BaseBlock` interface so it's available on all block types

**File: `src/components/PageViewer.tsx`**

1. Update `ImageFullPage` component interface:
   - Add `imageSource?: string` prop
   - Add logic to only show "AI-selected" hint when `imageSource !== 'upload'`
   
2. Move the disclaimer to be an **overlay on the image** (positioned absolute, top-right corner):
   - Semi-transparent background for visibility
   - Only visible when: `canEditImages === true` AND `imageSource !== 'upload'`
   - Hidden during print (existing `print:hidden` class)

3. Update `BlockRenderer` to pass `image_source` from the block:
   ```typescript
   imageSource={(block as any).image_source}
   ```

4. Same changes for `ImageHalfPage` component

---

### Part 2: Fix Text Content Length Constraints

**File: `supabase/functions/generate-book-blocks/index.ts`**
- Change word target from "300-320 words" to **"200-230 words MAXIMUM"**
- Add explicit warning: "Pages that overflow ruin the print layout"
- Match the stricter constraints in `generate-chapter-blocks`

**File: `supabase/functions/generate-chapter-blocks/index.ts`**
- Tighten from "220-250 words MAX" to **"200-230 words MAX"**
- Emphasize the MAXIMUM constraint more aggressively in the prompt
- Add: "Count your words before outputting. NEVER exceed 230 words."

---

### Part 3: Fix Book Length (Minimum Chapters and Pages)

**File: `supabase/functions/generate-book-blocks/index.ts`**
- Increase `minChapters` from 10 to **12** for travel/visual topics
- Increase `targetTotalPages` from 120 to **140** to hit 100+ content pages after front matter
- Increase `pagesPerChapter` for visual topics from 14 to **12** (more consistent)
- Increase `pagesPerChapter` for informational topics from 10 to **10** (keep same)

**File: `src/lib/pageBlockTypes.ts`**
- Update `LUXURY_MIN_CHAPTERS` from 10 to **12**
- Update `LUXURY_TARGET_PAGES` from 120 to **140**

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/pageBlockTypes.ts` | Add `image_source` to BaseBlock; update chapter/page constants |
| `src/components/PageViewer.tsx` | Add imageSource prop to ImageFullPage/ImageHalfPage; move disclaimer to overlay; conditional logic for upload vs AI |
| `supabase/functions/generate-book-blocks/index.ts` | Reduce word limit to 200-230; increase minChapters to 12; increase targetTotalPages to 140 |
| `supabase/functions/generate-chapter-blocks/index.ts` | Reduce word limit to 200-230; add word count enforcement |

---

## Visual Changes

### Before (Current):
```
+----------------------------------+
|          [Image]                 |
|                                  |
+----------------------------------+
| Caption text here...             |
| AI-selected image — click to swap| <- BELOW image, gets cut off
| Photo by X via Unsplash          |
+----------------------------------+
```

### After (Fixed):
```
+----------------------------------+
|          [Image]   [AI🔄 SWAP]   | <- Overlay badge on image
|                                  |
+----------------------------------+
| Caption text here...             |
| Photo by X via Unsplash          |
+----------------------------------+
```

For user-uploaded images, the overlay badge will NOT appear at all.

---

## Technical Notes

### Word Count Safety
- 200-230 words at 11pt font with 1.6 line-height fits safely in the 6x9 page margins
- This matches Amazon KDP's recommended density for non-fiction

### Image Source Detection
- `image_source === 'upload'` indicates user-uploaded photo
- `image_source === 'unsplash' | 'pexels' | 'wikimedia' | 'openverse'` indicates AI-fetched
- `image_source === null/undefined` indicates legacy or not-yet-fetched (show disclaimer)

### Book Length Calculation
- 12 chapters × 10 pages = 120 content pages
- 4 front matter pages (Title, Copyright, 2× TOC)
- Total: 124 pages minimum (above KDP spine threshold)
