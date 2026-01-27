
# Image Manifest with Permanent Archive System

## Overview

This plan implements a bulletproof image tracking and archiving system that:
1. **Permanently archives** all images to your Supabase storage (eliminating "link rot")
2. **Tracks metadata** for every image (source, license, original URL, attribution)
3. **Generates a legal manifest** (03_Image_Manifest.pdf) with embedded thumbnails

This ensures KDP defense remains valid even if original images are removed from Unsplash/Pexels/Wikimedia years later.

---

## Phase 1: Database Schema Update

Add new metadata columns to the `book_pages` table to track image provenance:

| Column | Type | Purpose |
|--------|------|---------|
| `image_source` | TEXT | 'unsplash', 'pexels', 'wikimedia', or 'upload' |
| `original_url` | TEXT | The original external URL (before archiving) |
| `image_license` | TEXT | 'Unsplash License', 'Pexels License', 'CC0', 'Rights Certified' |
| `image_attribution` | TEXT | 'Photo by John Doe on Pexels' or artist string |
| `archived_at` | TIMESTAMP | When the image was archived to our storage |

**User Upload Handling:**
- `image_source`: "upload"
- `image_license`: "Rights Certified by Publisher"
- `image_attribution`: "Uploaded by [Publisher Name]"
- `original_url`: NULL (not applicable)

---

## Phase 2: Image Archive Pipeline

### New Edge Function: `archive-image`

Creates a dedicated function that:
1. Downloads image bytes from external URL (Unsplash/Pexels/Wikimedia)
2. Uploads to Supabase storage under `archived/{book_id}/{timestamp}.jpg`
3. Returns the permanent Supabase URL

```text
External URL (Unsplash/Pexels)
        |
        v
+------------------+
| archive-image    |
| Edge Function    |
+------------------+
        |
        v
Download image bytes
        |
        v
Upload to Supabase Storage
(archived/{book_id}/{timestamp}.jpg)
        |
        v
Return permanent URL + metadata
```

### Updated Image Selection Flow

When a user selects an image (via Search Gallery or auto-fetch):

1. Call `archive-image` with the external URL
2. Receive permanent Supabase URL + original URL
3. Store both URLs + metadata in `book_pages`

---

## Phase 3: Frontend Updates

### ImageSearchGallery.tsx
- Pass source metadata (`source`, `attribution`, `license`) to selection handlers
- Include original URL in callback data

### PageViewer.tsx
- Update `handleImageSelect` to save metadata columns
- Update `handleCroppedImageUpload` to save metadata columns
- Update `fetchImageForBlock` to archive images and save metadata
- Update `handleImageUpload` to mark as "upload" source with "Rights Certified" license

### bookImages.ts
- Add `archiveExternalImage()` helper function
- Add `saveImageMetadata()` helper for consistent DB updates

---

## Phase 4: Image Manifest Generator

### Update KdpLegalDefense.tsx

Add a third document to the Defense Kit ZIP:

**03_Image_Manifest.pdf**

Contents:
- Header: "IMAGE LICENSING MANIFEST"
- Book title, publisher, date
- Table with columns:

| Page | Chapter | Caption | Source | License | Archived URL | Original URL |
|------|---------|---------|--------|---------|--------------|--------------|

**Special Features:**
- Embedded 50x50px thumbnails for visual proof
- User uploads marked as "Rights Certified by Publisher"
- Clickable URLs for both archived and original locations

### Sample Row Examples:

**Unsplash Image:**
| 3 | 1 | Aspen mountain at sunset | Unsplash | Unsplash License | https://[supabase]/archived/... | https://unsplash.com/photos/abc123 |

**Pexels Image:**
| 7 | 2 | Hotel Jerome lobby | Pexels | Pexels License | https://[supabase]/archived/... | https://pexels.com/photo/456 |

**User Upload:**
| 12 | 4 | Custom restaurant photo | User Upload | Rights Certified by Publisher | https://[supabase]/user-uploads/... | N/A |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/add_image_metadata.sql` | CREATE | Add 5 columns to book_pages |
| `supabase/functions/archive-image/index.ts` | CREATE | Download + reupload images |
| `supabase/config.toml` | UPDATE | Add archive-image function config |
| `src/lib/bookImages.ts` | UPDATE | Add archiveExternalImage helper |
| `src/components/ImageSearchGallery.tsx` | UPDATE | Pass metadata to handlers |
| `src/components/PageViewer.tsx` | UPDATE | Save metadata on image selection |
| `src/components/KdpLegalDefense.tsx` | UPDATE | Generate 03_Image_Manifest.pdf |

---

## Data Flow Summary

```text
+-------------------+     +------------------+     +-------------------+
| User selects      | --> | archive-image    | --> | Supabase Storage  |
| image from        |     | Edge Function    |     | archived/{id}/    |
| Unsplash/Pexels   |     | (downloads +     |     | timestamp.jpg     |
| OR uploads own    |     | reuploads)       |     +-------------------+
+-------------------+     +------------------+              |
                                                           v
+-----------------------------------------------------------+
| book_pages table                                          |
|-----------------------------------------------------------|
| image_url        = Supabase archived URL (permanent)      |
| original_url     = External URL (provenance)              |
| image_source     = 'unsplash' | 'pexels' | 'upload'       |
| image_license    = 'Unsplash License' | 'Rights Certified'|
| image_attribution= 'Photo by X on Pexels'                 |
| archived_at      = timestamp                              |
+-----------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------+
| 03_Image_Manifest.pdf (in Defense Kit ZIP)                |
|-----------------------------------------------------------|
| Table of all images with:                                 |
| - Page/Chapter location                                   |
| - 50x50 thumbnail (embedded)                              |
| - Source + License                                        |
| - Archived URL (permanent, your control)                  |
| - Original URL (provenance proof)                         |
+-----------------------------------------------------------+
```

---

## Benefits

1. **Link Rot Immunity**: Your Supabase storage URL is permanent and under your control
2. **Complete Audit Trail**: Original URLs documented for legal provenance
3. **Visual Proof**: Embedded thumbnails in PDF survive even if all URLs die
4. **User Upload Coverage**: Uploads marked with "Rights Certified by Publisher"
5. **KDP Defensible**: Demonstrates clear ownership, licensing, and archive chain

---

## Technical Notes

- The archive-image Edge Function uses the existing `book-images` storage bucket
- Images are stored under `archived/{book_id}/{timestamp}.ext` path
- Original resolution is preserved (uses full/large2x URLs)
- Metadata is saved atomically with the image_url update
- The manifest PDF uses jsPDF for generation (same as Evidence Dossier)
- Thumbnail embedding uses base64 data URLs in the PDF

---

## Estimated Implementation Steps

1. **Database Migration** - Add 5 columns to book_pages (simple ALTER TABLE)
2. **Archive Edge Function** - Create download/upload pipeline
3. **Frontend Handlers** - Update selection/upload flows to save metadata
4. **Manifest Generator** - Add PDF table with embedded thumbnails
5. **Testing** - Verify metadata persists and manifest generates correctly
