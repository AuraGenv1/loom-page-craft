export interface ChapterInfo {
  chapter: number;
  title: string;
  imageDescription?: string;
}

export interface LocalResource {
  name: string;
  type: string;
  description?: string;
  address?: string;
  rating?: number | null;
  reviewCount?: number | null;
  placeId?: string;
}

export interface BookData {
  title: string;
  displayTitle: string;
  subtitle: string;
  tableOfContents: ChapterInfo[];
  chapter1Content: string;
  chapter2Content?: string;
  chapter3Content?: string;
  chapter4Content?: string;
  chapter5Content?: string;
  chapter6Content?: string;
  chapter7Content?: string;
  chapter8Content?: string;
  chapter9Content?: string;
  chapter10Content?: string;
  chapter11Content?: string;
  chapter12Content?: string;
  localResources: LocalResource[];
  hasDisclaimer?: boolean;
  coverImageUrl?: string | null;
  coverStyle?: string; // 'automotive-photography' | 'artistic-photography' | undefined
}
