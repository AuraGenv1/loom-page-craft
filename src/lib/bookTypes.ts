/**
 * Unified Type Definitions
 */
export interface LocalResource {
  name: string;
  type: string;
  address: string;
  phone?: string;
}

export interface ChapterInfo {
  title: string;
  pageNumber: number;
}

export interface Chapter {
  title: string;
  description: string;
}

export interface BookData {
  title: string;
  displayTitle?: string; // Added back
  subtitle?: string; // Added back
  preface: string;
  chapters: Chapter[];
  topic: string;
  coverImage?: string;
  tableOfContents?: ChapterInfo[]; // Added back
  chapter1Content?: string; // Added back
}
