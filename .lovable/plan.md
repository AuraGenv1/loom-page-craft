
# Plan: Preserve Book View & Upgrade KDP Prep Tab

This plan addresses two related issues:
1. **Session Persistence Bug**: Books disappear when auth state changes
2. **KDP Prep Tab Enhancements**: Auto-generation, rich text preview, smart keywords

---

## Part 1: Preserve Book View During Session Changes

### Problem Summary
Once a book is generated, the application unexpectedly returns to the landing page when:
- A Supabase auth session times out or fails to refresh
- The browser regains focus and triggers an auth state re-check
- Any re-render causes the effect at lines 227-236 to detect `user === null`

### Root Cause
The code at lines 227-236 in `src/pages/Index.tsx` treats "no authenticated user" as a signal to reset the entire UI:

```typescript
if (!user) {
  setViewState('landing');  // Forces home page
  setBookData(null);        // Clears book
  setBookId(null);          // Clears ID
  // ...
}
```

This runs on **every** change to `user` or `authLoading`, not just on initial mount.

### Solution: "Once Generated, Stay Generated"

Add an `isInitialMount` ref to distinguish first load from subsequent auth state changes. Only reset to landing on fresh page loads, not when the user is already viewing content.

### Technical Changes

**File: `src/pages/Index.tsx`**

| Change | Description |
|--------|-------------|
| Add `isInitialMount` ref | Track whether component is mounting for first time |
| Guard the reset logic | Check if `viewState === 'book'` before resetting |
| Mark initial mount complete | Set ref to `false` after first load completes |

---

## Part 2: Upgrade KDP Prep Tab

### Feature 1: Auto-Generate on Load (Zero-Click)

When the KDP Prep tab opens, if Description, Subtitle, or Keywords are empty, automatically trigger AI generation for all of them.

**Implementation:**
- Add a `useEffect` with an `hasInitialized` ref to prevent duplicate calls
- Check if fields are empty on mount
- If empty, call all three generation functions in parallel
- Show `WeavingLoader` component with "Preparing Amazon metadata..." text

**File: `src/components/KdpPrepDashboard.tsx`**

```text
Current State:
- User must manually click 3 buttons to populate fields

After Change:
- On tab open: check empty fields
- If empty: show WeavingLoader, call all 3 APIs in parallel
- When complete: hide loader, show populated fields
```

### Feature 2: Rich Text Description Mode (WYSIWYG Preview)

Replace the raw HTML textarea with a dual-mode view: users see formatted text but copy raw HTML.

**Implementation Approach:**
- Use `dangerouslySetInnerHTML` for the preview (the content is AI-generated, not user-input)
- Add a toggle between "Preview" and "Edit" modes
- Create a styled container that renders `<b>`, `<i>`, `<ul>`, `<li>` tags correctly
- Keep the "Copy to Clipboard" button copying the raw HTML string

**UI Layout:**

```text
┌─────────────────────────────────────────────────┐
│  Book Description                    [Preview ▼]│
├─────────────────────────────────────────────────┤
│                                                 │
│  Are you ready to transform your life?          │
│                                                 │
│  • Discover the secrets of success              │
│  • Learn step-by-step techniques                │
│  • Master the art of productivity               │
│                                                 │
│  This book will change everything...            │
│                                                 │
├─────────────────────────────────────────────────┤
│  [✨ Write Description]  [📋 Copy HTML to Clipboard] │
└─────────────────────────────────────────────────┘
```

**File: `src/components/KdpPrepDashboard.tsx`**

| Change | Description |
|--------|-------------|
| Add `viewMode` state | Toggle between `'preview'` and `'edit'` |
| Add preview container | Styled div with `dangerouslySetInnerHTML` |
| Update Copy button | Label clarifies it copies HTML code |
| Add mode toggle | Dropdown or tabs for Preview/Edit |

### Feature 3: Advanced Keyword Logic (No-Repeat Rule)

Update the AI prompt to forbid using words from the book title in keywords.

**Implementation:**
- Modify the `kdp-keywords` prompt in the edge function
- Add explicit instruction: "Do NOT use any major words from the title"
- Include the title words in the prompt for the AI to reference

**File: `supabase/functions/generate-book-v2/index.ts`**

**Updated Prompt:**
```text
CRITICAL CONSTRAINT - THE "NO-REPEAT" RULE:
You are STRICTLY FORBIDDEN from using any major words that already 
appear in the Book Title: "${title}"

Amazon penalizes repetitive keywords. Extract the main words from 
the title above and ensure NONE of them appear in your keywords.

Example:
- Title: "The Art of Digital Photography"
- BANNED words: art, digital, photography
- GOOD keyword: "beginner camera techniques"
- BAD keyword: "digital photography tips" (uses banned words)
```

---

## Summary of All Changes

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Add `isInitialMount` ref, guard reset logic to preserve book view during auth changes |
| `src/components/KdpPrepDashboard.tsx` | Add auto-generation on mount, add rich text preview mode, update copy button label |
| `supabase/functions/generate-book-v2/index.ts` | Update `kdp-keywords` prompt with "No-Repeat Rule" constraint |

## Behavior Summary

| Scenario | Before | After |
|----------|--------|-------|
| Guest generates book, waits 5 min | Resets to landing | Stays on book |
| User opens KDP Prep tab | Empty fields, manual clicks | Auto-populates with WeavingLoader |
| User views description | Sees raw `<b>`, `<li>` tags | Sees formatted bold, bullets |
| User clicks Copy | Copies raw HTML | Copies raw HTML (labeled clearly) |
| AI generates keywords for "Digital Photography" | May include "photography tips" | Never includes title words |
