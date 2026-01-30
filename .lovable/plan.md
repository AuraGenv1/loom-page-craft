
# Plan: Comprehensive Translation System Fix

## Summary

This plan addresses multiple translation gaps and a critical crash bug identified across the application:

1. **Focus Area Tooltips**: Add translations for all 7 tooltip descriptions in 8 languages
2. **Weaving Process Steps**: Translate the 5 loading animation stages
3. **Book Content Language**: Ensure language is properly passed to chapter generation (language IS being passed - investigating crash)
4. **Chapter Status Labels**: Translate "Reading", "Expand", "Drafting", "Pending" in Table of Contents
5. **Block Labels**: Translate "KEY TAKEAWAY" and "PRO TIP" labels in PageViewer
6. **Download Button Text**: Translate "Download Full Guide (PDF)" and related text
7. **Footer AI Disclaimer**: Translate the AI-generated content disclaimer (keep Privacy/Terms/FAQ links in English)
8. **Critical Crash Bug**: Investigate and fix the chapter navigation crash that resets to homepage

---

## Issue Analysis

### Current Translation Architecture
The app uses `LanguageContext.tsx` with a `translations` object containing key-value pairs for 8 languages. The `t()` function returns the translation or falls back to English, then to the key itself.

### Missing Translation Keys Identified

| Location | Current Text (English) | Translation Key Needed |
|----------|----------------------|----------------------|
| AdvancedOptions.tsx | Focus Area tooltips | `tooltip_history`, `tooltip_wellness`, etc. |
| LoadingAnimation.tsx | "Gathering threads..." | `weaving_step1`, `weaving_step2`, etc. |
| TableOfContents.tsx | "Reading", "Expand", "Drafting", "Pending" | `status_reading`, `status_expand`, etc. |
| PageViewer.tsx | "KEY TAKEAWAY", "PRO TIP" | `keyTakeaway`, `proTip` |
| ProgressDownloadButton.tsx | "Download Full Guide (PDF)" | `downloadFullGuide` |
| Footer.tsx | AI disclaimer text | `aiDisclaimer` |

### Critical Bug Investigation
The crash when navigating to Chapter 2+ that reverts content to English and crashes to homepage suggests:
- The `language` variable might not be available or reset during navigation
- A React error boundary or uncaught exception is forcing a navigation reset
- State corruption during chapter hydration

---

## Files to Modify

### 1. `src/contexts/LanguageContext.tsx`
Add the following new translation keys to all 8 languages:

**Focus Area Tooltips:**
- `tooltip_history`: Ancient stories, heritage sites, and cultural timelines
- `tooltip_wellness`: Spas, retreats, meditation, and self-care rituals
- `tooltip_nightlife`: Bars, clubs, live music, and after-dark scenes
- `tooltip_art`: Galleries, architecture, studios, and creative spaces
- `tooltip_luxury`: High-end experiences, exclusive venues, and premium services
- `tooltip_culture`: Traditions, local customs, food markets, and community life
- `tooltip_nature`: Parks, hiking trails, beaches, and outdoor adventures

**Weaving Process Steps:**
- `weaving_step1`: Gathering threads...
- `weaving_step2`: Setting up the loom...
- `weaving_step3`: Weaving chapters...
- `weaving_step4`: Adding finishing touches...
- `weaving_step5`: Almost ready...

**Chapter Status Labels:**
- `status_reading`: Reading
- `status_expand`: Expand
- `status_drafting`: Drafting...
- `status_pending`: Pending
- `status_locked`: Locked
- `chapters`: Chapters

**Block Labels:**
- `keyTakeaway`: KEY TAKEAWAY
- `proTip`: PRO TIP

**Download/Progress:**
- `downloadFullGuide`: Download Full Guide (PDF)
- `generatingPdf`: Generating PDF...
- `weavingPages`: Weaving... {count} pages
- `pleaseWaitChapters`: Please wait for all chapters...
- `artisanWeaving`: Our Artisan is weaving your custom details...

**Footer:**
- `aiDisclaimer`: AI-generated content for creative inspiration only. Not professional advice.

---

### 2. `src/components/AdvancedOptions.tsx`
Update FOCUS_OPTIONS to use translated tooltips:

```typescript
const FOCUS_OPTIONS = [
  { id: 'history', label: 'History', tooltipKey: 'tooltip_history' },
  { id: 'wellness', label: 'Wellness', tooltipKey: 'tooltip_wellness' },
  // ... etc
];

// In render:
<TooltipContent>
  <p className="text-xs">{t(focus.tooltipKey)}</p>
</TooltipContent>
```

---

### 3. `src/components/LoadingAnimation.tsx`
Update stages to use translation keys:

```typescript
const stages = [
  { progress: 15, key: 'weaving_step1' },
  { progress: 35, key: 'weaving_step2' },
  { progress: 55, key: 'weaving_step3' },
  { progress: 75, key: 'weaving_step4' },
  { progress: 90, key: 'weaving_step5' },
];

// In effect:
setStatusText(t(stages[currentStage].key));
```

---

### 4. `src/components/TableOfContents.tsx`
Add useLanguage hook and translate status labels:

```typescript
import { useLanguage } from '@/contexts/LanguageContext';

// In component:
const { t } = useLanguage();

// Replace hardcoded strings:
<span>... {t('status_drafting')}</span>  // was "Drafting..."
<span>... {t('status_pending')}</span>   // was "Pending"
<span>... {t('status_expand')}</span>    // was "Expand →"
<span>... {t('status_reading')}</span>   // was "Reading"
<span>... {t('status_locked')}</span>    // was "Locked"
<span>... {t('chapters')}</span>         // was "Chapters"
```

---

### 5. `src/components/PageViewer.tsx`
Update ProTipPage and KeyTakeawayPage to use translations:

```typescript
// ProTipPage - needs language context passed via props or hook
<p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground">
  {t('proTip')}  // was "PRO TIP"
</p>

// KeyTakeawayPage
<p className="text-xs font-bold tracking-[0.2em] uppercase text-primary mb-3">
  {t('keyTakeaway')}  // was "KEY TAKEAWAY"
</p>
```

Note: PageViewer is a large component - we'll need to either:
- Pass `t` function as a prop to these sub-components
- Or create a context consumer inside each component

---

### 6. `src/components/ProgressDownloadButton.tsx`
Add useLanguage hook and translate labels:

```typescript
import { useLanguage } from '@/contexts/LanguageContext';

const { t } = useLanguage();

const getLabel = () => {
  if (isCompiling) return t('generatingPdf');
  if (isPurchased && !isComplete) {
    if (totalPageCount && totalPageCount > 0) {
      return t('weavingPages').replace('{count}', String(totalPageCount));
    }
    return `${t('weaving')} ${completedChapters}/${totalChapters}`;
  }
  return t('downloadFullGuide');
};

// Status text:
{isPurchased ? t('pleaseWaitChapters') : t('artisanWeaving')}
```

---

### 7. `src/components/Footer.tsx`
Add useLanguage hook for AI disclaimer (keep links in English as requested):

```typescript
import { useLanguage } from '@/contexts/LanguageContext';

const { t } = useLanguage();

// Disclaimer:
<p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
  {t('aiDisclaimer')}
</p>

// Links remain in English:
<Link to="/privacy">Privacy Policy</Link>
<Link to="/terms">Terms of Service</Link>
<Link to="/faq">FAQ</Link>
```

---

## Issue 8: Critical Crash Bug Investigation

### Symptoms
- Reading a book in a non-English language
- Navigating to Chapter 2 causes text to revert to English
- Clicking next page crashes and redirects to homepage (in English)

### Root Cause Hypothesis
1. **Language prop not persisted to chapter generation**: The `language` variable from `useLanguage()` is used during initial book generation but may not be stored in the database. When Chapter 2 is generated via the daisy-chain, it may not have the original language available.

2. **Race condition in chapter hydration**: The `fetchBlocks` function might throw an error when blocks are malformed or missing, causing React to unmount and navigate away.

3. **State corruption**: The `setBlocks` or `setCurrentChapter` calls might cause a re-render cascade that loses context.

### Investigation Steps
1. Check if `language` is stored in the `books` table and passed to subsequent chapter generation calls
2. Add error boundaries around PageViewer to catch crashes
3. Add logging to `goToPrevChapter` and `goToNextChapter` to trace the crash

### Potential Fix
Store the language in the `books` table during initial creation:

```sql
-- Add language column to books table
ALTER TABLE books ADD COLUMN language text DEFAULT 'en';
```

Then in `generate-book-blocks`:
```typescript
// Save language to DB
await supabase.from('books').update({ language }).eq('id', bookId);
```

And in `Index.tsx` daisy-chain:
```typescript
// Retrieve language from bookData instead of context
const bookLanguage = bookData?.language || language;
```

---

## Translation Examples (French)

Here are the translations for French as an example:

```typescript
fr: {
  // ... existing keys ...
  
  // Focus Area Tooltips
  tooltip_history: 'Histoires anciennes, sites patrimoniaux et chronologies culturelles',
  tooltip_wellness: 'Spas, retraites, méditation et rituels de bien-être',
  tooltip_nightlife: 'Bars, clubs, musique live et scènes nocturnes',
  tooltip_art: 'Galeries, architecture, studios et espaces créatifs',
  tooltip_luxury: 'Expériences haut de gamme, lieux exclusifs et services premium',
  tooltip_culture: 'Traditions, coutumes locales, marchés alimentaires et vie communautaire',
  tooltip_nature: 'Parcs, sentiers de randonnée, plages et aventures en plein air',
  
  // Weaving Steps
  weaving_step1: 'Rassemblement des fils...',
  weaving_step2: 'Installation du métier à tisser...',
  weaving_step3: 'Tissage des chapitres...',
  weaving_step4: 'Ajout des touches finales...',
  weaving_step5: 'Presque prêt...',
  
  // Chapter Status
  status_reading: 'Lecture',
  status_expand: 'Développer',
  status_drafting: 'Rédaction...',
  status_pending: 'En attente',
  status_locked: 'Verrouillé',
  chapters: 'Chapitres',
  
  // Block Labels
  keyTakeaway: 'POINT CLÉ',
  proTip: 'CONSEIL PRO',
  
  // Download
  downloadFullGuide: 'Télécharger le Guide Complet (PDF)',
  generatingPdf: 'Génération du PDF...',
  weavingPages: 'Tissage... {count} pages',
  pleaseWaitChapters: 'Veuillez patienter pour tous les chapitres...',
  artisanWeaving: 'Notre Artisan tisse vos détails personnalisés...',
  
  // Footer
  aiDisclaimer: 'Contenu généré par IA pour inspiration créative uniquement. Ce n\'est pas un conseil professionnel.',
}
```

---

## Files Summary

| File | Changes |
|------|---------|
| `src/contexts/LanguageContext.tsx` | Add ~50 new translation keys across 8 languages |
| `src/components/AdvancedOptions.tsx` | Use `t()` for Focus Area tooltips |
| `src/components/LoadingAnimation.tsx` | Use `t()` for weaving stage text |
| `src/components/TableOfContents.tsx` | Add `useLanguage` hook, translate status labels |
| `src/components/PageViewer.tsx` | Pass translation function to block components |
| `src/components/ProgressDownloadButton.tsx` | Add `useLanguage` hook, translate button text |
| `src/components/Footer.tsx` | Add `useLanguage` hook, translate AI disclaimer |
| Database (optional) | Add `language` column to `books` table for crash fix |

---

## Testing Checklist

After implementation:
1. Switch to each of the 8 languages and verify:
   - Focus Area tooltips display correctly
   - Weaving animation text is translated
   - Table of Contents status labels are translated
   - "KEY TAKEAWAY" and "PRO TIP" blocks show translated labels
   - Download button text is translated
   - Footer disclaimer is translated (links remain English)
2. Generate a book in French/Spanish/etc. and navigate through all chapters
3. Verify no crash occurs when moving between chapters in non-English languages
4. Confirm the language persists throughout the reading experience
