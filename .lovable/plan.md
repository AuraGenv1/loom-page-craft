
# Plan: Complete Localization Phase - Prep Content, Back Cover, and Legal Tab Fix

## Summary

This plan addresses three issues identified in the screenshots:

1. **Legal tab missing for Admin in French** - The tab trigger is missing from the TabsList, only the TabsContent is conditionally rendered
2. **Prep tab content in English** - The AI-generated description, subtitle, and keywords need to be generated in the user's selected language
3. **Back Cover content in English** - The default text "Created with Loom & Page..." needs to be translated to all 8 languages

## Analysis

### Issue 1: Legal Tab Missing for Admin

**Root Cause**: In the previous update, I removed the Legal tab trigger from the TabsList (lines 2037-2058) but kept the TabsContent rendering (lines 2858-2866). The TabsContent is correctly guarded by `isAdminFromContext`, but there's no way to click to that tab because the trigger button was removed.

**Fix**: Add the Legal tab trigger back to the TabsList, conditionally rendered for admin users only:
```typescript
{isAdminFromContext && (
  <TabsTrigger value="legal" className="gap-1 text-xs sm:text-sm">
    <ShieldCheck className="w-3 h-3" />
    {t('tabLegal')}
  </TabsTrigger>
)}
```

**Grid Adjustment**: When admin, grid should be 8 columns; when non-admin, 7 columns.

### Issue 2: Prep Tab Content Not Translated

**Root Cause**: The `generate-book-v2` edge function does NOT receive the user's language preference. The prompts for `kdp-description`, `kdp-subtitle`, and `kdp-keywords` modes are all in English with no language instruction.

**Fix**: 
1. Pass `language` from `KdpPrepDashboard` to the edge function calls
2. Update the edge function prompts to include language-specific instructions

**Files**:
- `src/components/KdpPrepDashboard.tsx` - Pass language in API calls
- `supabase/functions/generate-book-v2/index.ts` - Add language parameter to prompts

### Issue 3: Back Cover Default Content in English

**Root Cause**: The default back cover text is hardcoded in `BookCover.tsx`:
```typescript
const [backCoverTitle, setBackCoverTitle] = useState("Created with Loom & Page");
const [backCoverBody, setBackCoverBody] = useState("This book was brought to life using Loom & Page...");
const [backCoverCTA, setBackCoverCTA] = useState("Create yours at www.LoomandPage.com");
```

**Fix**: Use translation keys for the default values:
```typescript
const [backCoverTitle, setBackCoverTitle] = useState(t('backCoverDefaultTitle'));
const [backCoverBody, setBackCoverBody] = useState(t('backCoverDefaultBody'));
const [backCoverCTA, setBackCoverCTA] = useState(t('backCoverDefaultCta'));
```

**Note**: Since `useState` is called at component initialization and `t()` needs to update when language changes, we'll need to use `useEffect` to update these values when language changes.

---

## User's Strategic Question: Legal Tab vs. Future Multi-Language Support

**Question**: "This isn't a problem if the images and text information will be 100% the same when I create this guide in English or when we add that feature (future state) to take an English book and convert it into all the languages and save into our database."

**Answer**: For the **Legal tab** specifically (Copyright & Hallucination Defense scanner), the content is **100% language-agnostic**:
- It scans the book's AI-generated content for potential copyright issues
- The analysis logic works on any language input
- The output report structure is the same regardless of language

**Recommendation**: Keep the Legal tab as English-only UI since:
1. It's admin-only (not customer-facing)
2. The functionality is identical regardless of book language
3. For a future "convert English book to other languages" feature, the Legal scan would run post-conversion on each translated version

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/LanguageContext.tsx` | Add 3 new translation keys for back cover defaults × 8 languages |
| `src/components/BookCover.tsx` | 1) Fix Legal tab trigger for admin 2) Dynamic grid columns 3) Translate back cover defaults |
| `src/components/KdpPrepDashboard.tsx` | Pass language to generate-book-v2 edge function calls |
| `supabase/functions/generate-book-v2/index.ts` | Add language parameter to KDP description/subtitle/keywords prompts |

---

## Technical Details

### LanguageContext.tsx - New Keys

```typescript
// Back Cover Defaults
backCoverDefaultTitle: 'Created with Loom & Page',
backCoverDefaultBody: 'This book was brought to life using Loom & Page, the advanced AI platform that turns ideas into professional-grade books in minutes. Whether you\'re exploring a new passion, documenting history, or planning your next adventure, we help you weave your curiosity into reality.',
backCoverDefaultCta: 'Create yours at www.LoomandPage.com',
```

### French Example
```typescript
fr: {
  backCoverDefaultTitle: 'Créé avec Loom & Page',
  backCoverDefaultBody: 'Ce livre a été créé avec Loom & Page, la plateforme IA avancée qui transforme les idées en livres professionnels en quelques minutes. Que vous exploriez une nouvelle passion, documentiez l\'histoire ou planifiez votre prochaine aventure, nous vous aidons à tisser votre curiosité en réalité.',
  backCoverDefaultCta: 'Créez le vôtre sur www.LoomandPage.com',
}
```

### BookCover.tsx - Legal Tab Fix

```typescript
// Dynamic grid columns based on admin status
<TabsList className={`grid w-full ${isAdminFromContext ? 'grid-cols-8' : 'grid-cols-7'}`}>
  {/* ... existing 7 tabs ... */}
  {isAdminFromContext && (
    <TabsTrigger value="legal" className="gap-1 text-xs sm:text-sm">
      <ShieldCheck className="w-3 h-3" />
      {t('tabLegal')}
    </TabsTrigger>
  )}
</TabsList>
```

### BookCover.tsx - Back Cover Language Reactivity

```typescript
// Initialize with defaults
const [backCoverTitle, setBackCoverTitle] = useState("");
const [backCoverBody, setBackCoverBody] = useState("");
const [backCoverCTA, setBackCoverCTA] = useState("");

// Update when language changes (or on first render)
useEffect(() => {
  if (!backCoverTitle) setBackCoverTitle(t('backCoverDefaultTitle'));
  if (!backCoverBody) setBackCoverBody(t('backCoverDefaultBody'));
  if (!backCoverCTA) setBackCoverCTA(t('backCoverDefaultCta'));
}, [t]); // Re-run when translation function changes (language switch)
```

### KdpPrepDashboard.tsx - Pass Language

```typescript
import { useLanguage } from '@/contexts/LanguageContext';

const KdpPrepDashboard = ({ ... }) => {
  const { t, language } = useLanguage(); // Get current language code
  
  // Pass language to API calls
  const generateDescription = async () => {
    const { data, error } = await supabase.functions.invoke('generate-book-v2', {
      body: {
        mode: 'kdp-description',
        title,
        topic,
        subtitle: localSubtitle,
        bookData,
        language, // Add this
      },
    });
    // ...
  };
};
```

### generate-book-v2/index.ts - Language-Aware Prompts

```typescript
// KDP Description Mode
if (mode === 'kdp-description') {
  const languageInstruction = language && language !== 'en' 
    ? `\n\nCRITICAL: Write the entire description in ${getLanguageName(language)}. Do NOT write in English.`
    : '';
    
  const prompt = `You are a bestselling Amazon book marketing expert...
${languageInstruction}

Book Title: "${title}"
...`;
}
```

---

## Layout Preservation Guarantee

**CRITICAL**: All changes will preserve existing layout, spacing, and formatting:
- Back cover preview dimensions unchanged
- Text flow and positioning unchanged
- Only the text CONTENT will be translated
- No CSS or structural changes to the back cover component

---

## Testing Checklist

1. **Switch to French** as Admin:
   - Verify Legal tab appears (8 tabs total)
   - Click Legal tab to confirm it works
2. **Switch to French** as Guest/Paid:
   - Verify Legal tab is hidden (7 tabs total)
3. **Open Cover Studio → Back tab**:
   - Verify default text shows in French
   - Verify layout is identical to English
4. **Open Cover Studio → Prep tab**:
   - Wait for auto-generation
   - Verify description, keywords are in French
   - Verify no layout changes
5. **Test all 8 languages** for consistency
