

# Add Photographer Credit to Unsplash Images

## The Problem

Unsplash images aren't showing photographer credit because the code never captures it from the API response.

**Current behavior:**
- Pexels: "Photo by John Smith on Pexels" ✓
- Pixabay: "Photo by Jane Doe on Pixabay" ✓
- Wikimedia: "Author Name / CC BY-SA" ✓
- Unsplash: "Photo from Unsplash" ✗ (generic fallback)

## Root Cause

In `supabase/functions/search-book-images/index.ts`, the `searchUnsplashMultiple` function (lines 102-110) doesn't include an `attribution` field:

```typescript
results.push({
  id: `unsplash-${photo.id}`,
  imageUrl: imageUrl,
  thumbnailUrl: photo.urls?.small,
  source: 'unsplash',
  // Missing: attribution!
  width,
  height,
  isPrintReady: width >= PRINT_READY_WIDTH,
});
```

The Unsplash API returns `photo.user.name` (photographer) but we never use it.

---

## The Fix

Update `searchUnsplashMultiple` to capture photographer attribution:

**Before:**
```typescript
results.push({
  id: `unsplash-${photo.id}`,
  imageUrl: imageUrl || photo.urls?.regular,
  thumbnailUrl: photo.urls?.small || photo.urls?.thumb,
  source: 'unsplash' as const,
  width,
  height,
  isPrintReady: width >= PRINT_READY_WIDTH,
});
```

**After:**
```typescript
// Capture photographer name for attribution
const photographerName = photo.user?.name || photo.user?.username || 'Unknown';
const attribution = `Photo by ${photographerName} on Unsplash`;

results.push({
  id: `unsplash-${photo.id}`,
  imageUrl: imageUrl || photo.urls?.regular,
  thumbnailUrl: photo.urls?.small || photo.urls?.thumb,
  attribution,
  source: 'unsplash' as const,
  width,
  height,
  isPrintReady: width >= PRINT_READY_WIDTH,
});
```

---

## File to Modify

| File | Change |
|------|--------|
| `supabase/functions/search-book-images/index.ts` | Add attribution field to Unsplash results |

---

## Expected Result

After this fix, Unsplash images will display proper credit like:
- "Photo by **John Smith** on Unsplash"

This matches the format used by Pexels and Pixabay, ensuring consistent attribution across all sources.

