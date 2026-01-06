export interface ChapterInfo {
  chapter: number;
  title: string;
  imageDescription: string;
}

export interface LocalResource {
  name: string;
  type: string;
  description: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  placeId?: string;
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
  diagramImages?: Record<string, string>;
}
