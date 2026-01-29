

# Combined Plan: KDP Studio for Guests + Updated Marketing Copy

## Overview

This plan combines two pending changes:
1. **KDP Studio visibility for guests** - Show the button for guests (rename it) with locked tabs inside
2. **Marketing copy updates** - Update "10-chapter" wording in PaywallOverlay and PageViewer

---

## Part 1: KDP Studio Button Visibility & Renaming

### Problem
Currently, the KDP Studio button only appears when `isGenerationComplete === true`, but guests only ever get Chapter 1 (generation is gated by `isPaid`). So guests never see the button.

### Solution

#### Change 1A: Update `isGenerationComplete` in Index.tsx

**File:** `src/pages/Index.tsx`  
**Lines:** 357-366

Update the memo to return `true` for guests once Chapter 1 is loaded:

```tsx
// Calculate if ALL chapters are complete (dynamic)
const isGenerationComplete = useMemo(() => {
  if (!totalChapters || totalChapters === 0) return false;
  
  // For guests (unpaid users), Chapter 1 completion is enough to show the Studio
  if (!hasFullAccess && chapterBlocks[1]?.length > 0) {
    return true;
  }
  
  // For paid users, require all chapters
  for (let i = 1; i <= totalChapters; i++) {
    if (!chapterBlocks[i] || chapterBlocks[i].length === 0) return false;
  }
  return true;
}, [totalChapters, chapterBlocks, hasFullAccess]);
```

#### Change 1B: Rename Button Text in BookCover.tsx

**File:** `src/components/BookCover.tsx`  
**Line:** 1909

| Before | After |
|--------|-------|
| `{hasFullAccess ? 'Edit Cover / Export KDP' : 'View Export Options'}` | `{hasFullAccess ? 'Cover Studio' : 'Preview Studio'}` |

---

## Part 2: Update Marketing Copy (Remove "10-chapter")

### Location 1: PaywallOverlay.tsx

**File:** `src/components/PaywallOverlay.tsx`

#### Change 2A: Update Features List (Lines 14-19)

| Before | After |
|--------|-------|
| `'10 comprehensive chapters'` | `'All chapters unlocked'` |
| `'Step-by-step instructions'` | `'Step-by-step instructions'` (keep) |
| `'Expert tips & techniques'` | `'Kindle & paperback formats'` |
| `'Downloadable PDF version'` | `'Downloadable PDF & eBook'` |

```tsx
const features = [
  'All chapters unlocked',
  'Step-by-step instructions',
  'Kindle & paperback formats',
  'Downloadable PDF & eBook',
];
```

#### Change 2B: Update Headline (Lines 81-82)

| Before | After |
|--------|-------|
| `The rest of your 10-chapter guide is ready.` | `Your complete guide is ready.` |

---

### Location 2: PageViewer.tsx

**File:** `src/components/PageViewer.tsx`

#### Change 2C: Update End of Preview Card (Lines 2223-2224)

| Before | After |
|--------|-------|
| `You've reached the end of the free preview. Unlock the full book to access all {totalChapters} chapters, the Editing Suite, and KDP Export Tools.` | `You've enjoyed Chapter 1 — there's so much more waiting for you. Unlock to access all {totalChapters} chapters, the Cover Studio, and downloadable PDF & eBook formats.` |

Note: Uses "Cover Studio" to match the new button naming.

---

## Summary of All Changes

| File | Location | Change |
|------|----------|--------|
| `src/pages/Index.tsx` | Lines 357-366 | Update `isGenerationComplete` to return `true` for guests with Chapter 1 |
| `src/components/BookCover.tsx` | Line 1909 | Rename button to "Cover Studio" / "Preview Studio" |
| `src/components/PaywallOverlay.tsx` | Lines 14-19 | Update features list (remove "10 chapters", "Expert tips") |
| `src/components/PaywallOverlay.tsx` | Lines 81-82 | Change headline to "Your complete guide is ready." |
| `src/components/PageViewer.tsx` | Lines 2223-2224 | Update End of Preview description |

---

## Visual Results

### PaywallOverlay (After):
```text
[Book icon]

Your complete guide is ready.

Unlock the complete guide and master this topic with our comprehensive curriculum.

✓ All chapters unlocked        ✓ Step-by-step instructions
✓ Kindle & paperback formats   ✓ Downloadable PDF & eBook

[One-time purchase: $4.99]

Instant access • No subscription required
```

### End of Preview Card (After):
```text
End of Preview
You've enjoyed Chapter 1 — there's so much more waiting for you. 
Unlock to access all 12 chapters, the Cover Studio, and downloadable PDF & eBook formats.
```

### KDP Studio Button (After):
- **Guests see:** "Preview Studio" (appears after Chapter 1 loads)
- **Paid users see:** "Cover Studio" (appears after all chapters complete)

