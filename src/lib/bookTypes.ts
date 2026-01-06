/**
 * Isolated Type Definitions
 * DO NOT import anything from other project files into this file.
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
