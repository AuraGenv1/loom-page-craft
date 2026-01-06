/**
 * Unified Type Definitions
 */
export interface LocalResource {
  name: string;
  type: string;
  address: string;
  phone?: string;
  description?: string; // Added
  rating?: number; // Added
  reviewCount?: number; // Added
  placeId?: string; // Added
}

export interface ChapterInfo {
  chapter: number; // Renamed from pageNumber to match UI
  title: string;
  imageDescription?: string; // Added
}

export interface Chapter {
  title: string;
  description: string;
}

export interface BookData {
  title: string;
  displayTitle?: string;
  subtitle?: string;
  preface: string;
  chapters: Chapter[];
  topic: string;
  coverImage?: string;
  tableOfContents?: ChapterInfo[];
  chapter1Content?: string;
  localResources?: LocalResource[]; // Added
}
