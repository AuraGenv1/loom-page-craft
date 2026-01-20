// PDF Font Embedding Utility
// Fetches and caches Playfair Display font for jsPDF usage

import jsPDF from 'jspdf';

// Google Fonts CDN URL for Playfair Display Regular (woff2 format)
const PLAYFAIR_FONT_URL = 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFiD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTXtHA-Q.woff2';

// Cache the font data
let playfairFontBase64: string | null = null;

/**
 * Fetches Playfair Display font and converts to base64
 */
async function fetchPlayfairFont(): Promise<string | null> {
  if (playfairFontBase64) {
    return playfairFontBase64;
  }

  try {
    // Try direct fetch first
    const response = await fetch(PLAYFAIR_FONT_URL, { mode: 'cors' });
    if (!response.ok) {
      console.warn('Failed to fetch Playfair Display font');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    playfairFontBase64 = base64;
    return base64;
  } catch (error) {
    console.warn('Could not load Playfair Display font:', error);
    return null;
  }
}

/**
 * Registers Playfair Display font with a jsPDF instance
 * Falls back to 'times' if font loading fails
 */
export async function registerPlayfairFont(pdf: jsPDF): Promise<boolean> {
  const fontData = await fetchPlayfairFont();
  
  if (fontData) {
    try {
      pdf.addFileToVFS('PlayfairDisplay-Regular.woff2', fontData);
      pdf.addFont('PlayfairDisplay-Regular.woff2', 'PlayfairDisplay', 'normal');
      return true;
    } catch (error) {
      console.warn('Failed to register Playfair Display font:', error);
    }
  }
  
  return false;
}

/**
 * Sets the serif font for PDF - uses Playfair Display if available, otherwise Times
 */
export function setSerifFont(pdf: jsPDF, hasPlayfair: boolean, style: 'normal' | 'italic' | 'bold' = 'normal') {
  if (hasPlayfair) {
    pdf.setFont('PlayfairDisplay', style);
  } else {
    pdf.setFont('times', style);
  }
}

// Font size mapping from preview pixels to PDF points
// Preview container is 280px wide, PDF front cover is 6" wide
// Scale factor: 6" / 280px = 0.0214" per pixel
// 1 inch = 72 points, so 1px ≈ 1.54pt at this scale
// However, for visual matching, we calibrate based on appearance:

export const FONT_SIZES = {
  // Preview text-lg (18px) → 24pt for clear print title
  title: 22,
  // Preview text-[7px] → ~10pt for readable subtitle
  subtitle: 9,
  // Preview text-[10px] → ~13pt for brand
  brand: 11,
  // Preview text-[6px] → ~8pt for disclaimer
  disclaimer: 7,
  // Back cover - matched to preview CSS
  // Section 1: text-sm (14px) = 14pt
  backHeader: 14,
  // Section 2: text-[9px] = 9pt
  backBody: 9,
  // Section 3: text-[9px] font-bold = 9pt
  backCTA: 9,
  // Dedication: text-[10px] = 10pt
  backDedication: 10,
  // Spine
  spineEdition: 7,
  spineTitle: 9,
};

// Letter spacing mapping (charSpace in jsPDF)
// tracking-wide = 0.025em in Tailwind
export const CHAR_SPACING = {
  trackingWide: 0.02, // For back cover header "tracking-wide"
};

// Line heights in inches for proper vertical spacing
export const LINE_HEIGHTS = {
  title: 0.34,      // 22pt / 72 * 1.1 line height
  subtitle: 0.16,   // 9pt / 72 * 1.3 (tracking adds height)
  brand: 0.18,      // 11pt / 72 * 1.2
  disclaimer: 0.12, // 7pt / 72 * 1.2
};
