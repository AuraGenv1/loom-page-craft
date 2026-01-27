
# Plan: Improve Image Relevance for Book Generation

## Problem Analysis

The current image search system has a fundamental **relevance problem**:

1. **AI-Generated Queries Are Too Abstract**: The `generate-chapter-blocks` function asks the AI to create "literal visual descriptions" for image queries (e.g., "A soaring eagle against a blue sky"), but these prompts are often:
   - Too metaphorical (not grounded in the actual book topic)
   - Missing geographic context (a London book might get "ancient ruins at sunset" which returns Hawaiian temples)
   - Not anchored to the specific chapter content

2. **No Topic Grounding**: The `fetch-book-images` and `search-book-images` functions search exactly what the AI requested without any awareness of the **book's overall topic**. So a query like "modern architecture sunset" for a London travel guide might return buildings from Dubai or Tokyo.

3. **Keyword-Only Search**: Unsplash and Wikimedia are keyword-based - they don't understand semantic intent. A query for "peak indulgence" (Aspen book subtitle) returns random results because those words aren't descriptive of actual imagery.

---

## Proposed Solution: Context-Aware Image Search

### Strategy 1: Topic Anchoring (Primary Fix)

Automatically prepend the book's main topic/location to every image search query to ground results geographically and topically.

**Current flow:**
```
AI Query: "Modern glass skyscraper from below"
→ Unsplash Search: "Modern glass skyscraper from below"
→ Results: Buildings from anywhere in the world
```

**Proposed flow:**
```
Book Topic: "London Travel Guide"
AI Query: "Modern glass skyscraper from below"
→ Processed Query: "London Modern glass skyscraper from below"
→ Results: London buildings (The Shard, Gherkin, etc.)
```

### Strategy 2: AI Query Enhancement (Secondary Fix)

Use Gemini to rewrite vague/abstract image queries into specific, searchable terms grounded in the book context.

**Example:**
```
Book Topic: "Aspen Luxury Travel Guide"
Original Query: "Peak indulgence atmosphere"
→ AI Rewrites: "Aspen Colorado ski lodge interior fireplace"
→ Results: Relevant Aspen imagery
```

### Strategy 3: Cover Image Intelligence

The cover image generation (`generate-cover-image`) uses Pexels but doesn't leverage the same topic-grounding. We'll unify it with the Unsplash/Wikimedia engine and apply topic anchoring.

---

## Technical Changes

### 1. Update `fetch-book-images` Edge Function

Add a new `bookTopic` parameter that gets prepended to search queries:

```typescript
// New parameter in request body
const { query, orientation, excludeUrls, bookTopic } = await req.json();

// Topic anchoring logic
function anchorQueryToTopic(query: string, topic: string | undefined): string {
  if (!topic) return query;
  
  // Extract location from topic (e.g., "London" from "London Travel Guide")
  const location = extractLocation(topic);
  
  // Prepend location/topic to query for geographic grounding
  if (location && !query.toLowerCase().includes(location.toLowerCase())) {
    return `${location} ${query}`;
  }
  
  return query;
}
```

### 2. Update `search-book-images` Edge Function

Apply the same topic-anchoring logic to the Search Gallery so manual searches also get context.

### 3. Update `generate-chapter-blocks` Edge Function

Improve the AI prompt to generate more specific, searchable image queries:

```
RULE 6: LITERAL VISUAL QUERIES (Image Queries)
- CRITICAL: Every image query MUST include the book's topic/location.
- For a "London Travel Guide", use "London Big Ben at sunset" NOT just "Historic clock tower at sunset"
- For an "Aspen Ski Guide", use "Aspen Colorado ski slopes" NOT just "Snowy mountain slopes"
- Always include the primary subject (place name, topic) in the query.
```

### 4. Update PageViewer.tsx

Pass the book topic to the `fetch-book-images` call:

```typescript
const { data, error } = await supabase.functions.invoke('fetch-book-images', {
  body: { 
    query: content.query,
    orientation: 'landscape',
    excludeUrls,
    bookTopic: topic, // NEW: Pass book topic for anchoring
  }
});
```

### 5. Update BookCover.tsx

Apply the same topic-anchoring to cover image searches.

### 6. Update ImageSearchGallery.tsx

Pass book topic context to the gallery search so user manual searches are also grounded.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/fetch-book-images/index.ts` | Add topic anchoring logic, location extraction |
| `supabase/functions/search-book-images/index.ts` | Add topic anchoring for gallery searches |
| `supabase/functions/generate-chapter-blocks/index.ts` | Update AI prompt to require topic in queries |
| `src/components/PageViewer.tsx` | Pass `topic` prop to fetch-book-images calls |
| `src/components/BookCover.tsx` | Pass topic to image searches |
| `src/components/ImageSearchGallery.tsx` | Accept and use `bookTopic` prop |

---

## Expected Outcome

**Before:**
- Query: "Modern architecture sunset" for London book
- Results: Random skyscrapers from Dubai, Tokyo, NYC

**After:**
- Query: "London Modern architecture sunset"
- Results: The Shard, Gherkin, Canary Wharf buildings

This should dramatically improve image relevance while keeping the existing infrastructure intact. Users who want to override can still manually search with any terms they prefer in the Search Gallery.

---

## Alternative Considered: Remove Auto-Images Entirely

If topic-anchoring doesn't provide sufficient improvement, we can also:
1. Disable auto-image generation entirely
2. Show placeholder boxes with "Add Image" buttons
3. Let users manually search/select every image

This would guarantee relevance (user chooses) but requires more user effort.
