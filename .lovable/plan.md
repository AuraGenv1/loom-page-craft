

# Plan: Complete Translation System - Phase 2

## Summary

This plan addresses the remaining translation gaps identified in the screenshots:

1. **Key Takeaway label**: Verify the translation is being applied correctly (already exists in translations)
2. **Page Tools menu items**: Translate all dropdown menu items
3. **Image loading states**: Translate "Searching Archives..." and "Searching..."
4. **"AI-selected" badge**: Translate the badge text
5. **"Cover Studio" button**: Translate the button label
6. **KDP Cover Studio dialog**: Translate title, tab labels, and all UI text
7. **Prep tab content**: Translate labels and button text
8. **Export tab content**: Translate descriptions and UI text
9. **Legal tab access**: Hide the Legal tab from non-admin users (admin-only)

---

## Technical Analysis

### Issue 1: Key Takeaway Still in English

Looking at the code in `PageViewer.tsx` lines 793-798 and 2271-2273:

```typescript
// Line 793 - Component definition with default fallback
const KeyTakeawayPage: React.FC<{ content: { text: string }; keyTakeawayLabel?: string }> = ({ content, keyTakeawayLabel = 'KEY TAKEAWAY' }) => (

// Line 2273 - Where it's called with translation
keyTakeawayLabel={t('keyTakeaway')}
```

The translation key exists in all 8 languages (verified via search). The issue is likely that the `t()` function from `useLanguage()` is not imported or available where `BlockRenderer` is being rendered. Need to verify `useLanguage` is imported and `t` is passed correctly.

**Root Cause**: The `t` function is obtained from `useLanguage()` hook in the main `PageViewer` component (line ~2062), and passed to `BlockRenderer` via props. This should work. Let me verify the actual usage.

### Issue 2: Page Tools Menu Items

The following strings are hardcoded in `PageViewer.tsx` lines 2388-2519:

| Line | Hardcoded String |
|------|-----------------|
| 2390 | `"Premium Editing Suite"` |
| 2409 | `"Insert Page Before"` |
| 2420 | `"Insert Page After"` |
| 2441 | `"Search Gallery"` |
| 2448 | `"Upload Own Photo"` |
| 2460 | `"Try it!"` |
| 2478 | `"Regenerate Chapter {n}"` |
| 2485 | `"Edit Page Content"` |
| 2493 | `"Delete This Page"` |
| 2510 | `"B&W Print Mode"` |
| 2518 | `"Optimizes for Amazon's cheaper B&W printing"` |

### Issue 3: Image Loading States

In `PageViewer.tsx`:
- Line 582: `"Searching Archives..."` (ImageFullPage)
- Line 676: `"Searching..."` (ImageHalfPage)

**Recommendation**: Replace with translated text OR use the WeavingLoader component for consistency (user's preference). I recommend translating the text as it's more informative.

### Issue 4: "AI-selected" Badge

In `PageViewer.tsx`:
- Line 613: `<span>AI-selected</span>` (ImageFullPage)
- Line 703: `<span>AI-selected</span>` (ImageHalfPage)

### Issue 5: "Cover Studio" Button

In `BookCover.tsx` line 1909:
```typescript
{hasFullAccess ? 'Cover Studio' : 'Preview Studio'}
```

### Issue 6: KDP Cover Studio Dialog

In `BookCover.tsx`:
- Line 2028: `"KDP Cover Studio & Export Manager"`
- Line 2034-2057: Tab labels ("Front", "Back", "Spine", "Wrap", "Prep", "$$$", "Legal", "Export")
- Line 2064: `"Current Front Cover"`
- Line 2129: `"Edit Cover Text"`
- Line 2133: `"View Only"`
- Line 2138: `"Title"`
- Line 2149: `"Subtitle"`
- Line 2172: `"Save Text Changes"`
- Line 2181: `"Or Upload Your Own Image"`
- Line 2193: `"Search Gallery"`
- Line 2217: `"Upload Cover Image"`
- Line 2225: `"Custom Cover Image"`
- Line 2228: `"Premium"`
- Line 2240: `"Unlock Cover Editing"`
- Line 2251: `"Cover Branding"`
- Line 2262: `"Brand:"`
- Line 2275: `"Logo"`
- Line 2305: `"Change Logo"` / `"Upload Logo"`
- Line 2329: `"Reset"`

And many more in the Back, Spine, Wrap, and Export tabs...

### Issue 7: Prep Tab Content (KdpPrepDashboard.tsx)

Key strings to translate:
- Line 226: `"Preparing Amazon metadata..."`
- Line 228: `"Generating description, subtitle, and keywords..."`
- Line 239: `"Page Count:"`, `"Spine:"`, `"Trim:"`, `"Bleed:"`
- Line 265: `"Book Description"`
- Line 277: `"Preview"`, `"HTML"`
- Line 289-294: `"Preview (Formatted)"`, `"Edit HTML"`
- Line 330: `"Write Best-Selling Description"`
- Line 348-349: `"Preview shows formatted text..."`

### Issue 8: Legal Tab - Admin Only

Per user request, the Legal tab should only be visible to Admin users, not to paid users or guests. Currently it shows for `hasFullAccess` which includes both admins and paid users.

**Solution**: Add an `isAdmin` prop check to conditionally render the Legal tab.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/LanguageContext.tsx` | Add ~60 new translation keys per language for all UI strings |
| `src/components/PageViewer.tsx` | Use `t()` for all Page Tools items, image loading text, and AI-selected badge |
| `src/components/BookCover.tsx` | Use `t()` for Cover Studio button, dialog title, tabs, and all form labels. Hide Legal tab for non-admins |
| `src/components/KdpPrepDashboard.tsx` | Use `t()` for all form labels and button text |

---

## New Translation Keys Required

### Page Tools & Image States
```typescript
// Page Tools Menu
premiumEditingSuite: 'Premium Editing Suite',
insertPageBefore: 'Insert Page Before',
insertPageAfter: 'Insert Page After',
searchGallery: 'Search Gallery',
uploadOwnPhoto: 'Upload Own Photo',
tryIt: 'Try it!',
regenerateChapter: 'Regenerate Chapter {n}',
editPageContent: 'Edit Page Content',
deleteThisPage: 'Delete This Page',
bwPrintMode: 'B&W Print Mode',
bwPrintModeDesc: "Optimizes for Amazon's cheaper B&W printing",

// Image Loading
searchingArchives: 'Searching Archives...',
searching: 'Searching...',
aiSelected: 'AI-selected',
imageNotFound: 'Image not found',
```

### Cover Studio
```typescript
// Cover Studio Button
coverStudio: 'Cover Studio',
previewStudio: 'Preview Studio',

// Dialog Title
kdpCoverStudioTitle: 'KDP Cover Studio & Export Manager',

// Tab Labels
tabFront: 'Front',
tabBack: 'Back',
tabSpine: 'Spine',
tabWrap: 'Wrap',
tabPrep: 'Prep',
tabRoyalty: '$$$',
tabLegal: 'Legal',
tabExport: 'Export',

// Front Tab
currentFrontCover: 'Current Front Cover',
editCoverText: 'Edit Cover Text',
viewOnly: 'View Only',
title: 'Title',
subtitle: 'Subtitle',
saveTextChanges: 'Save Text Changes',
uploadYourOwnImage: 'Or Upload Your Own Image',
uploadCustomCoverDesc: 'Upload a custom cover image (JPG, PNG, max 5MB)',
uploadCoverImage: 'Upload Cover Image',
customCoverImage: 'Custom Cover Image',
unlockCoverEditing: 'Unlock Cover Editing',
coverBranding: 'Cover Branding',
brand: 'Brand',
logo: 'Logo',
uploadLogo: 'Upload Logo',
changeLogo: 'Change Logo',
reset: 'Reset',
premium: 'Premium',
noImage: 'No Image',
saving: 'Saving...',
uploading: 'Uploading...',

// Export Tab
completeKdpPackage: 'Complete KDP Package',
kdpPackageDesc: 'Download everything you need for Amazon KDP in one ZIP file:',
coverFile: 'Full wrap cover with spine',
manuscriptFile: 'Interior text with TOC & images',
kindleEbook: 'Kindle eBook format',
kindleCover: 'eBook cover image',
downloadKdpPackage: 'Download KDP Package',
generatingPackage: 'Generating...',

// Locked Tab Content
unlockFullGuide: 'Unlock Full Guide',
amazonListingPrep: 'Amazon Listing Prep',
amazonListingPrepDesc: 'Unlock to auto-generate your Best-Selling Description and Keywords with AI.',
royaltyCalculator: 'Royalty Calculator',
royaltyCalculatorDesc: 'Unlock to calculate your KDP royalties and optimize your pricing strategy.',
```

### Prep Dashboard
```typescript
// KDP Prep Dashboard
preparingMetadata: 'Preparing Amazon metadata...',
generatingMetadata: 'Generating description, subtitle, and keywords...',
pageCount: 'Page Count',
spineLabel: 'Spine',
trimLabel: 'Trim',
bleedLabel: 'Bleed',
bookDescription: 'Book Description',
preview: 'Preview',
html: 'HTML',
previewFormatted: 'Preview (Formatted)',
editHtml: 'Edit HTML',
writeBestSellingDesc: 'Write Best-Selling Description',
copyHtmlNote: 'Preview shows formatted text. Copy button copies raw HTML for Amazon KDP.',
```

---

## French Translation Examples

```typescript
fr: {
  // Page Tools
  premiumEditingSuite: 'Suite d\'Édition Premium',
  insertPageBefore: 'Insérer une Page Avant',
  insertPageAfter: 'Insérer une Page Après',
  searchGallery: 'Rechercher dans la Galerie',
  uploadOwnPhoto: 'Téléverser Votre Photo',
  tryIt: 'Essayez !',
  regenerateChapter: 'Régénérer le Chapitre {n}',
  editPageContent: 'Modifier le Contenu de la Page',
  deleteThisPage: 'Supprimer Cette Page',
  bwPrintMode: 'Mode Impression N&B',
  bwPrintModeDesc: 'Optimisé pour l\'impression N&B moins chère d\'Amazon',
  
  // Image States
  searchingArchives: 'Recherche dans les Archives...',
  searching: 'Recherche...',
  aiSelected: 'Sélectionné par IA',
  imageNotFound: 'Image non trouvée',
  
  // Cover Studio
  coverStudio: 'Studio de Couverture',
  previewStudio: 'Studio de Prévisualisation',
  kdpCoverStudioTitle: 'Studio KDP & Gestionnaire d\'Export',
  
  // Tab Labels
  tabFront: 'Avant',
  tabBack: 'Arrière',
  tabSpine: 'Dos',
  tabWrap: 'Complet',
  tabPrep: 'Prépa',
  tabRoyalty: '$$$',
  tabExport: 'Export',
  
  // Form Labels
  currentFrontCover: 'Couverture Avant Actuelle',
  editCoverText: 'Modifier le Texte de Couverture',
  viewOnly: 'Lecture Seule',
  saveTextChanges: 'Enregistrer les Modifications',
  uploadYourOwnImage: 'Ou Téléversez Votre Image',
  uploadCoverImage: 'Téléverser une Image',
  coverBranding: 'Image de Marque',
  brand: 'Marque',
  logo: 'Logo',
  uploadLogo: 'Téléverser le Logo',
  changeLogo: 'Changer le Logo',
  reset: 'Réinitialiser',
  premium: 'Premium',
  noImage: 'Aucune Image',
  
  // Export
  completeKdpPackage: 'Package KDP Complet',
  kdpPackageDesc: 'Téléchargez tout ce dont vous avez besoin pour Amazon KDP dans un fichier ZIP :',
  coverFile: 'Couverture complète avec dos',
  manuscriptFile: 'Texte intérieur avec table des matières et images',
  kindleEbook: 'Format eBook Kindle',
  kindleCover: 'Image de couverture eBook',
  downloadKdpPackage: 'Télécharger le Package KDP',
  generatingPackage: 'Génération...',
  
  // Prep Dashboard
  preparingMetadata: 'Préparation des métadonnées Amazon...',
  generatingMetadata: 'Génération de la description, du sous-titre et des mots-clés...',
  pageCount: 'Nombre de Pages',
  spineLabel: 'Dos',
  trimLabel: 'Format',
  bleedLabel: 'Fond Perdu',
  bookDescription: 'Description du Livre',
  preview: 'Aperçu',
  html: 'HTML',
  writeBestSellingDesc: 'Rédiger une Description Best-Seller',
}
```

---

## Implementation Steps

### Step 1: Add Translation Keys
Add ~60 new keys to all 8 languages in `LanguageContext.tsx`.

### Step 2: Update PageViewer.tsx
1. Import/use `useLanguage` hook at component level
2. Replace all hardcoded strings in Page Tools menu with `t()` calls
3. Update ImageFullPage and ImageHalfPage components to accept translation props or use hook
4. Replace "AI-selected" with `t('aiSelected')`
5. Replace "Searching Archives..." with `t('searchingArchives')`

### Step 3: Update BookCover.tsx
1. Import `useLanguage` hook
2. Replace "Cover Studio" / "Preview Studio" button text with `t()`
3. Replace dialog title with `t('kdpCoverStudioTitle')`
4. Replace all tab labels with `t()` calls
5. Replace all form labels with `t()` calls
6. **Important**: Hide the "Legal" tab unless `isAdmin` is true (not just `hasFullAccess`)

### Step 4: Update KdpPrepDashboard.tsx
1. Import `useLanguage` hook
2. Replace all form labels and button text with `t()` calls

---

## Legal Tab Access Control

**Current behavior**: Shows for `hasFullAccess` (admin OR paid)
**Desired behavior**: Shows ONLY for `isAdmin`

**Implementation**:
```typescript
// In BookCover.tsx TabsList
{isAdmin && (
  <TabsTrigger value="legal" className="gap-1 text-xs sm:text-sm">
    <ShieldCheck className="w-3 h-3" />
    {t('tabLegal')}
  </TabsTrigger>
)}

// In TabsContent
{isAdmin && (
  <TabsContent value="legal" className="pt-4">
    ...
  </TabsContent>
)}
```

This ensures guests and paid users never see the Legal tab—only admins.

---

## Testing Checklist

After implementation:
1. Switch to French, navigate to a book, and verify:
   - Page Tools menu items are in French
   - "AI-selected" badge shows "Sélectionné par IA"
   - Image loading shows "Recherche dans les Archives..."
   - "Cover Studio" button shows "Studio de Couverture"
   - KDP Cover Studio dialog title and all labels are in French
2. Verify Legal tab is hidden for paid users (only visible to admins)
3. Test Prep tab translations for button labels and descriptions
4. Test Export tab translations
5. Verify Key Takeaway blocks render with translated label

