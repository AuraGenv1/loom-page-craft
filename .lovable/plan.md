

# Plan: Show KDP Export Tabs with Premium Lock for Guests

## Current State

1. **BookCover's "Edit Cover / Export KDP" button** is only visible when `isAdmin={true}` (line 1860)
2. **All 8 KDP Studio tabs** (Front, Back, Spine, Wrap, Prep, $$$, Legal, Export) are rendered unconditionally inside the dialog
3. **The button is passed `isAdmin` from Index.tsx**, but there's no `hasFullAccess` prop

The result: Guests never see the Cover Studio button, so they never see the tabs at all.

---

## Solution Overview

We need to make the Cover Studio accessible to guests, but with premium tabs locked:

| Tab | Guest Access |
|-----|--------------|
| Front | Unlocked (view-only, show image) |
| Back | Unlocked (view-only) |
| Spine | Unlocked (view-only) |
| Wrap | Unlocked (view-only) |
| Prep | LOCKED - blur content, show premium overlay |
| $$$ | LOCKED - blur content, show premium overlay |
| Legal | LOCKED - blur content, show premium overlay |
| Export | LOCKED - blur content, show premium overlay |

---

## Implementation Details

### File 1: `src/components/BookCover.tsx`

#### Change 1A: Add `hasFullAccess` Prop

Add a new prop to control premium feature access:

```typescript
interface BookCoverProps {
  // ... existing props
  hasFullAccess?: boolean;
  onPremiumFeatureAttempt?: (featureName: string) => void;
}
```

#### Change 1B: Show Studio Button for All Users (When Book Complete)

Change the button visibility from `isAdmin` to `isGenerationComplete`:

```text
Current (line 1860):
{isAdmin && (
  <Button onClick={() => setStudioOpen(true)} ...>
    Edit Cover / Export KDP
  </Button>
)}

After:
{isGenerationComplete && (
  <Button onClick={() => setStudioOpen(true)} ...>
    {hasFullAccess ? 'Edit Cover / Export KDP' : 'View Export Options'}
  </Button>
)}
```

This shows the button to all users once the book is fully generated, with different text for guests vs paid users.

#### Change 1C: Create LockedTabContent Component

Add a reusable component for locked tabs that shows:
- The tab title
- Blurred content preview
- A "Premium Feature" overlay with unlock CTA

```tsx
const LockedTabContent: React.FC<{
  title: string;
  description: string;
  onUnlockClick?: () => void;
  children: React.ReactNode;
}> = ({ title, description, onUnlockClick, children }) => (
  <div className="relative pt-4">
    {/* Blurred content preview */}
    <div className="blur-sm pointer-events-none opacity-60">
      {children}
    </div>
    
    {/* Premium overlay */}
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
      <div className="text-center p-8 max-w-sm">
        <Lock className="w-12 h-12 mx-auto mb-4 text-primary/60" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
        <Button onClick={onUnlockClick} className="gap-2">
          <Sparkles className="w-4 h-4" />
          Unlock Full Guide
        </Button>
      </div>
    </div>
  </div>
);
```

#### Change 1D: Wrap Premium Tabs with Conditional Lock

For each premium tab (Prep, $$$, Legal, Export), wrap the content:

```tsx
{/* TAB 5: KDP Prep */}
<TabsContent value="kdp-prep">
  {hasFullAccess ? (
    <KdpPrepDashboard ... />
  ) : (
    <LockedTabContent
      title="Amazon Listing Prep"
      description="Unlock to auto-generate your Best-Selling Description and Keywords with AI."
      onUnlockClick={() => onPremiumFeatureAttempt?.('Amazon Listing Prep')}
    >
      {/* Preview of the dashboard - blurred */}
      <div className="h-[300px] bg-secondary/20 rounded-lg flex items-center justify-center">
        <ClipboardList className="w-16 h-16 text-muted-foreground/30" />
      </div>
    </LockedTabContent>
  )}
</TabsContent>
```

Same pattern for:
- **$$$** tab: "Unlock to calculate your KDP royalties and pricing strategy."
- **Legal** tab: "Unlock to scan for potential copyright issues and generate legal disclaimers."
- **Export** tab: "Unlock to download your complete KDP package (PDF, EPUB, Cover)."

#### Change 1E: Disable Editing Features for View-Only Tabs

For Front, Back, Spine, Wrap tabs when `!hasFullAccess`:
- Hide or disable the "Save Changes" buttons
- Disable input fields
- Show a small "View Only" badge

```tsx
{/* In Front tab - disable inputs for guests */}
<Input
  value={localTitle}
  onChange={(e) => setLocalTitle(e.target.value)}
  disabled={!hasFullAccess}
  className="mt-1"
/>

{/* Conditionally show save button */}
{hasFullAccess && (
  <Button onClick={handleSaveTextChanges}>Save Changes</Button>
)}
```

---

### File 2: `src/pages/Index.tsx`

#### Change 2A: Pass `hasFullAccess` and Callback to BookCover

Update the BookCover usage to pass the access props:

```tsx
<BookCover 
  title={displayTitle} 
  subtitle={subtitle} 
  topic={topic} 
  coverImageUrls={coverImageUrls} 
  isLoadingImage={isLoadingCoverImage}
  isAdmin={isAdmin}
  hasFullAccess={hasFullAccess}  // NEW
  onPremiumFeatureAttempt={(name) => {
    setPremiumFeatureName(name);
    setShowPremiumModal(true);
    return false;
  }}  // NEW
  bookId={bookId || undefined}
  bookData={bookData || undefined}
  isGenerationComplete={isGenerationComplete}
  estimatedPageCount={realPageCount}
  isOfficial={isOfficial}
  isGrayscale={isGrayscaleMode}
  onCoverUpdate={...}
/>
```

---

## Visual Mockup

### Guest Clicks "View Export Options" Button

```text
┌─────────────────────────────────────────────────────────────┐
│ KDP Cover Studio & Export Manager                           │
├─────────────────────────────────────────────────────────────┤
│ [Front] [Back] [Spine] [Wrap] [🔒 Prep] [🔒 $$$] [🔒 Legal] [🔒 Export] │
├─────────────────────────────────────────────────────────────┤
│ (Guest clicks "Prep" tab)                                   │
│                                                              │
│   ┌───────────────────────────────────────────────────┐     │
│   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │     │
│   │ ░░░░░░░░░░░░░░░ (blurred preview) ░░░░░░░░░░░░░░░ │     │
│   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │     │
│   │                                                    │     │
│   │                    🔒                              │     │
│   │           Amazon Listing Prep                      │     │
│   │                                                    │     │
│   │    Unlock to auto-generate your Best-Selling       │     │
│   │      Description and Keywords with AI.             │     │
│   │                                                    │     │
│   │         [✨ Unlock Full Guide]                     │     │
│   │                                                    │     │
│   └───────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/BookCover.tsx` | Add `hasFullAccess` prop, show button to all users, create `LockedTabContent` component, wrap premium tabs conditionally, disable editing on view-only tabs |
| `src/pages/Index.tsx` | Pass `hasFullAccess` and `onPremiumFeatureAttempt` callback to BookCover |

---

## Tab Lock Messages

| Tab | Title | Description |
|-----|-------|-------------|
| Prep | Amazon Listing Prep | Unlock to auto-generate your Best-Selling Description and Keywords with AI. |
| $$$ | Royalty Calculator | Unlock to calculate your KDP royalties and optimize your pricing strategy. |
| Legal | Copyright Defense | Unlock to scan for potential issues and generate legal disclaimers. |
| Export | KDP Package | Unlock to download your complete Amazon-ready package (PDF, EPUB, Cover). |

---

## Benefits

1. **Trust**: Guests see the full studio UI and understand the value
2. **Desire**: Seeing locked premium tools creates urgency to purchase
3. **Consistency**: Follows the same "Tease View" pattern as Page Tools and Image Search
4. **Zero Cost**: Viewing the locked UI costs nothing since actions are intercepted

