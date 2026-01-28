
# Consolidated UI Fixes

## Overview

This plan addresses four improvements:
1. **Logo preview scaling** - Mini-previews in BookCover ignore the size slider
2. **Front Cover tab layout** - Move Cover Branding below the grid to reduce scrolling
3. **Export tab cleanup** - Remove the unnecessary "Tip" text
4. **Print Mode in Page Tools** - Add B&W toggle to existing Page Tools menu

---

## File 1: `src/components/BookCover.tsx`

### Fix 1: Logo Size Not Updating in Mini-Previews

Two locations have fixed `w-6 h-6` sizing that ignores `customLogoScale`:

**Line 2017** (Front Cover Tab preview):
```tsx
// BEFORE
<img src={customLogoUrl} alt="Brand Logo" className="w-6 h-6 object-contain opacity-60" />

// AFTER
<img 
  src={customLogoUrl} 
  alt="Brand Logo" 
  className="object-contain opacity-60" 
  style={{ width: `${1.5 * customLogoScale}rem`, height: `${1.5 * customLogoScale}rem` }}
/>
```

**Line 2634** (Back Cover preview):
```tsx
// BEFORE
<img src={customLogoUrl} alt="Brand Logo" className="w-6 h-6 object-contain opacity-60" />

// AFTER
<img 
  src={customLogoUrl} 
  alt="Brand Logo" 
  className="object-contain opacity-60" 
  style={{ width: `${1.5 * customLogoScale}rem`, height: `${1.5 * customLogoScale}rem` }}
/>
```

---

### Fix 2: Move Cover Branding Below Grid

**Current structure (lines 2037-2214):**
```text
<div className="space-y-4">           ← Right column
  [Edit Cover Text section]
  [Upload Your Own Image section]
  [Cover Branding section] ← Causes scrolling
</div>
```

**New structure:**
1. Remove the Cover Branding section (lines 2122-2212) from inside the right column
2. Place it AFTER the closing `</div>` of the two-column grid (after line 2214)
3. Make it a compact, full-width row below both columns

```tsx
{/* Cover Branding - Full Width Below Grid */}
<div className="mt-6 pt-4 border-t">
  <h4 className="font-medium text-sm mb-3 text-center">Cover Branding</h4>
  <div className="flex flex-wrap items-center justify-center gap-4">
    {/* Brand Name */}
    <div className="flex items-center gap-2">
      <Label htmlFor="brand-name" className="text-sm whitespace-nowrap">Brand:</Label>
      <Input
        id="brand-name"
        value={customBrandName}
        onChange={(e) => setCustomBrandName(e.target.value)}
        placeholder="Your brand..."
        className="w-32"
      />
    </div>
    
    {/* Show Logo Toggle */}
    <div className="flex items-center gap-2">
      <Label htmlFor="show-logo" className="text-sm">Logo</Label>
      <input
        id="show-logo"
        type="checkbox"
        checked={showBrandLogo}
        onChange={(e) => setShowBrandLogo(e.target.checked)}
        className="h-4 w-4"
      />
    </div>
    
    {/* Upload Logo Button */}
    {showBrandLogo && (
      <>
        <Button variant="outline" size="sm" onClick={() => logoUploadRef.current?.click()}>
          {customLogoUrl ? 'Change Logo' : 'Upload Logo'}
        </Button>
        {customLogoUrl && (
          <div className="flex items-center gap-2">
            <img src={customLogoUrl} alt="Logo" className="w-6 h-6 object-contain border rounded" />
            <div className="flex items-center gap-1 w-24">
              <span className="text-xs">S</span>
              <Slider value={[customLogoScale]} onValueChange={([v]) => setCustomLogoScale(v)} min={0.5} max={2} step={0.1} />
              <span className="text-xs">L</span>
            </div>
          </div>
        )}
      </>
    )}
    
    {/* Reset Button */}
    <Button variant="ghost" size="sm" onClick={handleResetBranding}>Reset</Button>
  </div>
</div>
```

---

### Fix 3: Remove Export Tab "Tip"

**Delete lines 2801-2803:**
```tsx
<div className="text-sm text-muted-foreground space-y-2">
  <p><strong>Tip:</strong> For Amazon KDP, select 6" × 9" trim size.</p>
</div>
```

---

## File 2: `src/pages/Index.tsx`

### Remove Standalone Ink Saver Section

**Delete lines 919-937** (the standalone Print Mode toggle section):
```tsx
{/* Ink Saver Toggle (Print Mode: Black & White) */}
<section className="mb-6">
  <div className="flex items-center justify-center gap-3 py-3 px-4 bg-muted/50 rounded-lg border border-border max-w-md mx-auto">
    ...
  </div>
  ...
</section>
```

Keep the `isGrayscaleMode` state and `setIsGrayscaleMode` - just remove the UI.

### Add Callback Prop to PageViewer

Update the PageViewer component call to pass a new callback:
```tsx
<PageViewer
  // ... existing props
  isGrayscale={isGrayscaleMode}
  onGrayscaleChange={setIsGrayscaleMode}  // NEW
/>
```

---

## File 3: `src/components/PageViewer.tsx`

### Add Import for Switch and Printer Icon

**Line 2 - Add to imports:**
```tsx
import { ..., Printer } from 'lucide-react';
```

**Add new import for Switch:**
```tsx
import { Switch } from '@/components/ui/switch';
```

### Add New Prop Type

**Lines 47-71 - Add to PageViewerProps:**
```tsx
onGrayscaleChange?: (value: boolean) => void;
```

### Update Component Signature

Add `onGrayscaleChange` to destructured props.

### Add B&W Toggle to Page Tools Menu

**Lines 2115-2199** - The Page Tools dropdown currently only shows for admins. We need to:

1. Make Page Tools visible to ALL users (or create a separate user-facing version)
2. Add the B&W toggle at the bottom of the menu

Since the memory states "Page Tools will eventually be available to all users," we'll add a **View Settings** section at the bottom that's visible to everyone:

```tsx
{/* Page Tools Menu - Admin tools + User settings */}
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
      <Wrench className="w-4 h-4" />
      <span className="hidden sm:inline">Page Tools</span>
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="center" className="w-56">
    {/* Admin-only tools */}
    {isAdmin && (
      <>
        {/* ... existing admin menu items ... */}
        <DropdownMenuSeparator />
      </>
    )}
    
    {/* View Settings - Available to all users */}
    <div className="flex items-center justify-between px-2 py-2">
      <div className="flex items-center gap-2">
        <Printer className="w-4 h-4" />
        <Label className="text-sm font-normal">B&W Print Mode</Label>
      </div>
      <Switch
        checked={isGrayscale}
        onCheckedChange={onGrayscaleChange}
      />
    </div>
    <p className="text-xs text-muted-foreground px-2 pb-2">
      Optimizes for Amazon's cheaper B&W printing
    </p>
  </DropdownMenuContent>
</DropdownMenu>
```

**Key change:** Remove the `{isAdmin && ...}` wrapper from the entire DropdownMenu, so the button is always visible. Keep admin-only items wrapped inside.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/BookCover.tsx` | Fix logo preview scaling (lines 2017, 2634) |
| `src/components/BookCover.tsx` | Move Cover Branding below grid (lines 2122-2212 → after 2214) |
| `src/components/BookCover.tsx` | Remove "Tip" from Export tab (lines 2801-2803) |
| `src/pages/Index.tsx` | Remove standalone Ink Saver section (lines 919-937) |
| `src/pages/Index.tsx` | Add `onGrayscaleChange` callback to PageViewer |
| `src/components/PageViewer.tsx` | Add `Printer` icon and `Switch` imports |
| `src/components/PageViewer.tsx` | Add `onGrayscaleChange` prop |
| `src/components/PageViewer.tsx` | Make Page Tools visible to all, add B&W toggle |

---

## Expected Results

1. **Logo scaling** - Slider updates all mini-previews in real-time
2. **No scrolling** - Front Cover tab fits without scrolling; branding is in a compact row below
3. **Clean Export tab** - No redundant tip text
4. **Print Mode in Page Tools** - B&W toggle is accessible to ALL users via the Page Tools button, consolidating view settings in one place
