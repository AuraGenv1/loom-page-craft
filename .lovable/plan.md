

# Plan: Complete Remaining Translation Fixes for Phase 2

## Summary

This plan addresses the remaining translation gaps identified in the screenshots:

1. **"x of x chapters ready" progress text** - Currently half-translated in Index.tsx
2. **"Cover Studio" / "Preview Studio" button** - Already has translation keys but not using them in BookCover.tsx
3. **KDP Cover Studio dialog** - Entire dialog has hardcoded English strings (title, tabs, labels)
4. **KDP Prep Dashboard loading animation** - Has translation keys but component not using them
5. **Legal tab visibility** - Should be hidden for non-admin users (admin-only restriction)

---

## Technical Analysis

### Issue 1: "x of x chapters ready" (Index.tsx line 980)

Current code:
```typescript
✓ {t('fullAccessUnlocked')} — {completedChapterCount} of {totalChapters} chapters ready
```

The `t('fullAccessUnlocked')` is translated, but `of ... chapters ready` is hardcoded. Need to add a new translation key.

### Issue 2: "Cover Studio" / "Preview Studio" Button (BookCover.tsx line 1909)

Current code:
```typescript
{hasFullAccess ? 'Cover Studio' : 'Preview Studio'}
```

Translation keys already exist (`coverStudio` and `previewStudio` in all 8 languages) but the component doesn't import `useLanguage` or use them.

### Issue 3: KDP Cover Studio Dialog - All Hardcoded

BookCover.tsx does NOT import `useLanguage`. All dialog text is hardcoded:

| Line | Hardcoded String |
|------|-----------------|
| 2028 | `"KDP Cover Studio & Export Manager"` |
| 2034-2057 | Tab labels: "Front", "Back", "Spine", "Wrap", "Prep", "$$$", "Legal", "Export" |
| 2064 | `"Current Front Cover"` |
| 2079 | `"No Image"` |
| 2129 | `"Edit Cover Text"` |
| 2133 | `"View Only"` |
| 2138 | `"Title"` |
| 2149 | `"Subtitle"` |
| 2169-2172 | `"Saving..."` / `"Save Text Changes"` |
| 2181-2183 | `"Or Upload Your Own Image"` |
| 2193 | `"Search Gallery"` |
| 2212-2217 | `"Uploading..."` / `"Upload Cover Image"` |
| 2225 | `"Custom Cover Image"` |
| 2228 | `"Premium"` |
| 2240 | `"Unlock Cover Editing"` |
| 2251 | `"Cover Branding"` |
| 2262 | `"Brand:"` |
| 2275 | `"Logo"` |
| 2305 | `"Change Logo"` / `"Upload Logo"` |
| 2329 | `"Reset"` |
| 2355 | `"Current Back Cover"` |
| 2384 | `"Back Cover Text"` |
| 2393 | `"Header"` |
| 2882-2884 | Export tab descriptions |
| ... | Many more |

### Issue 4: KDP Prep Dashboard Loading (KdpPrepDashboard.tsx lines 226-229)

Current code:
```typescript
<WeavingLoader text="Preparing Amazon metadata..." />
<p>Generating description, subtitle, and keywords...</p>
```

Translation keys exist (`preparingMetadata`, `generatingMetadata`) but component doesn't use `useLanguage`.

### Issue 5: Legal Tab - Admin Only

Current code shows Legal tab for `hasFullAccess` (admin OR paid users). Per user request, it should only show for `isAdmin`.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/LanguageContext.tsx` | Add new key: `chaptersReady` for "x of x chapters ready" pattern |
| `src/pages/Index.tsx` | Use new `t('chaptersReady')` translation with placeholder replacement |
| `src/components/BookCover.tsx` | Import `useLanguage` hook, use `t()` for all 50+ hardcoded strings, hide Legal tab for non-admins |
| `src/components/KdpPrepDashboard.tsx` | Import `useLanguage` hook, use `t()` for loading text and all form labels |

---

## New Translation Keys Required

### Index.tsx - Chapters Progress
```typescript
// Already has fullAccessUnlocked - need to add chapters ready pattern
chaptersReady: '{completed} of {total} chapters ready',
```

### French Example
```typescript
fr: {
  chaptersReady: '{completed} sur {total} chapitres prêts',
}
```

---

## Implementation Details

### Index.tsx - Fix "x of x chapters ready"

**Before (line 980)**:
```typescript
✓ {t('fullAccessUnlocked')} — {completedChapterCount} of {totalChapters} chapters ready
```

**After**:
```typescript
✓ {t('fullAccessUnlocked')} — {t('chaptersReady').replace('{completed}', String(completedChapterCount)).replace('{total}', String(totalChapters))}
```

### BookCover.tsx - Add Translation Support

1. **Import the hook** at top of file:
```typescript
import { useLanguage } from '@/contexts/LanguageContext';
```

2. **Get t function** inside the component:
```typescript
const { t } = useLanguage();
```

3. **Replace all hardcoded strings** with `t()` calls:
```typescript
// Button (line 1909)
{hasFullAccess ? t('coverStudio') : t('previewStudio')}

// Dialog title (line 2028)
{t('kdpCoverStudioTitle')}

// Tab labels (lines 2034-2057)
<TabsTrigger value="front">{t('tabFront')}</TabsTrigger>
<TabsTrigger value="back">{t('tabBack')}</TabsTrigger>
// etc.
```

4. **Hide Legal tab for non-admins**:
```typescript
// Only render Legal tab if isAdmin (not just hasFullAccess)
{isAdmin && (
  <TabsTrigger value="legal" className="gap-1 text-xs sm:text-sm">
    <ShieldCheck className="w-3 h-3" />
    {t('tabLegal')}
  </TabsTrigger>
)}

// Only render Legal tab content if isAdmin
{isAdmin && (
  <TabsContent value="legal" className="pt-4">
    ...
  </TabsContent>
)}
```

### KdpPrepDashboard.tsx - Add Translation Support

1. **Import the hook**:
```typescript
import { useLanguage } from '@/contexts/LanguageContext';
```

2. **Get t function**:
```typescript
const { t } = useLanguage();
```

3. **Update loading state (lines 226-229)**:
```typescript
<WeavingLoader text={t('preparingMetadata')} />
<p className="text-sm text-muted-foreground">
  {t('generatingMetadata')}
</p>
```

4. **Update form labels** (lines 239-256):
```typescript
<span className="text-xs text-muted-foreground">{t('pageCount')}:</span>
<span className="text-xs text-muted-foreground">{t('spineLabel')}:</span>
<span className="text-xs text-muted-foreground">{t('trimLabel')}:</span>
<span className="text-xs text-muted-foreground">{t('bleedLabel')}:</span>
```

5. **Update description section labels**:
```typescript
<Label>{t('bookDescription')}</Label>
<Button>{t('preview')}</Button>
<Button>{t('html')}</Button>
<Button>{t('writeBestSellingDesc')}</Button>
```

---

## New Translation Keys for All 8 Languages

### English (baseline)
```typescript
chaptersReady: '{completed} of {total} chapters ready',
```

### Spanish
```typescript
chaptersReady: '{completed} de {total} capítulos listos',
```

### French
```typescript
chaptersReady: '{completed} sur {total} chapitres prêts',
```

### German
```typescript
chaptersReady: '{completed} von {total} Kapiteln fertig',
```

### Italian
```typescript
chaptersReady: '{completed} di {total} capitoli pronti',
```

### Portuguese
```typescript
chaptersReady: '{completed} de {total} capítulos prontos',
```

### Chinese
```typescript
chaptersReady: '{completed}/{total}章节已完成',
```

### Japanese
```typescript
chaptersReady: '{completed}/{total}章完成',
```

---

## Legal Tab Access Control

**Current behavior**: Legal tab shows for `hasFullAccess` (both admin AND paid users)
**Desired behavior**: Legal tab shows ONLY for `isAdmin`

This is a security/access control change that restricts sensitive licensing documentation to administrators only.

---

## Summary of Changes

| Component | Change Type | # of Strings |
|-----------|-------------|--------------|
| Index.tsx | Add translation | 1 string |
| BookCover.tsx | Import hook + translate + access control | ~60 strings |
| KdpPrepDashboard.tsx | Import hook + translate | ~15 strings |
| LanguageContext.tsx | Add new keys | 1 key × 8 languages |

---

## Testing Checklist

After implementation:
1. **Switch to French** and verify:
   - Progress bar shows "2 sur 12 chapitres prêts"
   - Button shows "Studio de Couverture" (admin) or "Studio de Prévisualisation" (guest)
   - KDP Cover Studio dialog title shows "Studio KDP & Gestionnaire d'Export"
   - All tab labels (Avant, Arrière, Dos, Complet, Prépa, $$$, Export) are in French
   - Legal tab is hidden for non-admins
   - Prep tab loading shows "Préparation des métadonnées Amazon..."
   - All form labels in all tabs are in French
2. **Test as non-admin paid user**:
   - Verify Legal tab is NOT visible (only 7 tabs shown instead of 8)
3. **Test as admin**:
   - Verify Legal tab IS visible
4. **Test all 8 languages** for consistency

