
# Plan: Show Full Page Tools Menu with Premium Locks for Guests

## Current State

The Page Tools dropdown (lines 2266-2361 in `PageViewer.tsx`) hides all editing tools behind `{isAdmin && (`, so guests only see the "B&W Print Mode" toggle.

**Current Guest View:**
```
Page Tools
└── B&W Print Mode [toggle]
```

**What Guests Should See:**
```
Page Tools
├── 🔒 Insert Page Before      [Premium]
├── 🔒 Insert Page After       [Premium]
├── ───────────────────────────
├── 🔍 Search Gallery          [Try it!]   ← Opens gallery, locks at selection
├── 🔒 Upload Own Photo        [Premium]
├── ───────────────────────────
├── 🔒 Regenerate Chapter      [Premium]
├── 🔒 Edit Page Content       [Premium]
├── ───────────────────────────
├── 🔒 Delete This Page        [Premium]
├── ───────────────────────────
└── 🖨️ B&W Print Mode          [toggle]    ← Free for all
```

---

## Implementation

### File: `src/components/PageViewer.tsx`

#### Change 1: Add Lock Icon Import

Update line 2 to include `Lock`:
```typescript
import { ..., Lock } from 'lucide-react';
```

#### Change 2: Create LockedMenuItem Component

Add around line 190 (after AuthorImageToolbar):

```tsx
// Locked Menu Item - shows tool but triggers premium modal on click
const LockedMenuItem: React.FC<{
  icon: React.ElementType;
  label: string;
  featureName: string;
  onPremiumAttempt: (name: string) => void;
  destructive?: boolean;
}> = ({ icon: Icon, label, featureName, onPremiumAttempt, destructive }) => (
  <DropdownMenuItem 
    onClick={() => onPremiumAttempt(featureName)}
    className={`gap-2 ${destructive ? 'text-destructive/60' : 'opacity-80'}`}
  >
    <Lock className="w-3 h-3 text-muted-foreground" />
    <Icon className="w-4 h-4" />
    <span className="flex-1">{label}</span>
    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Premium</span>
  </DropdownMenuItem>
);
```

#### Change 3: Refactor Page Tools Menu (lines 2266-2361)

Replace the `{isAdmin && (` conditional block with a structure that shows ALL items to everyone, with appropriate lock states:

```tsx
<DropdownMenuContent align="center" className="w-56">
  {/* Section Header for Guests */}
  {!hasFullAccess && (
    <>
      <div className="px-2 py-1.5 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Premium Editing Suite
        </span>
      </div>
      <DropdownMenuSeparator />
    </>
  )}

  {/* Insert Page Options */}
  {hasFullAccess ? (
    <>
      <DropdownMenuItem onClick={() => { setInsertDirection('before'); setInsertDialogOpen(true); }} disabled={isInserting} className="gap-2">
        <PlusCircle className="w-4 h-4" />
        Insert Page Before
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => { setInsertDirection('after'); setInsertDialogOpen(true); }} disabled={isInserting} className="gap-2">
        <PlusSquare className="w-4 h-4" />
        Insert Page After
      </DropdownMenuItem>
    </>
  ) : (
    <>
      <LockedMenuItem icon={PlusCircle} label="Insert Page Before" featureName="Insert Page" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
      <LockedMenuItem icon={PlusSquare} label="Insert Page After" featureName="Insert Page" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
    </>
  )}
  <DropdownMenuSeparator />

  {/* Image Tools - Always show for image pages */}
  {currentBlock && ['image_full', 'image_half'].includes(currentBlock.block_type) && (
    <>
      {hasFullAccess ? (
        <>
          <DropdownMenuItem onClick={() => handleOpenSearchDialog(currentBlock.id)} className="gap-2">
            <Search className="w-4 h-4" />
            Search Gallery
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleOpenUploadModal(currentBlock.id)} className="gap-2">
            <Upload className="w-4 h-4" />
            Upload Own Photo
          </DropdownMenuItem>
        </>
      ) : (
        <>
          {/* Search Gallery - Let guests try it (windowShopperMode locks at selection) */}
          <DropdownMenuItem onClick={() => handleOpenSearchDialog(currentBlock.id)} className="gap-2">
            <Search className="w-4 h-4" />
            Search Gallery
            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded ml-auto">Try it!</span>
          </DropdownMenuItem>
          <LockedMenuItem icon={Upload} label="Upload Own Photo" featureName="Photo Upload" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
        </>
      )}
      <DropdownMenuSeparator />
    </>
  )}

  {/* Content Editing Tools */}
  {hasFullAccess ? (
    <>
      <DropdownMenuItem onClick={handleRegenerateChapter} disabled={isRegenerating} className="gap-2">
        <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
        Regenerate Chapter {currentChapter}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleOpenEditModal} className="gap-2">
        <Pencil className="w-4 h-4" />
        Edit Page Content
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleDeletePage} className="gap-2 text-destructive focus:text-destructive">
        <Trash2 className="w-4 h-4" />
        Delete This Page
      </DropdownMenuItem>
    </>
  ) : (
    <>
      <LockedMenuItem icon={RefreshCw} label={`Regenerate Chapter ${currentChapter}`} featureName="AI Regeneration" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
      <LockedMenuItem icon={Pencil} label="Edit Page Content" featureName="Content Editing" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
      <DropdownMenuSeparator />
      <LockedMenuItem icon={Trash2} label="Delete This Page" featureName="Page Deletion" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} destructive />
    </>
  )}
  <DropdownMenuSeparator />

  {/* View Settings - FREE for all users */}
  <div className="flex items-center justify-between px-2 py-2">
    <div className="flex items-center gap-2">
      <Printer className="w-4 h-4" />
      <Label className="text-sm font-normal">B&W Print Mode</Label>
    </div>
    <Switch checked={isGrayscale} onCheckedChange={onGrayscaleChange} />
  </div>
  <p className="text-xs text-muted-foreground px-2 pb-2">
    Optimizes for Amazon's cheaper B&W printing
  </p>
</DropdownMenuContent>
```

---

## Visual Result

### Guest View of Page Tools:

| Tool | Status | Click Behavior |
|------|--------|----------------|
| Insert Page Before | Locked | Shows Premium Modal |
| Insert Page After | Locked | Shows Premium Modal |
| Search Gallery | "Try it!" | Opens gallery, locks at selection |
| Upload Own Photo | Locked | Shows Premium Modal |
| Regenerate Chapter | Locked | Shows Premium Modal |
| Edit Page Content | Locked | Shows Premium Modal |
| Delete This Page | Locked | Shows Premium Modal |
| B&W Print Mode | Free | Works normally |

---

## Summary

| Location | Change |
|----------|--------|
| Line 2 | Add `Lock` to lucide imports |
| After line 189 | Add `LockedMenuItem` component |
| Lines 2266-2361 | Refactor menu to show all items with conditional locks |

This gives guests visibility into ALL the editing power available, while protecting premium features behind the unlock modal. The "Try it!" on Search Gallery lets them experience the image browsing without being able to actually change anything (via `windowShopperMode`).
