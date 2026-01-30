

# Plan: Four-Part Fix - Advanced Options UI, Focus Area Tooltips, AI Studio History, and Navigation Bug

## Summary

This plan addresses four distinct issues:

1. **Advanced Options Panel**: Fix spelling/grammar and remove the Network icon
2. **Focus Areas Tooltips**: Add descriptive hover text for each Focus Area chip (like Voice and Structure have)
3. **AI Studio**: Add session history (last 5 images), cooldown button, and "Confirm" workflow
4. **PageViewer Navigation Bug**: Fix the Prev button and TOC chapter clicks not working properly

---

## Issue 1: Advanced Options Panel Fixes

### Current Problems (Screenshot 1)
- Shows "advancedOptions" instead of "Advanced Options"
- Shows "NARRATIVEVOICE" instead of "Narrative Voice"
- Shows "BOOKSTRUCTURE" instead of "Book Structure"  
- Shows "FOCUSAREAS" instead of "Focus Areas"
- Has a Network icon that should be removed

### File: `src/components/AdvancedOptions.tsx`

### Changes

**1. Remove Network icon** - Delete from line 2 import and line 69 usage

**2. Fix section label fallbacks:**
- Line 79: `{t('narrativeVoice') || 'Voice'}` → change fallback to `'Narrative Voice'`
- Line 107: `{t('bookStructure') || 'Structure'}` → change fallback to `'Book Structure'`
- Line 135: fallback already says `'Focus Areas'` - correct

### Multi-Select Recommendation

**Voice and Structure should remain single-select** because:
- **Narrative Voice**: A book needs one consistent voice. Mixing "The Bestie" with "The Professor" would create jarring tonal inconsistency.
- **Book Structure**: A book follows one structural approach. You can't simultaneously be a "Curated Guide" AND a "Playbook" - they're mutually exclusive.
- **Focus Areas**: Already supports multi-select correctly - a book CAN cover multiple topics.

---

## Issue 2: Add Tooltips to Focus Areas

### Current State
The `FOCUS_OPTIONS` array (lines 32-40) only has `id` and `label`:
```typescript
const FOCUS_OPTIONS = [
  { id: 'history', label: 'History' },
  { id: 'wellness', label: 'Wellness' },
  // ... etc
] as const;
```

### Changes

**Update `FOCUS_OPTIONS` to include descriptive tooltips:**

```typescript
const FOCUS_OPTIONS = [
  { id: 'history', label: 'History', tooltip: 'Ancient stories, heritage sites, and cultural timelines' },
  { id: 'wellness', label: 'Wellness', tooltip: 'Spas, retreats, meditation, and self-care rituals' },
  { id: 'nightlife', label: 'Nightlife', tooltip: 'Bars, clubs, live music, and after-dark scenes' },
  { id: 'art', label: 'Art & Design', tooltip: 'Galleries, architecture, studios, and creative spaces' },
  { id: 'luxury', label: 'Luxury', tooltip: 'High-end experiences, exclusive venues, and premium services' },
  { id: 'culture', label: 'Local Culture', tooltip: 'Traditions, local customs, food markets, and community life' },
  { id: 'nature', label: 'Nature', tooltip: 'Parks, hiking trails, beaches, and outdoor adventures' },
] as const;
```

**Wrap Focus Area chips with Tooltip components** (like Voice and Structure):

```typescript
{/* Focus Areas Section - Updated with Tooltips */}
<div className="space-y-2">
  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
    {t('focusAreas') || 'Focus Areas'}
  </p>
  <div className="flex flex-wrap justify-center gap-2">
    {FOCUS_OPTIONS.map((focus) => (
      <Tooltip key={focus.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleFocusToggle(focus.id)}
            className={cn(
              chipBaseClass,
              options.focusAreas.includes(focus.id) ? chipActiveClass : chipInactiveClass
            )}
          >
            {focus.label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          <p className="text-xs">{focus.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    ))}
  </div>
</div>
```

---

## Issue 3: AI Studio - Session History, Cooldown, and Confirm Workflow

### Current Problems (Screenshot 2)
- New generations instantly replace old ones with no way to go back
- No rate-limit protection (users can spam the Generate button)
- No explicit "Confirm" action before inserting into book

### File: `src/components/ImageSearchGallery.tsx` (AiStudioPanel component)

### Feature 3.1: Session History (Mini-Gallery)

**New State Variables:**
```typescript
const [generatedHistory, setGeneratedHistory] = useState<string[]>([]); // Last 5 images
const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number>(0); // Currently selected
```

**Logic:**
- When a new image is generated, prepend it to `generatedHistory` (max 5)
- Display the selected image as the main preview
- Show thumbnail row below the main image
- Clicking a thumbnail promotes it to main view (no API call)

**UI Layout:**
```text
+------------------------------------------+
|                                          |
|        Main Preview Image                |
|                                          |
+------------------------------------------+
|  [thumb1] [thumb2] [thumb3] [thumb4] [5] |  <- Clickable history
+------------------------------------------+
|        [Use This Image]                  |
+------------------------------------------+
```

### Feature 3.2: Cooldown Button (Anti-Spam)

**New State:**
```typescript
const [cooldownRemaining, setCooldownRemaining] = useState<number>(0); // Seconds remaining
```

**Logic:**
- After clicking "Generate", start a 10-second cooldown timer
- Button shows countdown: "Wait 9s...", "Wait 8s...", etc.
- Button stays disabled until cooldown completes (even if image loads faster)
- Use `setInterval` to decrement every second

**Button States:**
- Normal: `[Generate]` (enabled)
- Generating: `[Generating...]` (disabled, spinning)
- Cooldown: `[Wait 7s...]` (disabled, countdown text)

### Feature 3.3: "Use This Image" Workflow

- Rename "Insert into Book" to "Use This Image" for clarity
- Only visible when user has selected an image from history
- Clicking confirms and calls `onSelectImage(selectedImageUrl)`

---

## Issue 4: PageViewer Navigation Bug - Critical Fix

### Current Problems (Screenshot 3)
- Clicking "< Prev" button shows loading spinner indefinitely
- Cannot navigate backward from chapter 5 to chapter 1
- TOC chapter clicks don't work properly
- Screen shows spinning wheel and "Loading page..." forever

### File: `src/components/PageViewer.tsx`

### Root Cause

**Problem 1**: The `initialChapter` sync effect reacts to TOC clicks but doesn't reset `currentIndex` or trigger a block fetch for the new chapter.

**Problem 2**: `fetchBlocks` skips fetching if the chapter is already hydrated, but the blocks remain from the old chapter.

**Problem 3**: `goToPrevChapter` doesn't trigger a fresh block fetch if the chapter was previously visited.

### Solution

**Fix 1: Update the `initialChapter` sync effect:**

```typescript
useEffect(() => {
  if (initialChapter !== currentChapter) {
    setCurrentChapter(initialChapter);
    setCurrentIndex(0); // Reset to first page of new chapter
    setLoading(true); // Show loading state
    
    // Force fetch blocks for the new chapter
    fetchBlocks(initialChapter);
  }
}, [initialChapter]);
```

**Fix 2: Improve `goToPrevChapter`:**

```typescript
const goToPrevChapter = useCallback(() => {
  if (currentChapter > 1) {
    const prevChapter = currentChapter - 1;
    setCurrentChapter(prevChapter);
    setLoading(true);
    
    const prevChapterBlocks = preloadedBlocks?.[prevChapter];
    if (prevChapterBlocks && prevChapterBlocks.length > 0) {
      setCurrentIndex(prevChapterBlocks.length - 1);
      setBlocks(prevChapterBlocks);
      setLoading(false);
    } else {
      setCurrentIndex(0);
    }
    
    fetchBlocks(prevChapter);
    onChapterChange?.(prevChapter);
  }
}, [currentChapter, preloadedBlocks, onChapterChange, fetchBlocks]);
```

**Fix 3: Make `fetchBlocks` always set blocks for navigation:**

Ensure that when navigating TO a chapter, we always set the blocks correctly even if already hydrated - the key is to always call `setBlocks(preloaded)` when we have preloaded data, regardless of hydration status.

---

## Files Summary

| File | Action | Changes |
|------|--------|---------|
| `src/components/AdvancedOptions.tsx` | MODIFY | Remove Network icon, fix label fallbacks, add tooltips to Focus Areas |
| `src/components/ImageSearchGallery.tsx` | MODIFY | Add session history, cooldown button, confirm workflow |
| `src/components/PageViewer.tsx` | MODIFY | Fix chapter navigation bug in sync effect and goToPrevChapter |

---

## Visual Changes

### Advanced Options (After Fix)
```text
[  v Advanced Options ]   <- No Network icon, proper capitalization

       Narrative Voice    <- Proper spacing and case
[The Insider] [The Bestie] [The Poet] [The Professor]
     ^hover: "Curated, cool, 'If you know, you know'"

       Book Structure     <- Proper spacing and case
[Curated Guide] [Playbook] [Balanced]

       Focus Areas        <- Proper spacing and case
[History] [Wellness] [Nightlife] [Art & Design]
   ^hover: "Ancient stories, heritage sites, and cultural timelines"
```

### AI Studio (After Fix)
```text
+----------------------------------+----------------------------------+
|  [Prompt input...]               |                                  |
|  [Style v] [Generate] [Wait 7s]  |     [Main Preview Image]         |
|  [x] Magic Enhance               |                                  |
|                                  +----------------------------------+
|                                  | [t1] [t2] [t3] [t4] [t5]  History|
|                                  +----------------------------------+
|                                  |     [Use This Image]             |
+----------------------------------+----------------------------------+
```

### PageViewer Navigation (After Fix)
- "< Prev" button works correctly to go back pages AND chapters
- TOC chapter clicks immediately load the selected chapter
- No more infinite loading spinner

