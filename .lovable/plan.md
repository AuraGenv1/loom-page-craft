
# Plan: Complete Openverse Integration in Auto-Fetch Function

## Summary

The Openverse integration for the **Image Search Gallery** is complete and working. However, the **automatic image fetching** function (`fetch-book-images`) that runs during book generation does NOT include Openverse. This means images auto-populated into chapters won't benefit from Openverse's superior coverage of specific locations.

---

## Gap Analysis

| Feature | Search Gallery | Auto-Fetch |
|---------|---------------|------------|
| Openverse OAuth2 Token | Implemented | Missing |
| Openverse Search | Implemented | Missing |
| Smart Router (Priority 1 for locations) | Implemented | Missing |
| Attribution Extraction | Implemented | N/A |
| Source Type in Response | Includes `openverse` | Only 4 sources |

---

## Implementation

### 1. Add Openverse OAuth2 Token Handler to `fetch-book-images`

Copy the token management logic from `search-book-images`:
- In-memory token cache
- Token refresh with 60-second buffer
- Secure client credentials flow

### 2. Add Openverse Search Function to `fetch-book-images`

Add a `searchOpenverse()` function that:
- Uses authenticated API with access token
- Filters for `license_type=commercial,modification`
- Enforces minimum 1600px width for KDP quality
- Maps attribution correctly

### 3. Update ImageResult Type

Add `openverse` to the source union:
```typescript
source: 'unsplash' | 'pexels' | 'pixabay' | 'wikimedia' | 'openverse' | 'none';
```

### 4. Update Smart Router in `fetch-book-images`

Modify the waterfall priority:

```text
For LANDMARKS (hotels, museums, etc.):
1. Wikimedia (strict 1800px+)
2. Openverse (1600px+, commercial license)   <- NEW
3. Unsplash
4. Pixabay
5. Pexels

For GENERIC queries:
1. Unsplash
2. Pixabay
3. Pexels
4. Openverse                                  <- NEW
5. Wikimedia
```

### 5. Update License Helper

Add Openverse to the `getLicenseForSource()` function:
```typescript
case 'openverse': return 'CC Commercial License';
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/fetch-book-images/index.ts` | Add Openverse OAuth2, search function, update waterfall router, update ImageResult type |

---

## No Changes Needed

These components are already complete:
- `search-book-images/index.ts` - Full Openverse support
- `ImageSearchGallery.tsx` - Openverse tab and source handling
- `KdpLegalDefense.tsx` - Openverse in legal documents
- `archive-image/index.ts` - Openverse source type
- `bookImages.ts` - Openverse in ImageMetadata type
