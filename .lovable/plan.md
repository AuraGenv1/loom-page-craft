
# Plan: Multi-Issue Resolution for KDP Compliance & UX

## Summary

This plan addresses seven distinct issues raised from the Lake Como book generation:

1. **Evidence Dossier Missing Openverse** - Section 6 exists but not displaying correctly
2. **Image Manifest Column Overlap** - Caption overlapping Source column
3. **User Upload Tracking in Manifest** - Confirm uploads are properly reflected
4. **Minimum Chapter Flexibility** - Avoid forcing 12 chapters on topics with limited content
5. **Page Count Including Front Matter** - Prep and $$$ tabs should show final print count
6. **Bottom Toolbar Chapter Display** - "Chapter 1 * 1/7" is confusing
7. **AI-Swap Badge Behavior** - Move to top-right, show on hover, better messaging

---

## Issue Analysis

### Issue 1: Evidence Dossier Missing Openverse
**Finding:** The Evidence Dossier PDF generator (`generatePdfBlob()` in KdpLegalDefense.tsx) already includes Openverse at lines 351-371. However, looking at the screenshot, it appears the PDF might be cut off or the section isn't rendering correctly due to Y-coordinate overflow on a single page.

**Root Cause:** The PDF is only 1 page but the content for 6 sections overflows past the printable area. Section 6 (Openverse) starts at approximately Y=8.8" on a letter page (11" tall), so it may render but get cut off at the margin.

**Fix:** Add page break logic or reduce section spacing to ensure all 6 licensing sections fit on the page.

### Issue 2: Image Manifest Caption/Source Overlap
**Finding:** The column widths in the manifest table are:
- `caption: 1.8"` 
- `source: 0.8"`

The issue is that captions longer than ~50 characters still overlap with the source column because jsPDF text doesn't respect column boundaries automatically.

**Fix:** 
1. Reduce caption column width from 1.8" to 1.5"
2. Add 0.1" spacing between columns consistently
3. Increase source column width from 0.8" to 0.9"

### Issue 3: User Upload Tracking
**Confirmation:** The code already handles this correctly:
- `image_source === 'upload'` is set when users upload their own photos
- Line 585-586 in KdpLegalDefense.tsx maps `source === 'upload'` to display as "Upload"
- Line 188 in the RTF Declaration includes "User Uploads: Rights certified by publisher"

**No code changes needed** - just confirmation that it works.

### Issue 4: Minimum Chapter Flexibility
**Current Logic:** All visual topics get `minChapters = 12`, which can force AI to generate filler content.

**Solution:** Implement a "topic depth assessment" that allows the AI to generate fewer chapters for topics with limited scope:
- For narrow topics (e.g., "Courchevel Ski Resort"), allow minimum 8 chapters
- For broad topics (e.g., "Lake Como Travel Guide"), require minimum 12 chapters
- Add a `topicBreadth` heuristic based on query length and specificity

### Issue 5: Page Count Including Front Matter
**Current State:**
- `KdpPrepDashboard.tsx` receives `contentPageCount` and uses `formatDimensions()` which internally calls `calculateFinalPageCount()` that adds 4 front matter pages
- `KdpFinanceCalculator.tsx` receives `pageCount` directly but this should also include front matter

**Finding:** The Prep tab already shows "103 pages" (99 content + 4 front matter) via `formatDimensions()`. The $$$ tab shows "99 Pages" because it receives raw `pageCount` without front matter.

**Fix:** In BookCover.tsx where KdpFinanceCalculator is invoked, pass `calculateFinalPageCount(estimatedPages)` instead of raw `estimatedPages`.

### Issue 6: Bottom Toolbar Chapter Display
**Current:** `Chapter {currentChapter} • {currentIndex + 1}/{blocks.length}`
Shows: "Chapter 1 • 1/7" (meaning page 1 of 7 pages in chapter 1)

**User Request:** "Chapter X out of Y chapters"

**Fix:** Change the display to show chapter progress:
- From: `Chapter 1 • 1/7`
- To: `Chapter {currentChapter} of {totalChapters}`

### Issue 7: AI-Swap Badge Behavior
**Current State:**
- Badge shows "AI · Swap" in top-LEFT corner (lines 606-618)
- Badge is clickable but doesn't clearly communicate the purpose
- Badge doesn't disappear on hover to reveal the full toolbar

**Requested Changes:**
1. Move badge from top-LEFT to top-RIGHT corner
2. Hide badge when hovering to reveal the AuthorImageToolbar
3. Change text from "AI · Swap" to something more informative like "AI-selected · Click to change"
4. Add a tooltip explaining the image was AI-selected and can be changed

---

## Implementation Plan

### Part 1: Fix Evidence Dossier Openverse Section
**File:** `src/components/KdpLegalDefense.tsx`

- Reduce Y spacing between sections from 0.5" to 0.4"
- Add page break check before section 5 to ensure sections 5-6 are visible
- Alternatively, add a second page for the Openverse section if space is tight

### Part 2: Fix Image Manifest Column Overlap
**File:** `src/components/KdpLegalDefense.tsx`

Update column widths (around line 531):
```typescript
const colWidths = { 
  page: 0.4,      // was 0.5
  chapter: 0.4,   // was 0.6
  caption: 1.4,   // was 1.8 - reduced to prevent overlap
  source: 0.9,    // was 0.8 - increased
  license: 1.1,   // was 1.2
  urls: 2.6       // was 2.3 - increased to use saved space
};
```

Add proper text clipping to ensure each column stays within its bounds.

### Part 3: Finance Calculator Page Count Fix
**File:** `src/components/BookCover.tsx`

Where KdpFinanceCalculator is rendered (around line ~1900), change:
```typescript
// From:
pageCount={propEstimatedPageCount || estimatedPages}

// To:
pageCount={calculateFinalPageCount(propEstimatedPageCount || estimatedPages)}
```

Import `calculateFinalPageCount` from `@/lib/kdpUtils`.

### Part 4: Bottom Toolbar Chapter Display
**File:** `src/components/PageViewer.tsx`

Update lines 2467-2469:
```typescript
// From:
<p className="text-xs text-muted-foreground/60 mt-1">
  Chapter {currentChapter} • {currentIndex + 1}/{blocks.length}
</p>

// To:
<p className="text-xs text-muted-foreground/60 mt-1">
  Chapter {currentChapter} of {totalChapters || '?'}
</p>
```

### Part 5: AI-Swap Badge Improvements
**File:** `src/components/PageViewer.tsx`

**5A: Move badge to top-RIGHT and improve messaging**
Update the badge positioning (around line 606-619):
```typescript
{showAiSwapHint && (
  <div
    className="print:hidden absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1.5 bg-background/90 backdrop-blur-sm text-[10px] text-muted-foreground rounded-md border border-border/50 group-hover:opacity-0 transition-opacity pointer-events-none z-20"
    title="This image was auto-selected by AI. Hover to swap it."
  >
    <Sparkles className="w-3 h-3" />
    <span>AI-selected</span>
  </div>
)}
```

**5B: Hide badge on hover to reveal toolbar**
The badge gets `group-hover:opacity-0` so it fades out when the user hovers, revealing the AuthorImageToolbar which is already positioned at `top-2 right-2`.

**5C: Adjust AuthorImageToolbar position**
Since the badge is now in the top-right, move the toolbar to only appear on hover (it already has `opacity-0 group-hover:opacity-100`).

### Part 6: Flexible Minimum Chapters (Topic Depth Assessment)
**File:** `supabase/functions/generate-book-blocks/index.ts`

Add a heuristic to determine topic breadth:
```typescript
// Assess topic breadth for chapter count flexibility
const assessTopicBreadth = (topic: string): 'narrow' | 'broad' => {
  const words = topic.split(/\s+/).length;
  const hasSpecificLocation = /resort|hotel|village|neighborhood/i.test(topic);
  const isNiche = words <= 4 && hasSpecificLocation;
  return isNiche ? 'narrow' : 'broad';
};

const topicBreadth = assessTopicBreadth(topic);
const minChapters = isVisualTopic 
  ? (topicBreadth === 'narrow' ? 8 : 12) 
  : 10;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/KdpLegalDefense.tsx` | 1) Fix Evidence Dossier spacing for Openverse visibility; 2) Fix manifest column widths to prevent overlap |
| `src/components/BookCover.tsx` | Pass front matter-inclusive page count to KdpFinanceCalculator |
| `src/components/PageViewer.tsx` | 1) Update chapter display format; 2) Move AI badge to top-right with improved messaging and hover behavior |
| `supabase/functions/generate-book-blocks/index.ts` | Add topic breadth assessment for flexible minimum chapters |

---

## Visual Changes

### Bottom Toolbar (Before vs After)
```
Before: "Chapter 1 • 1/7"
After:  "Chapter 1 of 12"
```

### AI Badge (Before vs After)
```
Before: [AI · Swap] button in TOP-LEFT, always visible
After:  [AI-selected] badge in TOP-RIGHT, fades on hover to reveal toolbar
```

### Image Manifest Table (Before vs After)
```
Before: Caption bleeds into Source column
After:  Clean column separation with proper padding
```

---

## Technical Notes

### Front Matter Constants (from kdpUtils.ts)
- Title Page: 1 page
- Copyright Page: 1 page  
- Table of Contents: 2 pages
- **Total Front Matter: 4 pages**

### Page Count Calculation
- Content pages (from blocks) + 4 front matter = Final print page count
- Example: 99 blocks + 4 = 103 pages (shown in Prep and $$$ tabs)

### User Upload Detection
- `image_source === 'upload'` indicates user-uploaded photo
- These images show "Upload" in the manifest and skip the AI badge
