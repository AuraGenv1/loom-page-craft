
# Customizable Cover Branding & UI Cleanup ✅ COMPLETED

## Overview

This plan implements three changes to the KDP Cover Studio:
1. Remove "Back Cover Image (Optional)" section from Back Cover tab
2. Remove "Custom Image Prompt" section from Front Cover tab
3. Add customizable logo and brand name for all users

---

## Changes Summary

### 1. Remove Back Cover Image Section (Back Cover Tab)

**File:** `src/components/BookCover.tsx`

Remove lines 2177-2207 which contain:
- "Back Cover Image (Optional)" label and description
- `backPrompt` textarea
- "Generate Back Cover" button

The back cover will remain a clean white design with editable text only.

---

### 2. Remove Custom Image Prompt Section (Front Cover Tab)

**File:** `src/components/BookCover.tsx`

Remove lines 2022-2034 which contain:
- "Custom Image Prompt" label and description
- `frontPrompt` textarea

Users can still customize cover images via "Search Gallery" and "Upload Cover Image" buttons.

---

### 3. Add Customizable Logo & Brand Name

This is the most significant change. All users (guests, paid, admin) will be able to customize the branding that appears on covers.

#### 3.1 New State Variables (lines ~88-110)

```typescript
// Custom branding state (defaults to Loom & Page)
const [customBrandName, setCustomBrandName] = useState("Loom & Page");
const [showBrandLogo, setShowBrandLogo] = useState(true);
const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
```

#### 3.2 New UI in Front Cover Tab

Add a "Cover Branding" section after the image upload area:

```text
┌────────────────────────────────────────┐
│  Cover Branding                        │
│  ─────────────────────                 │
│  Brand Name:  [ Loom & Page      ]     │
│                                        │
│  ☑ Show Logo                           │
│  [ Upload Custom Logo ]                │
│                                        │
│  [ Reset to Default ]                  │
└────────────────────────────────────────┘
```

#### 3.3 Update Render Locations

**Web Preview (BookCover main component, lines 1868-1895):**
- Conditionally render logo based on `showBrandLogo`
- Display `customBrandName` instead of hardcoded "Loom & Page"
- If `customLogoUrl` exists, show uploaded image; otherwise show default CSS logo

**Front Cover Tab Preview (lines 1960-1977):**
- Same conditional rendering as above

**Full Wrap Preview (lines 2529-2541):**
- Same conditional rendering as above

**Canvas Exports - CRITICAL (lines 1269-1340):**
- `drawFrontCoverToCanvas` must use custom branding
- If `showBrandLogo` is false, skip logo drawing
- If `customBrandName` is empty, skip brand name
- If `customLogoUrl` exists, load and draw that image instead of the vector logo

---

## Technical Details

### Canvas Logo Drawing Updates

The `drawFrontCoverToCanvas` function (starting line 1155) currently draws a hardcoded vector logo. It needs to be updated to:

1. Check if `showBrandLogo` is true
2. If `customLogoUrl` exists, load and draw that image
3. Otherwise, draw the default vector logo (or skip if logo is hidden)
4. Draw `customBrandName` instead of "Loom & Page"

```typescript
// Updated logo section in drawFrontCoverToCanvas
if (showBrandLogo) {
  if (customLogoUrl) {
    // Load and draw custom logo image
    const logoImg = await loadCanvasImage(customLogoUrl);
    if (logoImg) {
      ctx.drawImage(logoImg, logoX, logoTopY, logoW, logoH);
    }
  } else {
    // Draw default vector logo (existing code)
    // ... vertical lines, horizontal crossbar, corner fold
  }
}

// Draw brand name (only if not empty)
if (customBrandName) {
  ctx.fillText(customBrandName, centerX, anchorY);
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/BookCover.tsx` | All changes above |

---

## User Experience

### Default Behavior
- Brand name defaults to "Loom & Page"
- Logo is shown by default
- No setup required for existing workflow

### Customization Flow
1. User opens KDP Cover Studio (Edit Cover / Export KDP button)
2. In Front Cover tab, scrolls to "Cover Branding" section
3. Can type custom brand name or leave blank for no text
4. Can toggle logo visibility
5. Can upload custom logo image
6. Changes immediately reflect in all previews
7. When downloading PDF or JPG, exports use custom branding

### Reset Option
- "Reset to Default" button restores "Loom & Page" branding with default logo
