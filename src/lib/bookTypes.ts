/**
 * Unified Type Definitions
 */
export interface LocalResource {
  name: string;
  type: string;
  address: string;
  phone?: string;
  description?: string;
  rating?: number;
  reviewCount?: number;
  placeId?: string;
}

export interface ChapterInfo {
  chapter: number;
  title: string;
  imageDescription?: string;
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
  localResources?: LocalResource[];
  hasDisclaimer?: boolean;
  // This helps fix the "bookData does not exist" errors in Admin/Dashboard
  bookData?: any;
}
