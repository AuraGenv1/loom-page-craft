

# Reduce Unsplash Pages from 4 to 2

## Overview

Reduce Unsplash API requests from 4 to 2 pages to stay within the free tier rate limit (50 requests/hour).

---

## The Problem

Unsplash free tier allows **50 requests per hour**. With 4 pages per search, you can only do ~12 searches before hitting the limit.

---

## Changes to `supabase/functions/search-book-images/index.ts`

### 1. Update the Promise.all calls (lines 608-623)

**Before:**
```typescript
const [
  unsplashPage1, unsplashPage2, unsplashPage3, unsplashPage4,
  pexelsPage1, pexelsPage2,
  ...
] = await Promise.all([
  searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
  searchUnsplashMultiple(anchoredQuery, orientation, 30, 2),
  searchUnsplashMultiple(anchoredQuery, orientation, 30, 3),
  searchUnsplashMultiple(anchoredQuery, orientation, 30, 4),
  ...
]);
```

**After:**
```typescript
const [
  unsplashPage1, unsplashPage2,
  pexelsPage1, pexelsPage2,
  ...
] = await Promise.all([
  searchUnsplashMultiple(anchoredQuery, orientation, 30, 1),
  searchUnsplashMultiple(anchoredQuery, orientation, 30, 2),
  // Removed pages 3 & 4 to stay within rate limits
  ...
]);
```

### 2. Update the results combination (line 626)

**Before:**
```typescript
const unsplashResults = [...unsplashPage1, ...unsplashPage2, ...unsplashPage3, ...unsplashPage4];
```

**After:**
```typescript
const unsplashResults = [...unsplashPage1, ...unsplashPage2];
```

### 3. Update the comment (lines 603-607)

Change `4 pages of 30 = 120` to `2 pages of 30 = 60`

---

## Updated Totals

| Source | Before | After |
|--------|--------|-------|
| **Unsplash** | 120 (4×30) | 60 (2×30) |
| **Pexels** | 160 (2×80) | 160 (2×80) |
| **Pixabay** | 200 (1×200) | 200 (1×200) |
| **Wikimedia** | 100 (2×50) | 100 (2×50) |
| **TOTAL** | ~580 max | ~520 max |

---

## Benefit

- Cuts Unsplash API usage in half (from 4 to 2 requests per search)
- Allows ~25 searches per hour instead of ~12
- Still provides 520+ images per search (plenty of variety)

