/**
 * Standalone Type Definitions
 * No local imports allowed here to prevent circular loops.
 */
export interface Chapter {
  title: string;
  description: string;
}

export interface BookData {
  title: string;
  preface: string;
  chapters: Chapter[];
  topic: string;
  coverImage?: string;
}
