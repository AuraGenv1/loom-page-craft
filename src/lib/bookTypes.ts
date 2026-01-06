export interface ChapterInfo {
  chapter: number;
  title: string;
  imageDescription: string;
}

export interface LocalResource {
  name: string;
  type: string;
  description: string;
  address?: string; // Added back
  rating?: number; // Added back
  reviewCount?: number; // Added back
  placeId?: string; // Added back
}

export interface BookData {
  title: string;
  displayTitle: string;
  subtitle: string;
  tableOfContents: ChapterInfo[];
  chapter1Content: string;
  localResources?: LocalResource[];
  hasDisclaimer?: boolean;
  coverImageUrl?: string;
  diagramImages?: Record<string, string>; // Added for Index.tsx compatibility
}
