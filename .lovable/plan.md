
# Logo Size Control - Implemented ✅

Added a slider to let users resize their custom logo on book covers. The scale applies to both web previews and PDF/JPG exports.

## Changes Made

1. **New State**: `customLogoScale` (range 0.5-2.0, default 1.0)
2. **Slider UI**: Appears in Cover Branding section when custom logo is uploaded
3. **Web Preview**: Logo size scales dynamically with `customLogoScale`
4. **Canvas Export**: Logo size in PDF/JPG applies the scale multiplier
5. **Reset Function**: Resets scale to 1.0 when branding is reset

| Control | Range | Default |
|---------|-------|---------|
| Logo Size Slider | 0.5x to 2x | 1.0x |

