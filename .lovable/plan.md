

# Increase Image Search Results

## Overview

Increase the maximum images fetched from each source to provide more variety and reduce the chance of duplicates across books.

---

## Current vs. Proposed Limits

| Source | Current Total | Proposed Total | Change |
|--------|---------------|----------------|--------|
| **Unsplash** | 90 (3×30) | 120 (4×30) | +30 |
| **Pexels** | 80 (2×40) | 160 (2×80) | +80 |
| **Pixabay** | 80 (2×40) | 200 (1×200) | +120 |
| **Wikimedia** | 50 (1×50) | 100 (2×50) | +50 |
| **TOTAL** | ~300 max | ~580 max | +280 |

---

## Implementation Details

### Update `supabase/functions/search-book-images/index.ts`

**1. Unsplash** - Add a 4th page:
```typescript
// Change from 3 pages to 4 pages
searchUnsplashMultiple(anchoredQuery, orientation, 30, 4)
```

**2. Pexels** - Increase per_page from 40 to 80:
```typescript
// Pexels allows 80 per request
searchPexelsMultiple(anchoredQuery, orientation, 80, 1)
searchPexelsMultiple(anchoredQuery, orientation, 80, 2)
```

**3. Pixabay** - Single request at 200:
```typescript
// Pixabay allows 200 per request - use it!
searchPixabayMultiple(anchoredQuery, orientation, 200, 1)
// Remove the second page (no longer needed)
```

**4. Wikimedia** - Add a second page:
```typescript
searchWikimediaMultiple(anchoredQuery, 50, forCover)  // Page 1
searchWikimediaMultiple(anchoredQuery + " scenic", 50, forCover)  // Variant query
```

---

## Updated Default Limit

Increase the default `limit` parameter from 150 to 300 to display more results in the gallery:

```typescript
const { query, orientation = 'landscape', limit = 300, bookTopic, forCover = false } = await req.json();
```

---

## Performance Considerations

- All API calls are made in parallel (`Promise.all`), so additional pages add minimal latency
- Each source has generous rate limits for free tiers
- Filtering still applies (1200px minimum width), so actual results will be fewer than raw fetched

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/search-book-images/index.ts` | Update page counts and per_page values |

---

## Summary

This change nearly doubles the available image pool (from ~300 to ~580 pre-filtered), which significantly reduces the chance of duplicate images being selected across chapters and books.

