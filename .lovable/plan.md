
# Add Logo Size Control

## Overview

Add a slider to let users resize their custom logo on book covers. The scale will apply to both web previews and PDF/JPG exports.

---

## Changes to `src/components/BookCover.tsx`

### 1. Add New State Variable (after line 105)

```typescript
const [customLogoScale, setCustomLogoScale] = useState(1.0); // 0.5 to 2.0
```

### 2. Add Slider UI in Cover Branding Section (after line 2173)

Add a slider that only appears when a custom logo is uploaded:

```typescript
{customLogoUrl && (
  <div className="mt-3">
    <Label className="text-sm">Logo Size</Label>
    <div className="flex items-center gap-3 mt-1">
      <span className="text-xs text-muted-foreground">S</span>
      <Slider
        value={[customLogoScale]}
        onValueChange={([val]) => setCustomLogoScale(val)}
        min={0.5}
        max={2}
        step={0.1}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground">L</span>
    </div>
  </div>
)}
```

### 3. Update Web Preview Logo (line ~1907)

**Before:**
```tsx
<img src={customLogoUrl} alt="Brand Logo" className="w-8 h-8 object-contain opacity-60" />
```

**After:**
```tsx
<img 
  src={customLogoUrl} 
  alt="Brand Logo" 
  className="object-contain opacity-60" 
  style={{ width: `${2 * customLogoScale}rem`, height: `${2 * customLogoScale}rem` }}
/>
```

### 4. Update Canvas Export Logo (line ~1302)

**Before:**
```typescript
const logoSize = width * 0.085;
```

**After:**
```typescript
// Apply custom scale only if user has uploaded a custom logo
const baseLogoSize = width * 0.085;
const logoSize = customLogoUrl ? baseLogoSize * customLogoScale : baseLogoSize;
```

### 5. Reset Function - Include Scale (line ~275)

Update `handleResetBranding` to reset the scale:
```typescript
setCustomLogoScale(1.0);
```

---

## Expected Result

| Control | Range | Default |
|---------|-------|---------|
| Logo Size Slider | 0.5x to 2x | 1.0x |

- Small (0.5x): ~16px preview / 4.25% canvas width
- Medium (1.0x): ~32px preview / 8.5% canvas width (current)
- Large (2.0x): ~64px preview / 17% canvas width

The slider only appears after uploading a custom logo (default Loom & Page logo stays fixed size).
