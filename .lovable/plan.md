
# Plan: Fix Manuscript PDF Export (Complete Overhaul)

## Problem Summary

Based on the screenshots and code analysis, the Manuscript PDF has **6 critical issues**:

1. **Missing Logo on Title Page** - No "Loom & Page" logo icon (only text)
2. **No Separator Line** - Missing decorative line between title and subtitle
3. **No Cover Photo Attribution** - Copyright page lacks "Cover image by [Photographer] via [Source]"
4. **Copyright Bleeding into ToC** - Page 2 shows both copyright AND table of contents
5. **Only 14 Pages / No Content** - PDF shows "[8 blocks generated]" placeholder text instead of actual chapter content
6. **Generic Computer Font** - Uses pdfmake's default Roboto instead of Playfair Display

---

## Root Cause Analysis

### Why Content is Missing (Issue #5)
The `generateCleanPDF()` function in `BookCover.tsx` is called with `bookData`, but `bookData.chapter1Content` only contains placeholder text like `"[8 blocks generated]"` — not the actual chapter content.

The real content is stored in:
- The `book_pages` database table (block-based architecture)
- The `chapterBlocks` state in `Index.tsx` (React state)

The legacy markdown-parsing approach in `generateCleanPDF.ts` is designed for a deprecated content format.

### Why Font Looks Bad (Issue #6)
The pdfmake library uses its bundled VFS fonts (Roboto), not the custom Playfair Display TTF that the preview uses. While `pdfFonts.ts` exists to register Playfair for jsPDF, it's not being used in the pdfmake-based generator.

---

## Solution Strategy

### Unify on Block-Based PDF Generation

Replace the `generateCleanPDF()` call in BookCover.tsx with the correct `generateBlockBasedPDF()` function that:
1. Fetches blocks from `book_pages` table
2. Renders each block type correctly (text, image_full, pro_tip, etc.)
3. Uses pdfmake for consistent 6x9 KDP output

Then enhance `generateBlockBasedPDF.ts` to fix all visual issues.

---

## Detailed Changes

### File 1: `src/lib/generateBlockPDF.ts` (Major Enhancements)

#### 1A. Add Logo to Title Page
Draw the "Loom & Page" logo icon using SVG paths in pdfmake, matching the preview's 3-line + crossbar design.

```text
Current:
{ text: 'LOOM & PAGE', style: 'branding', pageBreak: 'after' }

After:
[
  // SVG logo icon
  { svg: '<svg>...3 vertical lines + crossbar...</svg>', width: 24, alignment: 'center' },
  // Brand text
  { text: 'Loom & Page', style: 'branding' },
  { text: '', pageBreak: 'after' }
]
```

#### 1B. Add Separator Line Between Title and Subtitle
Insert a short decorative line after the title, before the subtitle.

```text
Current:
{ text: (displayTitle).toUpperCase(), style: 'titlePageTitle' },
{ text: subtitle, style: 'titlePageSubtitle' },

After:
{ text: (displayTitle).toUpperCase(), style: 'titlePageTitle' },
{ canvas: [{ type: 'line', x1: 180, y1: 0, x2: 252, y2: 0, lineWidth: 1, lineColor: '#cccccc' }], margin: [0, 15, 0, 15] },
{ text: subtitle, style: 'titlePageSubtitle' },
```

#### 1C. Add Cover Photo Attribution to Copyright Page
Accept a new `coverAttribution` parameter and include it after the copyright text.

```text
Current:
{ text: 'Copyright © 2026 by Larvotto Ventures LLC', ... },
...
{ text: 'First Edition: January 2026', ... }

After:
{ text: 'Copyright © 2026 by Larvotto Ventures LLC', ... },
...
{ text: 'Cover design by Loom & Page', fontSize: 8, color: '#666' },
{ text: 'Cover image by [Photographer] via [Source]', fontSize: 8, color: '#666' },
{ text: '', margin: [0, 10, 0, 0] },
{ text: 'First Edition: January 2026', ... }
```

#### 1D. Fix Copyright/ToC Page Break
The current code uses `absolutePosition` which causes content to overlap. Change to a simpler flow-based layout with explicit page breaks.

```text
Current:
contentArray.push({
  stack: [...copyright content...],
  absolutePosition: { x: 63, y: 420 }  // THIS CAUSES OVERLAP
});
contentArray.push({ text: ' ', fontSize: 1, pageBreak: 'after' });

After:
contentArray.push({ text: '', margin: [0, 380, 0, 0] }); // Push down to bottom
contentArray.push({
  stack: [...copyright content...],
  // NO absolutePosition - let it flow naturally
});
contentArray.push({ text: '', pageBreak: 'after' }); // Force new page for ToC
```

#### 1E. Fetch ALL Blocks (Fix 14-page issue)
The function already fetches from `book_pages`, but verify it's not filtering by user. Add diagnostic logging.

```text
Current:
const { data: blocks, error } = await supabase
  .from('book_pages')
  .select('*')
  .eq('book_id', bookId)
  ...

After:
console.log('[BlockPDF] Fetching blocks for bookId:', bookId);
const { data: blocks, error } = await supabase
  .from('book_pages')
  .select('*')
  .eq('book_id', bookId)
  .order('chapter_number', { ascending: true })
  .order('page_order', { ascending: true });

console.log('[BlockPDF] Fetched blocks:', blocks?.length || 0);
if ((blocks?.length || 0) === 0) {
  toast.warning('No content blocks found. RLS policy may be blocking access.');
}
```

#### 1F. Improve Font Styling
pdfmake doesn't support TTF embedding easily without custom VFS. Use the best built-in alternative:
- Change `bold: true` to use Georgia/Times (serif feel)
- For true Playfair parity, we'll note this as a future enhancement

For now, update styles to use `font: 'Times'` where available in pdfmake, giving a more professional serif look than Roboto.

#### 1G. Add `returnBlob` Option
For KDP Package bundling, add an option to return a Blob instead of triggering download.

```typescript
interface GenerateBlockPDFOptions {
  title: string;
  displayTitle: string;
  subtitle: string;
  tableOfContents: Array<{ chapter: number; title: string }>;
  bookId: string;
  coverAttribution?: string;  // NEW: "Photo by X via Unsplash"
  returnBlob?: boolean;       // NEW: For ZIP bundling
}
```

---

### File 2: `src/components/BookCover.tsx` (Wire Up Correct Generator)

#### 2A. Replace `generateCleanPDF` with `generateBlockBasedPDF` in `handleDownloadManuscript`

```text
Current:
await generateCleanPDF({
  topic: topic || title,
  bookData,
  coverImageUrl: validCoverUrl,
  isGrayscale
});

After:
await generateBlockBasedPDF({
  title: topic || title,
  displayTitle: bookData?.displayTitle || topic || title,
  subtitle: bookData?.subtitle || '',
  tableOfContents: bookData?.tableOfContents || [],
  bookId: bookId!,
  coverAttribution: getCoverAttribution(),  // Extract from cover image metadata
});
```

#### 2B. Extract Cover Attribution
Add a helper function to extract photographer/source from the cover image URL or stored metadata.

```typescript
const getCoverAttribution = (): string => {
  // Check if we have attribution stored (from Unsplash/Wikimedia)
  // For now, derive from URL pattern
  if (displayUrl?.includes('unsplash.com')) {
    return 'Image via Unsplash';
  } else if (displayUrl?.includes('wikimedia.org')) {
    return 'Image via Wikimedia Commons';
  } else if (displayUrl?.includes('pexels.com')) {
    return 'Image via Pexels';
  }
  return '';
};
```

#### 2C. Update KDP Package Bundling
The `handleDownloadKDPPackage` function should use `generateBlockBasedPDF` with `returnBlob: true`.

---

### File 3: RLS Policy Verification

The recent migration added `"Guests can view guest books"` policy on `books` table. Verify that `book_pages` can now be read by confirming the query returns data.

---

## Technical Summary

| Issue | Fix Location | Change |
|-------|--------------|--------|
| Missing logo | `generateBlockPDF.ts` | Add SVG logo above brand text |
| No separator line | `generateBlockPDF.ts` | Add canvas line between title/subtitle |
| No cover attribution | `generateBlockPDF.ts` | Add `coverAttribution` param and text |
| Copyright/ToC overlap | `generateBlockPDF.ts` | Remove `absolutePosition`, use flow layout |
| 14 pages / no content | `BookCover.tsx` | Switch to `generateBlockBasedPDF` |
| Generic font | `generateBlockPDF.ts` | Use Times serif styles |
| returnBlob for ZIP | `generateBlockPDF.ts` | Add `returnBlob` option |

---

## Expected Outcome After Fix

| Page | Content |
|------|---------|
| Page 1 (Title) | Logo icon, TITLE, separator line, subtitle, "Loom & Page" |
| Page 2 (Copyright) | Full copyright text, cover attribution, pushed to bottom |
| Page 3 (ToC) | Table of Contents header + chapter list |
| Page 4+ (Chapters) | Full chapter content with text, images, pro-tips |
| Final | Professional 100+ page manuscript matching preview |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/generateBlockPDF.ts` | Logo, separator, attribution, page breaks, fonts, returnBlob |
| `src/components/BookCover.tsx` | Use `generateBlockBasedPDF`, pass `coverAttribution` |

---

## Future Enhancements (Not in This Plan)

1. **Custom Font VFS**: Bundle Playfair Display into pdfmake's virtual file system for exact font parity
2. **Grayscale Mode**: Pass `isGrayscale` to block PDF generator and convert images
3. **PDF Metadata**: Add ISBN field to copyright page when available
