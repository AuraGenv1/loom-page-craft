
# Plan: "Advanced Options" Panel with Smart Auto-Pilot Logic

## Summary

Transform the book generation experience from a simple search into a "Directed Experience" by adding an Advanced Options panel below the search input. Users can optionally define the **Voice**, **Structure**, and **Focus Areas** of their book. If they skip these options, the system will intelligently detect keywords in their input and auto-select appropriate defaults.

---

## Architecture Overview

```
+---------------------------+
|   SearchInput Component   |
+---------------------------+
            |
            v
+---------------------------+
| AdvancedOptions Component | (NEW - collapsible panel)
|---------------------------|
| [Network Icon] Advanced   |
|                           |
| VOICE: [Chip] [Chip]...   |
| STRUCTURE: [Chip] [Chip]  |
| FOCUS: [Chip] [Chip]...   |
+---------------------------+
            |
            v (on submit)
+---------------------------+
| Smart Auto-Pilot Logic    | (keyword detection if no manual selection)
+---------------------------+
            |
            v
+---------------------------+
| generate-book-blocks      | (Edge Function - receives voice/structure params)
+---------------------------+
```

---

## Part 1: Create AdvancedOptions Component

**New file: `src/components/AdvancedOptions.tsx`**

### Props Interface

```typescript
export interface AdvancedOptionsState {
  voice: 'insider' | 'bestie' | 'poet' | 'professor' | null;
  structure: 'curated' | 'playbook' | 'balanced' | null;
  focusAreas: string[]; // Multi-select: history, wellness, nightlife, art, luxury, culture, nature
}

interface AdvancedOptionsProps {
  options: AdvancedOptionsState;
  onChange: (options: AdvancedOptionsState) => void;
}
```

### UI Design

1. **Trigger Button**: Text-only button with a thread/weave icon (`Network` from Lucide - represents threads coming together)
   - Label: "Advanced Options"
   - Style: Minimalist, muted text color, no border

2. **Collapsible Panel**: Uses `Collapsible` from Radix

3. **Section A - Narrative Voice** (Single Select):
   - Chips: `The Insider`, `The Bestie`, `The Poet`, `The Professor`
   - Each chip has a tooltip on hover with the subtext
   - State: Inactive = `border-muted text-muted-foreground`, Active = `bg-foreground text-background`

4. **Section B - Book Structure** (Single Select):
   - Chips: `Curated Guide`, `Playbook`, `Balanced`
   - Tooltips explain focus areas

5. **Section C - Focus Areas** (Multi-Select):
   - Chips: `History`, `Wellness`, `Nightlife`, `Art & Design`, `Luxury`, `Local Culture`, `Nature`
   - Multiple can be selected (toggle behavior)

### Chip Styling (No emojis, text-only)

```tsx
// Inactive state
className="px-3 py-1.5 text-sm border border-muted rounded-full text-muted-foreground hover:border-foreground/50 transition-colors cursor-pointer"

// Active state
className="px-3 py-1.5 text-sm bg-foreground text-background rounded-full cursor-pointer"
```

---

## Part 2: Integrate into Index.tsx

### State Management

Add state in Index.tsx:

```typescript
const [advancedOptions, setAdvancedOptions] = useState<AdvancedOptionsState>({
  voice: null,
  structure: null,
  focusAreas: []
});
```

### Layout Integration

Position the AdvancedOptions component directly below SearchInput:

```tsx
{viewState === 'landing' && (
  <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center px-4">
    {/* ... heading ... */}
    <div className="w-full animate-fade-up animation-delay-200">
      <SearchInput onSearch={handleSearch} />
    </div>
    {/* NEW: Advanced Options Panel */}
    <div className="w-full max-w-2xl mx-auto mt-4 animate-fade-up animation-delay-250">
      <AdvancedOptions 
        options={advancedOptions} 
        onChange={setAdvancedOptions} 
      />
    </div>
    <p className="text-sm text-muted-foreground mt-8 animate-fade-up animation-delay-300">
      {t('searchExamples')}
    </p>
  </div>
)}
```

---

## Part 3: Smart Auto-Pilot Logic

**New file: `src/lib/autoPilot.ts`**

### Keyword Detection Function

```typescript
export interface AutoPilotResult {
  voice: 'insider' | 'bestie' | 'poet' | 'professor';
  structure: 'curated' | 'playbook' | 'balanced';
  detectedKeywords: string[];
}

export const detectAutoPilotSettings = (input: string): AutoPilotResult => {
  const lower = input.toLowerCase();
  let voice: AutoPilotResult['voice'] = 'insider'; // Default fallback
  let structure: AutoPilotResult['structure'] = 'balanced'; // Default fallback
  const detectedKeywords: string[] = [];

  // Structure Detection
  const playbookKeywords = ['how to', 'learn', 'steps', 'education', 'practice', 'guide to', 'tutorial', 'beginner'];
  const curatedKeywords = ['guide', 'travel', 'where to', 'best', 'stay', 'eat', 'visit', 'destination', 'trip'];

  for (const kw of playbookKeywords) {
    if (lower.includes(kw)) {
      structure = 'playbook';
      detectedKeywords.push(kw);
      break;
    }
  }

  if (structure !== 'playbook') {
    for (const kw of curatedKeywords) {
      if (lower.includes(kw)) {
        structure = 'curated';
        detectedKeywords.push(kw);
        break;
      }
    }
  }

  // Voice Detection
  const poetKeywords = ['romantic', 'love', 'dream', 'beautiful', 'enchanting', 'magical'];
  const bestieKeywords = ['fun', 'girls trip', 'party', 'weekend', 'brunch', 'vibes'];

  for (const kw of poetKeywords) {
    if (lower.includes(kw)) {
      voice = 'poet';
      detectedKeywords.push(kw);
      break;
    }
  }

  if (voice === 'insider') {
    for (const kw of bestieKeywords) {
      if (lower.includes(kw)) {
        voice = 'bestie';
        detectedKeywords.push(kw);
        break;
      }
    }
  }

  return { voice, structure, detectedKeywords };
};
```

### Integration in handleSearch

```typescript
const handleSearch = async (query: string) => {
  // Determine final options (manual or auto-pilot)
  let finalVoice = advancedOptions.voice;
  let finalStructure = advancedOptions.structure;
  
  if (!finalVoice || !finalStructure) {
    const autoPilot = detectAutoPilotSettings(query);
    if (!finalVoice) finalVoice = autoPilot.voice;
    if (!finalStructure) finalStructure = autoPilot.structure;
    console.log('[AutoPilot] Detected:', autoPilot);
  }

  // Include in API call
  const { data, error } = await supabase.functions.invoke('generate-book-blocks', {
    body: { 
      topic: query, 
      sessionId: currentSessionId, 
      language,
      voice: finalVoice,
      structure: finalStructure,
      focusAreas: advancedOptions.focusAreas
    }
  });
  // ... rest of handler
};
```

---

## Part 4: Backend Integration (Edge Function)

**File: `supabase/functions/generate-book-blocks/index.ts`**

### Add Voice & Structure to Prompt

Modify the request parsing:

```typescript
const { 
  topic, 
  sessionId, 
  language = 'en',
  voice = 'insider',      // NEW
  structure = 'balanced', // NEW
  focusAreas = []         // NEW
} = await req.json();
```

### Voice-to-Instruction Mapping

```typescript
const VOICE_INSTRUCTIONS: Record<string, string> = {
  insider: 'Write with high taste and authority. Avoid tourist clichés. Use an "IYKYK" (If you know, you know) tone. Focus on hidden gems and insider knowledge.',
  bestie: 'Write in a confident, sassy, female-forward voice. Treat the reader like a close friend. Use punchy, witty language and share genuine excitement.',
  poet: 'Use evocative, sensory-rich language. Focus on atmosphere, emotion, and beauty. Paint vivid word pictures that transport the reader.',
  professor: 'Write with academic authority and educational clarity. Use structured explanations, cite relevant background, and maintain an informative tone.'
};

const STRUCTURE_INSTRUCTIONS: Record<string, string> = {
  curated: 'Structure the content as a curated directory. Prioritize specific venues (Hotels, Restaurants, Shops) with address details, vibe checks, and insider recommendations.',
  playbook: 'Structure the content as an educational manual. Use clear steps, bullet points for "How-to" sections, and focus on practical, actionable instructions.',
  balanced: 'Balance educational content with curated recommendations. Mix teaching moments with specific venue suggestions for a well-rounded guide.'
};
```

### Inject into Gemini Prompt

Add these instructions to the prompt template:

```typescript
const prompt = `You are an elite "Luxury Book Architect." Create a structured book outline and Chapter 1 content for: "${cleanTopic}".

=== NARRATIVE VOICE ===
${VOICE_INSTRUCTIONS[voice]}

=== BOOK STRUCTURE ===
${STRUCTURE_INSTRUCTIONS[structure]}

${focusAreas.length > 0 ? `=== FOCUS AREAS ===
Emphasize these topics throughout the book: ${focusAreas.join(', ')}` : ''}

=== LUXURY ARCHITECT RULES ===
... (existing rules)
`;
```

---

## Part 5: Update generate-chapter-blocks

**File: `supabase/functions/generate-chapter-blocks/index.ts`**

The voice and structure should be stored with the book and passed to chapter generation for consistency.

### Option A: Store in books table

Add `voice` and `structure` columns to books table (simple TEXT fields).

### Option B: Pass through from client

For now, the simpler approach is to store these in the book record and retrieve them when generating subsequent chapters.

**Recommended approach**: Add `voice` and `structure` fields to the books table, populate them during book creation, then read them in generate-chapter-blocks.

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/components/AdvancedOptions.tsx` | **CREATE** | New component with collapsible panel, voice/structure/focus chips |
| `src/lib/autoPilot.ts` | **CREATE** | Keyword detection logic for Smart Auto-Pilot |
| `src/pages/Index.tsx` | MODIFY | Add state for advancedOptions, integrate AdvancedOptions component, update handleSearch |
| `supabase/functions/generate-book-blocks/index.ts` | MODIFY | Accept voice/structure/focusAreas params, inject into Gemini prompt |
| `supabase/functions/generate-chapter-blocks/index.ts` | MODIFY | Read voice/structure from book record, maintain consistency |

---

## Visual Design Reference

### Collapsed State (Default)
```
[========== Search Input ==========]

    [🔗] Advanced Options
```

### Expanded State
```
[========== Search Input ==========]

    [🔗] Advanced Options ▲

    Voice
    [The Insider] [The Bestie] [The Poet] [The Professor]
                      ↑ Active (solid black bg)

    Structure  
    [Curated Guide] [Playbook] [Balanced]
         ↑ Inactive (gray outline)

    Focus Areas
    [History] [Wellness] [Nightlife] [Art & Design]
    [Luxury] [Local Culture] [Nature]
      ↑ Multi-select (can select multiple)
```

### Chip States
```
INACTIVE:        [  History  ]  ← light gray border, gray text
ACTIVE:          [  History  ]  ← solid black bg, white text
HOVER:           [  History  ]  ← darker border, ready state
```

---

## Technical Notes

### Tooltip Implementation

Each Voice/Structure chip will have a tooltip (using Radix Tooltip) that appears on hover:

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <button className={chipClassName}>The Insider</button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Curated, cool, "If you know, you know"</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Icon Selection

Using `Network` from Lucide (represents threads/connections coming together) as the Advanced Options icon. Alternative options: `Sliders`, `Settings2`, `Combine`.

### Database Migration (Optional but Recommended)

To persist voice/structure settings with each book:

```sql
ALTER TABLE books 
ADD COLUMN voice TEXT DEFAULT 'insider',
ADD COLUMN structure TEXT DEFAULT 'balanced',
ADD COLUMN focus_areas TEXT[] DEFAULT '{}';
```

This ensures chapter generation maintains consistent voice across all chapters.
