
# Plan: Complete Translation System & Language Consistency Fix

## Summary

This plan addresses six distinct translation issues plus the core language inconsistency problem:

1. **Focus Area Labels & Tooltips**: Translate chip labels (History, Wellness, etc.) and tooltip descriptions
2. **Voice & Structure Labels**: Translate chip labels (The Insider, The Bestie, etc.)
3. **PageViewer Navigation Controls**: Translate "Prev", "Next", "Page Tools", "Chapter X of Y", "100%", "Fit"
4. **Block Labels in Content**: Ensure "KEY TAKEAWAY" and "PRO TIP" labels render translated
5. **AI Content Generation**: Fix the AI prompt to explicitly generate content IN the selected language
6. **Language Behavior Clarification**: Document that users SHOULD be able to search in ANY language and get results in their SELECTED website language

---

## Root Cause Analysis

### Issue 1: Focus Area Labels Still in English
Looking at `AdvancedOptions.tsx` lines 32-39:
```typescript
const FOCUS_OPTIONS = [
  { id: 'history', label: 'History', tooltipKey: 'tooltip_history' },
  // ...
```
The `label` property is hardcoded in English. The tooltip uses `t(tooltipKey)` which works, but the chip display uses `{focus.label}` directly (line 166), not a translation.

### Issue 2: Voice & Structure Labels Still in English
Same issue - lines 19-30:
```typescript
const VOICE_OPTIONS = [
  { id: 'insider', label: 'The Insider', tooltipKey: 'tooltip_insider' },
```
The labels are hardcoded and displayed directly via `{voice.label}` (line 110).

### Issue 3: Navigation Controls Hardcoded
In `PageViewer.tsx` lines 2370-2571, all navigation text is hardcoded:
- Line 2371: `Prev`
- Line 2380: `Page Tools`
- Line 2536: `Fit` / `100%`
- Line 2544: `of {totalPageCount}`
- Line 2548: `Chapter {currentChapter} of {totalChapters}`
- Line 2559: `Next`

### Issue 4: AI Content Not Generated in Target Language
The edge functions include `Language: ${language}` at the end of the prompt, but this is insufficient. The AI often ignores it because:
1. It's placed at the very end as a footnote
2. There's no explicit instruction saying "ALL content MUST be written in {language}"
3. The prompt examples are in English, so the AI mimics that

### Issue 5: Key Takeaway / Pro Tip Labels
These are handled in `BlockRenderer` which receives `proTipLabel` and `keyTakeawayLabel` props. Need to verify these are being passed and used correctly.

---

## Solution Design

### Part 1: Add Translation Keys for All UI Labels

Add to `LanguageContext.tsx` for all 8 languages:

**Focus Area Labels:**
- `focus_history`, `focus_wellness`, `focus_nightlife`, `focus_art`, `focus_luxury`, `focus_culture`, `focus_nature`

**Voice Labels:**
- `voice_insider`, `voice_bestie`, `voice_poet`, `voice_professor`

**Structure Labels:**
- `structure_curated`, `structure_playbook`, `structure_balanced`

**Navigation Controls:**
- `prev`, `next`, `pageTools`, `fit`, `fullSize`, `pageOf`, `chapterOf`

---

### Part 2: Update AdvancedOptions.tsx

Change all options arrays to use translation keys for labels:

```typescript
const FOCUS_OPTIONS = [
  { id: 'history', labelKey: 'focus_history', tooltipKey: 'tooltip_history' },
  { id: 'wellness', labelKey: 'focus_wellness', tooltipKey: 'tooltip_wellness' },
  // ...
];

// In render:
{t(focus.labelKey)}
```

Same for `VOICE_OPTIONS` and `STRUCTURE_OPTIONS`.

---

### Part 3: Update PageViewer.tsx Navigation

Import `useLanguage` and use translation keys:

```typescript
const { t } = useLanguage();

// Navigation buttons:
<Button>
  <ChevronLeft />
  {t('prev')}
</Button>

<span>{t('pageTools')}</span>

<span>{zoomMode === '100%' ? t('fit') : '100%'}</span>

<p>
  {cumulativePageNumber}
  <span> {t('pageOf')} {totalPageCount}</span>
</p>

<p>
  {t('chapterOf').replace('{current}', String(currentChapter)).replace('{total}', String(totalChapters))}
</p>

<Button>
  {t('next')}
  <ChevronRight />
</Button>
```

---

### Part 4: Fix AI Content Generation Language

Update both edge functions to include EXPLICIT language instructions:

**In `generate-book-blocks/index.ts`:**
```typescript
const languageInstruction = language !== 'en' 
  ? `\n\n=== CRITICAL: LANGUAGE REQUIREMENT ===
WRITE ALL CONTENT IN ${languageName}. This includes:
- The main_title and subtitle
- All chapter titles
- All text block content
- All image captions
- All pro tip content
The ONLY exception is proper nouns (place names, hotel names, etc.) which should remain in their original form.
DO NOT write in English. The reader speaks ${languageName}.`
  : '';
```

Add a language name mapping:
```typescript
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  it: 'Italian (Italiano)',
  pt: 'Portuguese (Português)',
  zh: 'Chinese (中文)',
  ja: 'Japanese (日本語)',
};
```

---

### Part 5: Language Behavior Decision

**Recommended Approach**: The website language selector determines the OUTPUT language, regardless of what the user types in the search bar.

This means:
- User selects French (FR) on the website
- User types "Tokyo" in the search bar (English)
- The book is generated ENTIRELY in French

This is the most intuitive UX because:
1. The language selector sets the user's preferred language
2. The search query is just a topic - topics can be in any language
3. Travelers often search for destinations in their native language

**Implementation**: The current architecture already passes `language` to the edge functions. We just need to strengthen the prompt to make the AI actually follow it.

---

## Files Summary

| File | Changes |
|------|---------|
| `src/contexts/LanguageContext.tsx` | Add ~25 new translation keys per language (focus labels, voice labels, structure labels, navigation) |
| `src/components/AdvancedOptions.tsx` | Use `t(labelKey)` for all chip labels instead of hardcoded strings |
| `src/components/PageViewer.tsx` | Import `useLanguage`, translate all navigation control text |
| `supabase/functions/generate-book-blocks/index.ts` | Add explicit language instruction block to AI prompt |
| `supabase/functions/generate-chapter-blocks/index.ts` | Add explicit language instruction block to AI prompt |

---

## New Translation Keys Required

### English (baseline)
```typescript
// Focus Area Labels
focus_history: 'History',
focus_wellness: 'Wellness',
focus_nightlife: 'Nightlife',
focus_art: 'Art & Design',
focus_luxury: 'Luxury',
focus_culture: 'Local Culture',
focus_nature: 'Nature',

// Voice Labels
voice_insider: 'The Insider',
voice_bestie: 'The Bestie',
voice_poet: 'The Poet',
voice_professor: 'The Professor',

// Structure Labels
structure_curated: 'Curated Guide',
structure_playbook: 'Playbook',
structure_balanced: 'Balanced',

// Navigation
prev: 'Prev',
next: 'Next',
pageTools: 'Page Tools',
fit: 'Fit',
fullSize: '100%',
pageOf: 'of',
chapterOf: 'Chapter {current} of {total}',
```

### French Example
```typescript
// Focus Area Labels
focus_history: 'Histoire',
focus_wellness: 'Bien-être',
focus_nightlife: 'Vie Nocturne',
focus_art: 'Art & Design',
focus_luxury: 'Luxe',
focus_culture: 'Culture Locale',
focus_nature: 'Nature',

// Voice Labels
voice_insider: "L'Initié",
voice_bestie: "L'Ami(e)",
voice_poet: 'Le Poète',
voice_professor: 'Le Professeur',

// Structure Labels
structure_curated: 'Guide Sélectionné',
structure_playbook: 'Manuel Pratique',
structure_balanced: 'Équilibré',

// Navigation
prev: 'Préc',
next: 'Suiv',
pageTools: 'Outils de Page',
fit: 'Ajuster',
fullSize: '100%',
pageOf: 'sur',
chapterOf: 'Chapitre {current} sur {total}',
```

---

## AI Prompt Enhancement

Add this block near the TOP of the prompt (after the voice/structure instructions):

```typescript
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
};

const languageName = LANGUAGE_NAMES[language] || 'English';

const languageInstruction = language !== 'en' 
  ? `
=== CRITICAL: LANGUAGE REQUIREMENT ===
You MUST write ALL content in ${languageName}. This is mandatory.
- main_title: Write in ${languageName}
- subtitle: Write in ${languageName}
- All chapter titles: Write in ${languageName}
- All text block content: Write in ${languageName}
- All image captions: Write in ${languageName}
- All pro_tip content: Write in ${languageName}

The ONLY exceptions are:
- Proper nouns (hotel names, restaurant names, landmark names) - keep in original language
- Technical terms with no good translation

DO NOT default to English. The reader understands ${languageName}.
`
  : '';
```

Then include `${languageInstruction}` right after the structure instructions in the prompt.

---

## Visual Changes After Fix

### Advanced Options (After Fix - French Website)
```
[  v Options Avancées ]

       VOIX NARRATIVE
[L'Initié] [L'Ami(e)] [Le Poète] [Le Professeur]
   ^hover: "Sélectionné, cool, 'Entre connaisseurs'"

       STRUCTURE DU LIVRE
[Guide Sélectionné] [Manuel Pratique] [Équilibré]

       DOMAINES DE FOCUS
[Histoire] [Bien-être] [Vie Nocturne] [Art & Design]
   ^hover: "Histoires anciennes, sites patrimoniaux..."
```

### PageViewer Navigation (After Fix - French)
```
[ Préc ]    🛠 Outils de Page    📐 Ajuster    42 sur 112    [ Suiv ]
                                              Chapitre 3 sur 12
```

### Generated Book Content (After Fix - French Website)
Title, subtitle, chapter titles, all text content, and captions will be in French, regardless of search query language.

---

## Testing Checklist

1. **Focus Areas**: Switch to French, hover over each Focus Area chip - verify label AND tooltip are in French
2. **Voice/Structure**: Verify all chip labels translate correctly
3. **Navigation**: Navigate through a book in French - verify Prev/Next/Page Tools/Chapter text
4. **Content Generation**: 
   - Set website to French
   - Search "Tokyo" (in English)
   - Verify the generated book title, subtitle, chapters, and all content is in French
5. **Key Takeaway/Pro Tip**: Navigate to pages with these blocks - verify labels are translated
6. **All 8 Languages**: Repeat core tests for each supported language
