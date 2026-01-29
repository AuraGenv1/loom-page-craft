// Block-Based Page Architecture Types
// Each block represents a discrete unit that fits on one physical page

export type PageBlockType = 
  | 'chapter_title'
  | 'text'
  | 'image_full'
  | 'image_half'
  | 'pro_tip'
  | 'heading'
  | 'list'
  | 'quote'
  | 'divider';

// Base block with common fields
interface BaseBlock {
  id: string;
  book_id: string;
  chapter_number: number;
  page_order: number;
  block_type: PageBlockType;
  image_url?: string;
  image_source?: string;
  created_at?: string;
  updated_at?: string;
}

// Chapter title page
export interface ChapterTitleBlock extends BaseBlock {
  block_type: 'chapter_title';
  content: {
    chapter_number: number;
    title: string;
  };
}

// Text block (~250 words max for one physical page)
export interface TextBlock extends BaseBlock {
  block_type: 'text';
  content: {
    text: string;
  };
}

// Full-page image with caption
export interface ImageFullBlock extends BaseBlock {
  block_type: 'image_full';
  content: {
    query: string;
    caption: string;
  };
  image_url?: string;
}

// Half-page image (shared with text)
export interface ImageHalfBlock extends BaseBlock {
  block_type: 'image_half';
  content: {
    query: string;
    caption: string;
  };
  image_url?: string;
}

// Pro-tip callout box
export interface ProTipBlock extends BaseBlock {
  block_type: 'pro_tip';
  content: {
    text: string;
  };
}

// Section heading (H2/H3)
export interface HeadingBlock extends BaseBlock {
  block_type: 'heading';
  content: {
    level: 2 | 3;
    text: string;
  };
}

// Bulleted/numbered list
export interface ListBlock extends BaseBlock {
  block_type: 'list';
  content: {
    items: string[];
    ordered?: boolean;
  };
}

// Quote block (for chapter breakers and inspiration)
export interface QuoteBlock extends BaseBlock {
  block_type: 'quote';
  content: {
    text: string;
    attribution?: string;
  };
}

// Divider block (minimal visual break)
export interface DividerBlock extends BaseBlock {
  block_type: 'divider';
  content: {
    style?: 'minimal' | 'ornate' | 'line';
  };
}

// Union type for all blocks
export type PageBlock = 
  | ChapterTitleBlock
  | TextBlock
  | ImageFullBlock
  | ImageHalfBlock
  | ProTipBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | DividerBlock;

// Helper to determine if topic is visual (travel, cooking, etc.)
export const isVisualTopic = (topic: string): boolean => {
  const visualKeywords = [
    'travel', 'trip', 'vacation', 'destination', 'tour',
    'cooking', 'recipe', 'food', 'cuisine', 'baking',
    'photography', 'photo', 'camera',
    'art', 'painting', 'drawing', 'design',
    'architecture', 'building', 'interior',
    'nature', 'wildlife', 'garden', 'landscape',
    'fashion', 'style', 'clothing',
    'diy', 'craft', 'woodworking'
  ];
  
  const lowerTopic = topic.toLowerCase();
  return visualKeywords.some(keyword => lowerTopic.includes(keyword));
};

// Luxury Architect targets
export const LUXURY_TARGET_PAGES = 140; // Target 140+ pages for professional-length books
export const LUXURY_MIN_CHAPTERS = 12;
export const LUXURY_MAX_IMAGE_RATIO = 0.30; // Max 30% images

// Calculate target page count based on topic type
export const getTargetPageCount = (topic: string, chapterCount: number): number => {
  const pagesPerChapter = isVisualTopic(topic) ? 14 : 10;
  const frontMatter = 4; // Title, Copyright, TOC
  return frontMatter + (chapterCount * pagesPerChapter);
};
