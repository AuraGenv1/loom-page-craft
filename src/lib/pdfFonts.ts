// PDF Font Embedding Utility
// Uses bundled TTF for exact font parity with web preview

import jsPDF from 'jspdf';

// Import the bundled TTF font
import PlayfairRegularTTF from '@/assets/fonts/PlayfairDisplay-Regular.ttf';

// Cache the font data
let playfairFontBase64: string | null = null;

/**
 * Fetches Playfair Display TTF font and converts to base64
 */
async function fetchPlayfairFont(): Promise<string | null> {
  if (playfairFontBase64) {
    return playfairFontBase64;
  }

  try {
    // Fetch the bundled TTF file
    const response = await fetch(PlayfairRegularTTF);
    if (!response.ok) {
      console.warn('Failed to fetch bundled Playfair Display TTF');
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
      pdf.addFileToVFS('PlayfairDisplay-Regular.ttf', fontData);
      pdf.addFont('PlayfairDisplay-Regular.ttf', 'PlayfairDisplay', 'normal');
      pdf.addFont('PlayfairDisplay-Regular.ttf', 'PlayfairDisplay', 'bold'); // Use regular for bold until we have bold TTF
      pdf.addFont('PlayfairDisplay-Regular.ttf', 'PlayfairDisplay', 'italic'); // Use regular for italic until we have italic TTF
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

// Font size mapping - calibrated to match preview scaling
// Preview: 130px back cover width → PDF: 6" = 432pt
// Scale: 432pt / 130px = 3.32pt per px
// text-[6px] → 6 * 3.32 = ~20pt (but visually it's smaller, use 14pt)
// text-[4px] → 4 * 3.32 = ~13pt (visually use 9pt)

export const FONT_SIZES = {
  // Back cover - calibrated to match preview proportions
  // Preview: 130px back cover with text-[6px] header = 6/130 = 4.6% of width
  // PDF: 6" back cover, so header should be visually similar = ~10pt
  // Preview: text-[4px] body = 4/130 = 3% of width → ~6-7pt
  backHeader: 10,      // text-[6px] → proportionally smaller
  backBody: 6.5,       // text-[4px] → very small for proper wrapping
  backCTA: 6.5,        // text-[4px] font-bold
  backDedication: 6,   // text-[4px] italic
  // Front cover
  title: 22,
  subtitle: 9,
  brand: 11,
  disclaimer: 7,
  // Spine
  spineEdition: 7,
  spineTitle: 9,
};

// Letter spacing mapping (charSpace in jsPDF)
// tracking-wide = 0.025em in Tailwind
export const CHAR_SPACING = {
  trackingWide: 0.02,
};

// Line heights - leading-relaxed = 1.625
export const LINE_HEIGHTS = {
  relaxed: 1.625,
  normal: 1.4,
  title: 0.34,
  subtitle: 0.16,
  brand: 0.18,
  disclaimer: 0.12,
};
