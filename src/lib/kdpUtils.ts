// KDP Publishing Utilities
// Centralized calculations for Amazon KDP publishing requirements

// Front matter pages that are injected during PDF export
export const FRONT_MATTER_PAGES = {
  TITLE_PAGE: 1,
  COPYRIGHT_PAGE: 1,
  TABLE_OF_CONTENTS: 2,
};

export const TOTAL_FRONT_MATTER = 
  FRONT_MATTER_PAGES.TITLE_PAGE + 
  FRONT_MATTER_PAGES.COPYRIGHT_PAGE + 
  FRONT_MATTER_PAGES.TABLE_OF_CONTENTS; // = 4 pages

// KDP spine width calculation constant (inches per page for white paper)
export const KDP_SPINE_MULTIPLIER = 0.002252;

// Minimum spine width for safety (Amazon rejects very thin spines)
export const MIN_SPINE_WIDTH = 0.15;

// Standard trim sizes
export const TRIM_SIZE = {
  WIDTH: 6,    // inches
  HEIGHT: 9,   // inches
  BLEED: 0.125 // inches (for full-bleed covers)
};

/**
 * Calculate the final print page count including front matter.
 * This is the SINGLE SOURCE OF TRUTH for page counts.
 * 
 * @param contentPageCount - Number of content pages (from blocks/chapters)
 * @returns Total page count including front matter
 */
export const calculateFinalPageCount = (contentPageCount: number): number => {
  return contentPageCount + TOTAL_FRONT_MATTER;
};

/**
 * Calculate the spine width based on final page count.
 * Uses Amazon KDP white paper formula.
 * 
 * @param finalPageCount - Total pages including front matter
 * @returns Spine width in inches
 */
export const calculateSpineWidth = (finalPageCount: number): number => {
  const calculatedWidth = finalPageCount * KDP_SPINE_MULTIPLIER;
  return Math.max(MIN_SPINE_WIDTH, calculatedWidth);
};

/**
 * Calculate the full wrap cover width.
 * Formula: Back Cover + Spine + Front Cover
 * 
 * @param spineWidth - Calculated spine width in inches
 * @returns Total cover width in inches
 */
export const calculateFullWrapWidth = (spineWidth: number): number => {
  return TRIM_SIZE.WIDTH + spineWidth + TRIM_SIZE.WIDTH;
};

/**
 * Get full KDP cover dimensions for PDF generation.
 * 
 * @param contentPageCount - Number of content pages
 * @returns Object with all dimension calculations
 */
export const getKdpCoverDimensions = (contentPageCount: number) => {
  const finalPageCount = calculateFinalPageCount(contentPageCount);
  const spineWidth = calculateSpineWidth(finalPageCount);
  const fullWrapWidth = calculateFullWrapWidth(spineWidth);
  
  // Height includes bleed (0.125" top + 0.125" bottom)
  const fullWrapHeight = TRIM_SIZE.HEIGHT + TRIM_SIZE.BLEED * 2;
  
  return {
    finalPageCount,
    spineWidth,
    fullWrapWidth,
    fullWrapHeight,
    trimSize: `${TRIM_SIZE.WIDTH}" × ${TRIM_SIZE.HEIGHT}"`,
    bleed: `${TRIM_SIZE.BLEED}"`,
    frontCoverWidth: TRIM_SIZE.WIDTH,
    backCoverWidth: TRIM_SIZE.WIDTH,
  };
};

/**
 * Check if spine text should be shown (Amazon requires 80+ pages for spine text)
 */
export const shouldShowSpineText = (finalPageCount: number): boolean => {
  return finalPageCount >= 80;
};

/**
 * Format dimensions for display in the UI
 */
export const formatDimensions = (contentPageCount: number): {
  pageCount: string;
  spineWidth: string;
  trimSize: string;
  bleed: string;
  wrapDimensions: string;
} => {
  const dims = getKdpCoverDimensions(contentPageCount);
  
  return {
    pageCount: `${dims.finalPageCount} pages`,
    spineWidth: `${dims.spineWidth.toFixed(3)}"`,
    trimSize: dims.trimSize,
    bleed: 'No Bleed',
    wrapDimensions: `${dims.fullWrapWidth.toFixed(3)}" × ${dims.fullWrapHeight.toFixed(2)}"`,
  };
};
