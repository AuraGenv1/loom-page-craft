import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Key, Loader2, Pencil, Type, RefreshCw, Trash2, Search, Upload, AlertTriangle, Wrench, ImagePlus, ZoomIn, ZoomOut, PlusCircle, PlusSquare, Image, Printer, BookOpen, Sparkles, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBlock } from '@/lib/pageBlockTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImageSearchGallery, ImageSelectMetadata } from '@/components/ImageSearchGallery';
import ChapterPaywall from '@/components/ChapterPaywall';
import { uploadToBookImages, archiveExternalImage, saveImageMetadata, createUploadMetadata } from '@/lib/bookImages';

type PageBlockMeta = PageBlock & Partial<{
  original_url: string;
  image_source: string;
  image_license: string;
  image_attribution: string;
  archived_at: string;
}>;

// A stable key for a block that survives "preloaded" rehydration/replacement.
// We cannot rely on `id` during generation because blocks may be replaced while
// the DB is still syncing, which would reset loading/attempt state and wipe
// locally-fetched images.
const getBlockKey = (block: Pick<PageBlock, 'book_id' | 'chapter_number' | 'page_order' | 'block_type'>) => {
  return `${block.book_id}:${block.chapter_number}:${block.page_order}:${block.block_type}`;
};

// Track which blocks are currently being fetched to prevent duplicates
const fetchingImages = new Set<string>();

// Preloaded blocks (during generation) may briefly lack DB IDs. We only enable
// image fetching / editing once the chapter is hydrated from the database.
const hasValidDbId = (block: Partial<PageBlock> | null | undefined): block is PageBlock => {
  return !!block && typeof (block as any).id === 'string' && (block as any).id.length > 0;
};

interface PageViewerProps {
  bookId: string;
  initialChapter?: number;
  totalChapters?: number;
  onPageChange?: (chapter: number, page: number) => void;
  onChapterChange?: (chapter: number) => void;
  /** Pre-loaded blocks from parent state - used for instant display before DB sync */
  preloadedBlocks?: Record<number, PageBlock[]>;
  /** Total page count across all chapters (for Amazon spine width calculation) */
  totalPageCount?: number;
  /** Enable admin controls for image editing */
  isAdmin?: boolean;
  /** User can edit images (Admin OR Paid Owner) */
  canEditImages?: boolean;
  /** Is this an official Loom & Page book? */
  isOfficial?: boolean;
  /** Topic for chapter regeneration */
  topic?: string;
  /** Table of contents for chapter regeneration */
  tableOfContents?: Array<{ chapter: number; title: string }>;
  /** Callback when blocks are updated (for parent state sync) */
  onBlocksUpdate?: (chapter: number, blocks: PageBlock[]) => void;
  /** Enable grayscale/B&W mode for PDF exports */
  isGrayscale?: boolean;
  /** Callback to toggle grayscale mode */
  onGrayscaleChange?: (value: boolean) => void;
  /** User has full access (admin or paid) */
  hasFullAccess?: boolean;
  /** Callback when guest tries to use premium feature */
  onPremiumFeatureAttempt?: (featureName: string) => boolean;
}

// Loading state component
const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <Loader2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-spin" />
    <p className="text-sm text-muted-foreground">Loading page...</p>
  </div>
);

// Individual block renderers
const ChapterTitlePage: React.FC<{ content: { chapter_number: number; title: string } }> = ({ content }) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <p className="text-sm tracking-[0.3em] uppercase text-muted-foreground mb-4">
      Chapter {content.chapter_number}
    </p>
    <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-6">
      {content.title}
    </h1>
    <div className="w-16 h-px bg-border" />
  </div>
);

const TextPage: React.FC<{ content: { text: string } }> = ({ content }) => {
  // Strip **bold** markdown syntax (AI sometimes includes this despite being banned)
  const stripAsterisks = (text: string): string => {
    return text.replace(/\*\*([^*]+)\*\*/g, '$1');
  };

  // Parse text for headers and lists (blockquotes banned)
  const parseTextWithHeaders = (text: string) => {
    // First, strip any errant **bold** markdown
    const cleanedText = stripAsterisks(text);
    const lines = cleanedText.split('\n');
    const elements: JSX.Element[] = [];
    let currentParagraph: string[] = [];
    
    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ').trim();
        if (paragraphText) {
          elements.push(
            <p key={elements.length} className="font-serif text-[15px] leading-relaxed text-foreground mb-5">
              {paragraphText}
            </p>
          );
        }
        currentParagraph = [];
      }
    };
    
    lines.forEach((line, i) => {
      const trimmedLine = line.trim();
      
      // H2 Headers (## )
      if (trimmedLine.startsWith('## ')) {
        flushParagraph();
        elements.push(
          <h2 key={`h2-${i}`} className="text-lg font-bold mt-4 mb-2 font-serif text-foreground">
            {stripAsterisks(trimmedLine.replace('## ', ''))}
          </h2>
        );
      }
      // H3 Headers (### )
      else if (trimmedLine.startsWith('### ')) {
        flushParagraph();
        elements.push(
          <h3 key={`h3-${i}`} className="text-base font-semibold mt-3 mb-2 font-serif text-foreground">
            {stripAsterisks(trimmedLine.replace('### ', ''))}
          </h3>
        );
      }
      // Blockquotes (> ) - render as bold text (no border/gray line)
      else if (trimmedLine.startsWith('> ')) {
        flushParagraph();
        elements.push(
          <p key={`bq-${i}`} className="font-serif text-[15px] font-semibold text-foreground my-2 leading-relaxed">
            {stripAsterisks(trimmedLine.replace('> ', ''))}
          </p>
        );
      }
      // Bullet points (* or - )
      else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
        flushParagraph();
        elements.push(
          <div key={`li-${i}`} className="flex items-start gap-2 mb-1.5 ml-3">
            <span className="text-primary mt-0.5">•</span>
            <span className="font-serif text-[15px] leading-relaxed text-foreground">{stripAsterisks(trimmedLine.replace(/^[\*\-]\s/, ''))}</span>
          </div>
        );
      }
      // Empty lines
      else if (trimmedLine === '') {
        flushParagraph();
      }
      // Regular text
      else {
        currentParagraph.push(trimmedLine);
      }
    });
    
    flushParagraph();
    return elements;
  };

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      {parseTextWithHeaders(content.text)}
    </div>
  );
};

// Locked Menu Item - shows tool but triggers premium modal on click (for guest users)
const LockedMenuItem: React.FC<{
  icon: React.ElementType;
  label: string;
  featureName: string;
  onPremiumAttempt: (name: string) => void;
  destructive?: boolean;
}> = ({ icon: Icon, label, featureName, onPremiumAttempt, destructive }) => (
  <DropdownMenuItem 
    onClick={() => onPremiumAttempt(featureName)}
    className={`gap-2 ${destructive ? 'text-destructive/60' : 'opacity-80'}`}
  >
    <Lock className="w-3 h-3 text-muted-foreground" />
    <Icon className="w-4 h-4" />
    <span className="flex-1">{label}</span>
    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Premium</span>
  </DropdownMenuItem>
);

// Author Toolbar for Image Blocks (Available to Admin or Paid Owner)
interface AuthorImageToolbarProps {
  blockId: string;
  currentCaption: string;
  onEditCaption: (newCaption: string) => void;
  onRemove: () => void;
  onUpload: () => void;
  onManualSearch: () => void;
}

const AuthorImageToolbar: React.FC<AuthorImageToolbarProps> = ({
  currentCaption,
  onEditCaption,
  onRemove,
  onUpload,
  onManualSearch
}) => {
  const handleEditCaption = () => {
    const newCaption = window.prompt('Edit caption:', currentCaption);
    if (newCaption !== null && newCaption !== currentCaption) {
      onEditCaption(newCaption);
    }
  };

  return (
    <div className="absolute top-2 right-2 z-50 flex gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={(e) => { e.stopPropagation(); onManualSearch(); }}
        title="Search Gallery"
      >
        <Search className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={(e) => { e.stopPropagation(); onUpload(); }}
        title="Upload Own Photo"
      >
        <Upload className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={(e) => { e.stopPropagation(); handleEditCaption(); }}
        title="Edit Caption"
      >
        <Type className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove Image"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};

// Large "Add Image" button for empty blocks (drop zone style)
const AddImageButton: React.FC<{ onSearch: () => void }> = ({ onSearch }) => (
  <button
    onClick={(e) => {
      e.stopPropagation(); // CRITICAL: Prevents the page turn click
      onSearch();
    }}
    className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
  >
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
      <ImagePlus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>
    <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
      Add Image
    </span>
    <span className="text-xs text-muted-foreground/60">
      Click to search or upload
    </span>
  </button>
);

// Page Content Edit Modal
interface PageEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  isSaving: boolean;
}

const PageEditModal: React.FC<PageEditModalProps> = ({ open, onOpenChange, initialContent, onSave, isSaving }) => {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSave = async () => {
    await onSave(content);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            Edit Page Content
          </DialogTitle>
          <DialogDescription>
            Manually edit the text content of this page block.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[300px] font-serif"
            placeholder="Enter page content..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Insert Page Dialog - Choose block type for new page
type InsertDirection = 'before' | 'after';
type InsertBlockType = 'text' | 'image_full';

interface InsertPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (blockType: InsertBlockType) => void;
  direction: InsertDirection;
}

const InsertPageDialog: React.FC<InsertPageDialogProps> = ({ open, onOpenChange, onInsert, direction }) => {
  const blockOptions: { type: InsertBlockType; icon: React.ReactNode; label: string; description: string }[] = [
    { 
      type: 'text', 
      icon: <Type className="w-8 h-8" />, 
      label: 'Text Layout', 
      description: 'Rich text with headers and paragraphs' 
    },
    { 
      type: 'image_full', 
      icon: <Image className="w-8 h-8" />, 
      label: 'Full Page Image', 
      description: 'Full-bleed photograph with caption' 
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {direction === 'before' ? <PlusCircle className="w-5 h-5" /> : <PlusSquare className="w-5 h-5" />}
            Insert Page {direction === 'before' ? 'Before' : 'After'}
          </DialogTitle>
          <DialogDescription>
            What kind of page would you like to add?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {blockOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => {
                onInsert(option.type);
                onOpenChange(false);
              }}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent hover:border-primary transition-colors text-left group"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <span className="text-muted-foreground group-hover:text-primary transition-colors">
                  {option.icon}
                </span>
              </div>
              <div>
                <p className="font-medium text-foreground">{option.label}</p>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
interface ImageUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

const ImageUploadModal: React.FC<ImageUploadModalProps> = ({ open, onOpenChange, onUpload, isUploading }) => {
  const [hasRights, setHasRights] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !hasRights) return;
    await onUpload(selectedFile);
    setSelectedFile(null);
    setHasRights(false);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setHasRights(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Your Own Photo
          </DialogTitle>
          <DialogDescription>
            Upload a custom image to replace the AI-generated photo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection */}
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full gap-2"
            >
              <Upload className="w-4 h-4" />
              {selectedFile ? selectedFile.name : 'Choose Image File'}
            </Button>
            {selectedFile && (
              <p className="text-xs text-muted-foreground text-center">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {/* Liability Checkbox */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <Checkbox
              id="rights-checkbox"
              checked={hasRights}
              onCheckedChange={(checked) => setHasRights(checked === true)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="rights-checkbox" className="text-sm font-medium cursor-pointer">
                <AlertTriangle className="w-4 h-4 inline-block mr-1 text-amber-600" />
                I certify I have the rights to use this image.
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Commercial Risk:</strong> Do not use images with recognizable people. Without a signed Model Release, using a stranger's likeness on a product is a legal risk. Loom & Page is not liable for copyright infringement or misuse of uploaded content.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !hasRights || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload Photo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ImageFullPage: React.FC<{ 
  content: { query: string; caption: string }; 
  imageUrl?: string;
  attribution?: string;
  isLoading?: boolean;
  canEditImages?: boolean;
  blockId?: string;
  fetchAttempted?: boolean;
  onEditCaption?: (newCaption: string) => void;
  onRemove?: () => void;
  onManualSearch?: () => void;
  onUpload?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, fetchAttempted, onEditCaption, onRemove, onManualSearch, onUpload }) => {
  // Determine visual state:
  // - Show loading only when isLoading is explicitly true
  // - Show empty state (Add Image button) when: not loading, no image, AND fetch was attempted (or is manual)
  // - If fetchAttempted is false and not loading, still show the Add Image button so users can manually add
  const showLoading = isLoading === true;
  const showEmptyState = !isLoading && !imageUrl;
  
  return (
    <div className="flex flex-col h-full group">
      {showLoading ? (
        <div className="flex-1 bg-muted flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">Searching Archives...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{content.query}</p>
          </div>
        </div>
      ) : imageUrl ? (
        <div className="flex-1 flex items-center justify-center py-8 px-6">
          <div className="relative w-full max-w-[90%] max-h-[85%]">
            {canEditImages && blockId && onEditCaption && onRemove && onUpload && onManualSearch && (
              <AuthorImageToolbar
                blockId={blockId}
                currentCaption={content.caption}
                onEditCaption={onEditCaption}
                onRemove={onRemove}
                onUpload={onUpload}
                onManualSearch={onManualSearch}
              />
            )}
            <div className="w-full rounded-lg overflow-hidden shadow-lg">
              <img
                src={imageUrl}
                alt={content.caption}
                className="w-full h-auto max-h-[65vh] object-contain bg-muted/20"
                loading="lazy"
              />
            </div>
            {/* Compact caption below image */}
            {content.caption && (
              <div className="text-center mt-3 max-w-[80%] mx-auto">
                <p className="text-xs text-muted-foreground italic">{content.caption}</p>
                {canEditImages && onManualSearch && (
                  <button
                    type="button"
                    className="print:hidden mt-2 text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onManualSearch();
                    }}
                  >
                    AI-selected image — click to swap
                  </button>
                )}
              </div>
            )}
            {attribution && (
              <p className="text-[8px] text-muted-foreground/40 text-center mt-1">
                {attribution}
              </p>
            )}
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="flex-1 bg-muted flex items-center justify-center">
          <div className="text-center">
            {canEditImages && onManualSearch ? (
              <AddImageButton onSearch={onManualSearch} />
            ) : (
              <p className="text-sm text-muted-foreground">Image not found</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const ImageHalfPage: React.FC<{ 
  content: { query: string; caption: string }; 
  imageUrl?: string;
  attribution?: string;
  isLoading?: boolean;
  canEditImages?: boolean;
  blockId?: string;
  fetchAttempted?: boolean;
  onEditCaption?: (newCaption: string) => void;
  onRemove?: () => void;
  onManualSearch?: () => void;
  onUpload?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, fetchAttempted, onEditCaption, onRemove, onManualSearch, onUpload }) => {
  // Determine visual state:
  // - Show loading only when isLoading is explicitly true
  // - Show empty state (Add Image button) when: not loading and no image
  const showLoading = isLoading === true;
  const showEmptyState = !isLoading && !imageUrl;

  return (
    <div className="h-full flex flex-col group">
      <div className="h-1/2 relative">
        {showLoading ? (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Searching...</p>
            </div>
          </div>
        ) : imageUrl ? (
          <>
            {canEditImages && blockId && onEditCaption && onRemove && onUpload && onManualSearch && (
              <AuthorImageToolbar
                blockId={blockId}
                currentCaption={content.caption}
                onEditCaption={onEditCaption}
                onRemove={onRemove}
                onUpload={onUpload}
                onManualSearch={onManualSearch}
              />
            )}
            <img 
              src={imageUrl} 
              alt={content.caption}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </>
        ) : showEmptyState ? (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <div className="text-center">
              {canEditImages && onManualSearch ? (
                <AddImageButton onSearch={onManualSearch} />
              ) : (
                <p className="text-sm text-muted-foreground">Image not found</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div className="h-1/2 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="italic text-muted-foreground">
            {content.caption}
          </p>
          {canEditImages && onManualSearch && (
            <button
              type="button"
              className="print:hidden mt-2 text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
              onClick={(e) => {
                e.stopPropagation();
                onManualSearch();
              }}
            >
              AI-selected image — click to swap
            </button>
          )}
          {attribution && (
            <p className="text-[9px] text-muted-foreground/50 mt-2">
              {attribution}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Pro Tip page - LEFT-ALIGNED style with subtle left border (NO ITALICS)
const ProTipPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="h-full flex items-start justify-center pt-16 px-12">
    <div className="max-w-md border-l-2 border-muted-foreground/30 pl-4">
      {/* Small icon + label row */}
      <div className="flex items-center gap-2 mb-3">
        <Key className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground">
          PRO TIP
        </p>
      </div>
      {/* Left-aligned normal serif text (no italics) */}
      <p className="font-serif text-lg text-foreground leading-relaxed">
        {content.text}
      </p>
    </div>
  </div>
);

const HeadingPage: React.FC<{ content: { level: 2 | 3; text: string } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center px-8">
    {content.level === 2 ? (
      <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground text-center">
        {content.text}
      </h2>
    ) : (
      <h3 className="font-serif text-xl md:text-2xl font-medium text-foreground text-center">
        {content.text}
      </h3>
    )}
  </div>
);

const ListPage: React.FC<{ content: { items: string[]; ordered?: boolean } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center px-8">
    <div className="max-w-md">
      {content.ordered ? (
        <ol className="list-decimal list-inside space-y-3">
          {content.items.map((item, i) => (
            <li key={i} className="font-serif text-lg text-foreground">
              {item}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc list-inside space-y-3">
          {content.items.map((item, i) => (
            <li key={i} className="font-serif text-lg text-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

// Key Takeaway page - Professional summary box with left accent
const KeyTakeawayPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center px-12">
    <div className="max-w-lg bg-secondary/10 border-l-4 border-primary p-6 rounded-r-lg">
      <p className="text-xs font-bold tracking-[0.2em] uppercase text-primary mb-3">
        KEY TAKEAWAY
      </p>
      <p className="font-serif text-lg text-foreground leading-relaxed">
        {content.text}
      </p>
    </div>
  </div>
);

// QuotePage REMOVED - quotes now render as TextPage via fallback

// Divider page for visual breaks
const DividerPage: React.FC<{ content: { style?: 'minimal' | 'ornate' | 'line' } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center">
    {content.style === 'ornate' ? (
      <div className="text-4xl text-muted-foreground/30">❧</div>
    ) : content.style === 'line' ? (
      <div className="w-32 h-px bg-border" />
    ) : (
      <div className="flex gap-2">
        <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
        <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
      </div>
    )}
  </div>
);

// Block renderer dispatcher with auto-fetch support
const BlockRenderer: React.FC<{ 
  block: PageBlock; 
  loadingImages: Set<string>;
  imageAttributions: Map<string, string>;
  attemptedFetches: Set<string>;
  canEditImages?: boolean;
  onEditCaption?: (blockId: string, newCaption: string) => void;
  onRemove?: (blockId: string) => void;
  onManualSearch?: (blockId: string) => void;
  onUpload?: (blockId: string) => void;
}> = ({ block, loadingImages, imageAttributions, attemptedFetches, canEditImages, onEditCaption, onRemove, onManualSearch, onUpload }) => {
  const key = getBlockKey(block);
  const isLoading = loadingImages.has(key);
  const attribution = imageAttributions.get(key);
  const fetchAttempted = attemptedFetches.has(key);

  switch (block.block_type) {
    case 'chapter_title':
      return <ChapterTitlePage content={block.content as { chapter_number: number; title: string }} />;
    case 'text':
      return <TextPage content={block.content as { text: string }} />;
    case 'image_full':
      return (
        <ImageFullPage 
          content={block.content as { query: string; caption: string }} 
          imageUrl={block.image_url}
          attribution={attribution}
          isLoading={isLoading}
          fetchAttempted={fetchAttempted}
          canEditImages={canEditImages}
          blockId={block.id}
          onEditCaption={onEditCaption ? (c) => onEditCaption(block.id, c) : undefined}
          onRemove={onRemove ? () => onRemove(block.id) : undefined}
          onManualSearch={onManualSearch ? () => onManualSearch(block.id) : undefined}
          onUpload={onUpload ? () => onUpload(block.id) : undefined}
        />
      );
    case 'image_half':
      return (
        <ImageHalfPage 
          content={block.content as { query: string; caption: string }} 
          imageUrl={block.image_url}
          attribution={attribution}
          isLoading={isLoading}
          fetchAttempted={fetchAttempted}
          canEditImages={canEditImages}
          blockId={block.id}
          onEditCaption={onEditCaption ? (c) => onEditCaption(block.id, c) : undefined}
          onRemove={onRemove ? () => onRemove(block.id) : undefined}
          onManualSearch={onManualSearch ? () => onManualSearch(block.id) : undefined}
          onUpload={onUpload ? () => onUpload(block.id) : undefined}
        />
      );
    case 'pro_tip':
      return <ProTipPage content={block.content as { text: string }} />;
    case 'heading':
      return <HeadingPage content={block.content as { level: 2 | 3; text: string }} />;
    case 'list':
      return <ListPage content={block.content as { items: string[]; ordered?: boolean }} />;
    case 'divider':
      return <DividerPage content={block.content as { style?: 'minimal' | 'ornate' | 'line' }} />;
    default: {
      // Fallback: Render unknown block types (including 'quote', 'key_takeaway') as TextPage
      const blockType = (block as any).block_type;
      const content = (block as any).content;
      
      // Handle key_takeaway blocks
      if (blockType === 'key_takeaway') {
        return <KeyTakeawayPage content={content as { text: string }} />;
      }
      
      // Handle quote blocks as plain text (no special styling)
      if (blockType === 'quote') {
        const quoteContent = content as { text: string; attribution?: string };
        const textWithAttribution = quoteContent.attribution 
          ? `${quoteContent.text}\n\n— ${quoteContent.attribution}`
          : quoteContent.text;
        return <TextPage content={{ text: textWithAttribution }} />;
      }
      
      // Any other unknown type: try to render as text if it has a text field
      if (content?.text) {
        return <TextPage content={{ text: content.text }} />;
      }
      
      // Last resort: show unknown block message
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground">Unknown block type: {blockType}</p>
        </div>
      );
    }
  }
};

export const PageViewer: React.FC<PageViewerProps> = ({ 
  bookId, 
  initialChapter = 1,
  totalChapters = 10,
  onPageChange,
  onChapterChange,
  preloadedBlocks,
  totalPageCount,
  isAdmin = false,
  canEditImages = false,
  isOfficial = false,
  topic = '',
  tableOfContents = [],
  onBlocksUpdate,
  isGrayscale = false,
  onGrayscaleChange,
  hasFullAccess = true,
  onPremiumFeatureAttempt
}) => {
  const [blocks, setBlocks] = useState<PageBlockMeta[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(initialChapter);
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [imageAttributions, setImageAttributions] = useState<Map<string, string>>(new Map());
  
  // Image upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Manual search dialog state
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchingBlockId, setSearchingBlockId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Track which blocks we've already attempted to fetch (to prevent infinite loops)
  const attemptedFetchesRef = useRef<Set<string>>(new Set());
  const [attemptedFetches, setAttemptedFetches] = useState<Set<string>>(new Set());

  // Once a chapter is hydrated from DB (blocks have real IDs), ignore further preloaded overwrites.
  const hydratedChaptersRef = useRef<Set<number>>(new Set());
  
  // Page edit modal state (Admin only)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  // Insert page dialog state (Admin only)
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [insertDirection, setInsertDirection] = useState<InsertDirection>('after');
  const [isInserting, setIsInserting] = useState(false);

  // Sync with external chapter changes (from TOC clicks)
  useEffect(() => {
    if (initialChapter !== currentChapter) {
      setCurrentChapter(initialChapter);
    }
  }, [initialChapter]);

  // Find the chapter_title block index to start on
  const findTitleBlockIndex = useCallback((blockList: PageBlock[]): number => {
    const titleIndex = blockList.findIndex(b => b.block_type === 'chapter_title');
    return titleIndex >= 0 ? titleIndex : 0;
  }, []);

  // Keep parent `preloadedBlocks` in sync with local edits so generation-time
  // rerenders don't wipe out image URLs (or other edits).
  const setBlocksAndPropagate = useCallback(
    (chapterNum: number, updater: (prev: PageBlock[]) => PageBlock[]) => {
      setBlocks(prev => {
        const next = updater(prev);
        onBlocksUpdate?.(chapterNum, next);
        return next;
      });
    },
    [onBlocksUpdate]
  );

  const normalizeUrlForCompare = useCallback((url: string): string => {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return url;
    }
  }, []);

  const getBlockExclusionUrl = useCallback(
    (b: Partial<PageBlockMeta> | null | undefined): string | null => {
      if (!b) return null;
      const original = (b as any).original_url as string | undefined;
      const imageUrl = (b as any).image_url as string | undefined;
      const picked = original || imageUrl;
      if (!picked || typeof picked !== 'string') return null;
      if (!picked.startsWith('http://') && !picked.startsWith('https://')) return null;
      return normalizeUrlForCompare(picked);
    },
    [normalizeUrlForCompare]
  );

  // Collect already-used image URLs for deduplication
  const getUsedImageUrls = useCallback((): string[] => {
    const urls: string[] = [];
    const add = (b: any) => {
      const u = getBlockExclusionUrl(b);
      if (u) urls.push(u);
    };

    // Current chapter blocks
    blocks.forEach(add);

    // Also include ALL preloaded blocks (book-level dedupe when available)
    if (preloadedBlocks) {
      Object.values(preloadedBlocks).forEach((chapterBlocks) => chapterBlocks?.forEach(add));
    }

    return [...new Set(urls)];
  }, [blocks, preloadedBlocks, getBlockExclusionUrl]);

  // Serialize auto-fetches to avoid race-condition duplicates (two blocks grabbing the same image at once)
  const imageFetchQueueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueueImageFetch = useCallback((task: () => Promise<void>) => {
    imageFetchQueueRef.current = imageFetchQueueRef.current.then(task).catch(() => {});
    return imageFetchQueueRef.current;
  }, []);

  // Auto-fetch images for blocks without URLs using the hybrid engine
  const fetchImageForBlock = useCallback(
    async (block: PageBlockMeta) => {
      const key = getBlockKey(block);

      // Queue all fetches to avoid race duplicates.
      return enqueueImageFetch(async () => {
        // We still allow fetching during generation even if the DB row isn't visible yet.
        // We'll best-effort persist to DB when possible.
        if (fetchingImages.has(key)) return;
        fetchingImages.add(key);

        setLoadingImages(prev => new Set(prev).add(key));

        const content = block.content as { query: string; caption: string };
        const baseQuery = (content?.query || '').trim();
        if (!baseQuery) {
          fetchingImages.delete(key);
          setLoadingImages(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          return;
        }

        // Try a few times to guarantee: (1) we get an image, and (2) it's not a duplicate.
        const MAX_ATTEMPTS = 5;
        const excludeSet = new Set(getUsedImageUrls());

        const fallbackQueries: string[] = [
          baseQuery,
          topic ? `${topic} ${baseQuery}` : baseQuery,
          topic ? `${topic} landscape` : `${baseQuery.split(' ').slice(0, 2).join(' ')} landscape`,
          topic ? `${topic} scenic landscape` : 'luxury travel landscape',
        ];

        console.log('[PageViewer] Auto-fetching image via hybrid engine:', baseQuery);

        try {
          for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const queryToUse = fallbackQueries[Math.min(i, fallbackQueries.length - 1)];

            const { data, error } = await supabase.functions.invoke('fetch-book-images', {
              body: {
                query: queryToUse,
                orientation: 'landscape',
                excludeUrls: [...excludeSet],
                bookTopic: topic,
              }
            });

            if (error) throw error;

            const candidateUrl = (data?.imageUrl as string | null) || null;
            if (!candidateUrl) {
              continue;
            }

            const candidateKey = normalizeUrlForCompare(candidateUrl);
            if (excludeSet.has(candidateKey)) {
              // Defensive: if backend returns something already used, add & retry.
              excludeSet.add(candidateKey);
              continue;
            }

            // Persist best-effort (with full provenance fields for manifest tracking)
            if (hasValidDbId(block)) {
              const updatePayload: any = {
                image_url: candidateUrl,
                image_source: data?.source || null,
                image_license: data?.license || null,
                image_attribution: data?.attribution || null,
                original_url: candidateUrl,
                archived_at: new Date().toISOString(),
              };
              const { error: updateError } = await supabase
                .from('book_pages')
                .update(updatePayload)
                .eq('id', block.id);

              if (updateError) {
                console.warn('[PageViewer] Failed to persist image_url to DB (continuing locally):', updateError);
              }
            }

            // Store attribution if present
            if (data?.attribution) {
              setImageAttributions(prev => new Map(prev).set(key, data.attribution));
            }

            // Update local state (+ parent cache) including original_url so dedupe works even after archiving.
            const localPatch: any = {
              image_url: candidateUrl,
              image_source: data?.source,
              image_license: data?.license,
              original_url: candidateUrl,
              image_attribution: data?.attribution,
              archived_at: new Date().toISOString(),
            };

            setBlocksAndPropagate(block.chapter_number, (prevBlocks) =>
              prevBlocks.map(b => (getBlockKey(b) === key ? ({ ...b, ...localPatch } as any) : b))
            );

            return;
          }

          // Last resort: ensure we always show *something* instead of leaving the page blank.
          const placeholderUrl = '/placeholder.svg';
          setBlocksAndPropagate(block.chapter_number, (prevBlocks) =>
            prevBlocks.map(b => (getBlockKey(b) === key ? ({ ...b, image_url: placeholderUrl } as any) : b))
          );
        } catch (err) {
          console.error('[PageViewer] Failed to fetch image:', err);
          // Ensure the user isn't stuck with a blank image forever.
          const placeholderUrl = '/placeholder.svg';
          setBlocksAndPropagate(block.chapter_number, (prevBlocks) =>
            prevBlocks.map(b => (getBlockKey(b) === key ? ({ ...b, image_url: placeholderUrl } as any) : b))
          );
        } finally {
          fetchingImages.delete(key);
          setLoadingImages(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      });
    },
    [enqueueImageFetch, getUsedImageUrls, normalizeUrlForCompare, setBlocksAndPropagate, topic]
  );

  // Refs to track current state without causing re-renders in useCallback
  const blocksRef = useRef<PageBlockMeta[]>([]);
  const currentIndexRef = useRef(0);
  const currentChapterRef = useRef(currentChapter);
  // Prevent late async fetches from overwriting navigation state (causes page flicker)
  const fetchSeqRef = useRef(0);
  // Ref for preloadedBlocks to avoid recreating fetchBlocks on every update
  const preloadedBlocksRef = useRef(preloadedBlocks);
  
  // Keep refs in sync with state
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);
  
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  
  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);
  
  useEffect(() => {
    preloadedBlocksRef.current = preloadedBlocks;
  }, [preloadedBlocks]);

  // Fetch blocks for a chapter - prefer preloaded, fallback to DB
  // IMPORTANT: This callback must NOT depend on blocks/currentIndex/preloadedBlocks state to avoid infinite loops
  const fetchBlocks = useCallback(async (chapter: number) => {
    // Every call increments the sequence. Only the latest call is allowed to apply state.
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;

    // Read preloadedBlocks from ref to avoid circular dependency
    const currentPreloadedBlocks = preloadedBlocksRef.current;

    // We may receive preloaded blocks first (fast), but we still need to hydrate from DB
    // so blocks have real IDs (required for auto-fetch + manual image tools) and so
    // subsequent preloaded updates don't wipe out hydrated state.
    const preloaded = currentPreloadedBlocks?.[chapter];
    const hasPreloaded = !!preloaded && preloaded.length > 0;
    const alreadyHydrated = hydratedChaptersRef.current.has(chapter);

    if (hasPreloaded && !alreadyHydrated) {
      console.log('[PageViewer] Using preloaded blocks for chapter', chapter, preloaded!.length);
      setBlocks(preloaded!);
      // Preserve using *latest* navigation state (user may have navigated while fetch was inflight)
      if (!isStale()) {
        const latestBlocks = blocksRef.current;
        const latestIdx = currentIndexRef.current;
        const latestChapter = currentChapterRef.current;
        const preserveKeyNow =
          chapter === latestChapter && latestBlocks[latestIdx]
            ? getBlockKey(latestBlocks[latestIdx])
            : null;

        if (preserveKeyNow) {
          const idx = preloaded!.findIndex(b => getBlockKey(b) === preserveKeyNow);
          setCurrentIndex(idx >= 0 ? idx : findTitleBlockIndex(preloaded!));
        } else {
          setCurrentIndex(findTitleBlockIndex(preloaded!));
        }

        setLoading(false);
      }
    } else if (!hasPreloaded) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('book_pages')
        .select('*')
        .eq('book_id', bookId)
        .eq('chapter_number', chapter)
        .order('page_order', { ascending: true });

      if (error) throw error;
      
      // Map database rows to PageBlock type
      const mappedBlocks: PageBlockMeta[] = (data || []).map(row => ({
        id: row.id,
        book_id: row.book_id,
        chapter_number: row.chapter_number,
        page_order: row.page_order,
        block_type: row.block_type as PageBlock['block_type'],
        content: row.content as any,
        image_url: row.image_url || undefined,
        original_url: (row as any).original_url || undefined,
        image_source: (row as any).image_source || undefined,
        image_license: (row as any).image_license || undefined,
        image_attribution: (row as any).image_attribution || undefined,
        archived_at: (row as any).archived_at || undefined,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
      
      // If DB has rows, prefer them (real IDs + freshest image_url)
      if (mappedBlocks.length > 0) {
        if (isStale()) return;

        hydratedChaptersRef.current.add(chapter);
        setBlocks(mappedBlocks);

        // Preserve using *latest* navigation state (user may have navigated while fetch was inflight)
        const latestBlocks = blocksRef.current;
        const latestIdx = currentIndexRef.current;
        const latestChapter = currentChapterRef.current;
        const preserveKeyNow =
          chapter === latestChapter && latestBlocks[latestIdx]
            ? getBlockKey(latestBlocks[latestIdx])
            : null;

        if (preserveKeyNow) {
          const idx = mappedBlocks.findIndex(b => getBlockKey(b) === preserveKeyNow);
          setCurrentIndex(idx >= 0 ? idx : findTitleBlockIndex(mappedBlocks));
        } else {
          setCurrentIndex(findTitleBlockIndex(mappedBlocks));
        }
      } else if (!hasPreloaded) {
        // No DB rows and no preloaded blocks -> stay in loading state
        if (!isStale()) setBlocks([]);
      }
    } catch (err) {
      console.error('Error fetching blocks:', err);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [bookId, findTitleBlockIndex]); // Removed preloadedBlocks from deps - now read from ref

  // Auto-trigger image fetch for blocks without images on mount
  // ALL users (including Admins) get auto-populated images, Admins can manually override via toolbar
  useEffect(() => {
    blocks.forEach(block => {
      const key = getBlockKey(block);
      const isImageBlock = ['image_full', 'image_half'].includes(block.block_type);
      const hasNoImage = !block.image_url;
      const notLoading = !loadingImages.has(key);
      const notAttempted = !attemptedFetchesRef.current.has(key);
      
      if (isImageBlock && hasNoImage && notLoading && notAttempted) {
        // Mark as attempted to prevent duplicate fetches
        attemptedFetchesRef.current.add(key);
        setAttemptedFetches(prev => new Set(prev).add(key));
        fetchImageForBlock(block);
      }
    });
  }, [blocks, fetchImageForBlock, loadingImages]);

  // Admin image control handlers

  const handleEditCaption = useCallback(async (blockId: string, newCaption: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !['image_full', 'image_half'].includes(block.block_type)) return;

    const currentContent = block.content as { query: string; caption: string };
    const updatedContent = { ...currentContent, caption: newCaption };

    // Update database
    const { error } = await supabase
      .from('book_pages')
      .update({ content: updatedContent })
      .eq('id', blockId);

    if (error) {
      // Still update locally so Admin flow works during generation/sync.
      toast.error('Failed to save caption to the backend (showing locally).');
    } else {
      toast.success('Caption updated');
    }

    // Update local state (and parent cache) regardless
    setBlocksAndPropagate(block.chapter_number, (prev) =>
      prev.map(b => (b.id !== blockId ? b : ({ ...b, content: updatedContent } as PageBlock)))
    );
  }, [blocks, setBlocksAndPropagate]);

  const handleReroll = useCallback(async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !['image_full', 'image_half'].includes(block.block_type)) return;

    const key = getBlockKey(block);

    // Clear current image and refetch (best-effort)
    const { error: clearErr } = await supabase
      .from('book_pages')
      .update({ image_url: null })
      .eq('id', blockId);

    if (clearErr) {
      console.warn('[PageViewer] Failed to clear image_url in DB (continuing locally):', clearErr);
    }

    // Reset attempted fetch flag so fetchImageForBlock will run again
    attemptedFetchesRef.current.delete(key);
    setAttemptedFetches(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

      setBlocksAndPropagate(block.chapter_number, (prev) =>
        prev.map(b => (b.id !== blockId ? b : ({ ...b, image_url: undefined, original_url: undefined } as any)))
    );

    toast.info('Finding new image...');
    const updatedBlock = { ...block, image_url: undefined, original_url: undefined } as any;
    fetchImageForBlock(updatedBlock);
  }, [blocks, fetchImageForBlock, setBlocksAndPropagate]);

  const handleRemoveImage = useCallback(async (blockId: string) => {
    const { error } = await supabase
      .from('book_pages')
      .update({ image_url: null })
      .eq('id', blockId);

    if (error) {
      toast.error('Failed to remove image in the backend (removing locally).');
    }

    const block = blocks.find(b => b.id === blockId);
    setBlocksAndPropagate(block?.chapter_number ?? currentChapter, (prev) =>
      prev.map(b => (b.id !== blockId ? b : ({ ...b, image_url: undefined } as PageBlock)))
    );

    if (!error) toast.success('Image removed');
  }, [blocks, currentChapter, setBlocksAndPropagate]);

  // Open manual search dialog - works even if block isn't synced to DB yet
  const handleOpenSearchDialog = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !['image_full', 'image_half'].includes(block.block_type)) return;

    // No longer showing "still syncing" toast - we'll update locally and persist later
    const currentContent = block.content as { query: string; caption: string };
    setSearchingBlockId(blockId);
    setSearchQuery(currentContent.query || '');
    setSearchDialogOpen(true);
  }, [blocks]);

  // Handle image selection from gallery (with archiving for provenance)
  const handleImageSelect = useCallback(async (imageUrl: string, attribution?: string, metadata?: ImageSelectMetadata) => {
    if (!searchingBlockId) return;
    
    const block = blocks.find(b => b.id === searchingBlockId);
    if (!block) return;
    const key = getBlockKey(block);

    try {
      let finalImageUrl = imageUrl;
      let imageMetadata = metadata;

      // Archive the image to permanent storage if metadata is provided
      if (metadata && hasValidDbId(block)) {
        const archiveResult = await archiveExternalImage(
          imageUrl,
          block.book_id,
          metadata.source,
          metadata.attribution
        );

        if (archiveResult) {
          finalImageUrl = archiveResult.archivedUrl;
          // Save with full metadata
          await saveImageMetadata(block.id, archiveResult.archivedUrl, archiveResult.metadata);
        } else {
          // Fallback: just save the URL without archiving
          const { error: updateErr } = await supabase
            .from('book_pages')
            .update({ 
              image_url: imageUrl,
              image_source: metadata.source,
              original_url: metadata.originalUrl,
              image_license: metadata.license,
              image_attribution: metadata.attribution,
              archived_at: new Date().toISOString(),
            })
            .eq('id', searchingBlockId);

          if (updateErr) {
            console.warn('[PageViewer] Failed to persist selected image to DB (continuing locally):', updateErr);
          }
        }
      } else {
        // No metadata - just update the URL
        const { error: updateErr } = await supabase
          .from('book_pages')
          .update({ image_url: imageUrl })
          .eq('id', searchingBlockId);

        if (updateErr) {
          console.warn('[PageViewer] Failed to persist selected image to DB (continuing locally):', updateErr);
        }
      }

      // Update local state
      const localMetaPatch: any = {
        image_url: finalImageUrl,
        image_source: metadata?.source,
        // If we archived, the archive result includes the original URL; otherwise use the provided metadata.
        original_url: (metadata?.originalUrl || (metadata as any)?.original_url) ?? imageUrl,
        image_license: metadata?.license,
        image_attribution: metadata?.attribution,
        archived_at: new Date().toISOString(),
      };

      setBlocksAndPropagate(block.chapter_number, (prev) =>
        prev.map(b => (b.id !== searchingBlockId ? b : ({ ...b, ...localMetaPatch } as any)))
      );

      // Store attribution if present
      if (attribution) {
        setImageAttributions(prev => new Map(prev).set(key, attribution));
      }

      // Mark as fetched so loading state clears
      attemptedFetchesRef.current.add(key);
      setAttemptedFetches(prev => new Set(prev).add(key));
      setLoadingImages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      toast.success('Image updated!');
    } catch (err) {
      console.error('Failed to update image:', err);
      toast.error('Failed to update image');
    } finally {
      setSearchingBlockId(null);
      setSearchQuery('');
    }
  }, [searchingBlockId, blocks, setBlocksAndPropagate]);


  // Handle opening upload modal - works even if block isn't synced to DB yet
  const handleOpenUploadModal = useCallback((blockId: string) => {
    // No longer showing "still syncing" toast - we'll update locally and persist later
    setUploadingBlockId(blockId);
    setUploadModalOpen(true);
  }, []);

  // Handle image upload from modal (with "Rights Certified" metadata)
  const handleImageUpload = useCallback(async (file: File) => {
    if (!uploadingBlockId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${uploadingBlockId}-${Date.now()}.${fileExt}`;
      const filePath = `user-uploads/${fileName}`;

      const publicUrl = await uploadToBookImages({
        path: filePath,
        data: file,
        // Let the browser provide File.type when available.
        contentType: file.type || undefined,
        upsert: true,
      });

      // Create metadata for user upload
      const uploadMetadata = createUploadMetadata('Loom & Page Publisher');

      // Update database with new image URL and metadata
      const { error: updateError } = await supabase
        .from('book_pages')
        .update({ 
          image_url: publicUrl,
          image_source: uploadMetadata.image_source,
          original_url: uploadMetadata.original_url,
          image_license: uploadMetadata.image_license,
          image_attribution: uploadMetadata.image_attribution,
          archived_at: uploadMetadata.archived_at,
        })
        .eq('id', uploadingBlockId);

      if (updateError) {
        console.warn('[PageViewer] Failed to persist uploaded image_url to DB (continuing locally):', updateError);
      }

      // Update local state
      const block = blocks.find(b => b.id === uploadingBlockId);
      if (block) {
        const key = getBlockKey(block);
        
        // Mark fetch as attempted so loading state clears
        attemptedFetchesRef.current.add(key);
        setAttemptedFetches(prev => new Set(prev).add(key));
        setLoadingImages(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });

        setBlocksAndPropagate(block.chapter_number, (prev) =>
          prev.map(b => (b.id !== uploadingBlockId ? b : ({
            ...b,
            image_url: publicUrl,
            image_source: uploadMetadata.image_source,
            original_url: uploadMetadata.original_url ?? undefined,
            image_license: uploadMetadata.image_license,
            image_attribution: uploadMetadata.image_attribution,
            archived_at: uploadMetadata.archived_at,
          } as any)))
        );
      }

      // Close the modal
      setUploadModalOpen(false);
      toast.success('Image uploaded successfully!');
    } catch (err) {
      console.error('[PageViewer] Upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
      setUploadingBlockId(null);
    }
  }, [uploadingBlockId, blocks, setBlocksAndPropagate]);

  // Handle cropped image upload from gallery (with archiving for provenance)
  const handleCroppedImageUpload = useCallback(async (croppedBlob: Blob, attribution?: string, metadata?: ImageSelectMetadata) => {
    if (!searchingBlockId) return;

    const block = blocks.find(b => b.id === searchingBlockId);
    if (!block) return;

    const key = getBlockKey(block);

    try {
      const fileName = `${searchingBlockId}-cropped-${Date.now()}.jpg`;
      const filePath = `user-uploads/${fileName}`;

      const publicUrl = await uploadToBookImages({
        path: filePath,
        data: croppedBlob,
        contentType: 'image/jpeg',
        upsert: true,
      });

      // Save with metadata if provided (from gallery selection before cropping)
      if (metadata && hasValidDbId(block)) {
        await supabase
          .from('book_pages')
          .update({ 
            image_url: publicUrl,
            image_source: metadata.source,
            original_url: metadata.originalUrl, // Original URL before crop
            image_license: metadata.license,
            image_attribution: metadata.attribution,
            archived_at: new Date().toISOString(),
          })
          .eq('id', searchingBlockId);
      } else {
        // Fallback: just update the URL
        const { error: updateError } = await supabase
          .from('book_pages')
          .update({ image_url: publicUrl })
          .eq('id', searchingBlockId);

        if (updateError) {
          console.warn('[PageViewer] Failed to persist cropped image_url to DB (continuing locally):', updateError);
        }
      }

      // Update local state - preserves current page position
      setBlocksAndPropagate(block.chapter_number, (prev) =>
        prev.map(b => (b.id !== searchingBlockId ? b : ({
          ...b,
          image_url: publicUrl,
          image_source: metadata?.source,
          original_url: metadata?.originalUrl,
          image_license: metadata?.license,
          image_attribution: metadata?.attribution,
          archived_at: new Date().toISOString(),
        } as any)))
      );

      // Store attribution if present
      if (attribution) {
        setImageAttributions(prev => new Map(prev).set(key, attribution));
      }

      // Mark as fetched so loading state clears
      attemptedFetchesRef.current.add(key);
      setAttemptedFetches(prev => new Set(prev).add(key));
      setLoadingImages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      toast.success('Cropped image uploaded!');
    } catch (err) {
      console.error('[PageViewer] Cropped upload error:', err);
      toast.error('Failed to upload cropped image');
    } finally {
      setSearchingBlockId(null);
      setSearchQuery('');
    }
  }, [searchingBlockId, blocks, setBlocksAndPropagate]);

  // Admin: Regenerate current chapter
  const handleRegenerateChapter = useCallback(async () => {
    if (!isAdmin) return;
    
    const confirm = window.confirm(`Regenerate Chapter ${currentChapter}? This will replace all existing content.`);
    if (!confirm) return;
    
    setIsRegenerating(true);
    toast.info(`Regenerating Chapter ${currentChapter}...`);
    
    try {
      const tocEntry = tableOfContents.find((ch) => ch.chapter === currentChapter);
      const { data, error } = await supabase.functions.invoke('generate-chapter-blocks', {
        body: {
          bookId,
          chapterNumber: currentChapter,
          chapterTitle: tocEntry?.title || `Chapter ${currentChapter}`,
          topic,
          tableOfContents,
          targetPagesPerChapter: 10,
        },
      });
      
      if (error) throw error;
      if (!data?.blocks) throw new Error('No blocks returned');
      
      // Update local state
      setBlocks(data.blocks);
      setCurrentIndex(0);
      
      // Notify parent
      onBlocksUpdate?.(currentChapter, data.blocks);
      
      toast.success(`Chapter ${currentChapter} regenerated!`);
    } catch (err) {
      console.error('Failed to regenerate chapter:', err);
      toast.error('Failed to regenerate chapter');
    } finally {
      setIsRegenerating(false);
    }
  }, [isAdmin, currentChapter, bookId, topic, tableOfContents, onBlocksUpdate]);

  // Admin: Open edit modal for current page
  const handleOpenEditModal = useCallback(() => {
    const currentBlock = blocks[currentIndex];
    if (!currentBlock) return;
    
    // Extract text content from the block
    let textContent = '';
    const content = currentBlock.content as Record<string, unknown>;
    
    if (currentBlock.block_type === 'text' && content.text) {
      textContent = content.text as string;
    } else if (currentBlock.block_type === 'pro_tip' && content.text) {
      textContent = content.text as string;
    } else if (currentBlock.block_type === 'quote' && content.text) {
      textContent = content.text as string;
    } else if (currentBlock.block_type === 'heading' && content.text) {
      textContent = content.text as string;
    } else if (currentBlock.block_type === 'chapter_title' && content.title) {
      textContent = content.title as string;
    } else if (currentBlock.block_type === 'list' && Array.isArray(content.items)) {
      textContent = (content.items as string[]).join('\n');
    } else if (['image_full', 'image_half'].includes(currentBlock.block_type) && content.caption) {
      textContent = content.caption as string;
    } else {
      textContent = JSON.stringify(content, null, 2);
    }
    
    setEditingContent(textContent);
    setEditModalOpen(true);
  }, [blocks, currentIndex]);

  // Admin: Save edited content
  const handleSaveEdit = useCallback(async (newContent: string) => {
    const currentBlock = blocks[currentIndex];
    if (!currentBlock) return;
    
    setIsSavingEdit(true);
    
    try {
      // Build updated content based on block type
      let updatedContent: Record<string, unknown> = { ...(currentBlock.content as Record<string, unknown>) };
      
      if (currentBlock.block_type === 'text') {
        updatedContent.text = newContent;
      } else if (currentBlock.block_type === 'pro_tip') {
        updatedContent.text = newContent;
      } else if (currentBlock.block_type === 'quote') {
        updatedContent.text = newContent;
      } else if (currentBlock.block_type === 'heading') {
        updatedContent.text = newContent;
      } else if (currentBlock.block_type === 'chapter_title') {
        updatedContent.title = newContent;
      } else if (currentBlock.block_type === 'list') {
        updatedContent.items = newContent.split('\n').filter(line => line.trim());
      } else if (['image_full', 'image_half'].includes(currentBlock.block_type)) {
        updatedContent.caption = newContent;
      }
      
      // Update database
      const { error } = await supabase
        .from('book_pages')
        .update({ content: updatedContent as unknown as import('@/integrations/supabase/types').Json })
        .eq('id', currentBlock.id);
      
      if (error) throw error;
      
      // Update local state
      setBlocks(prev => prev.map(b => {
        if (b.id !== currentBlock.id) return b;
        return { ...b, content: updatedContent } as PageBlock;
      }));
      
      toast.success('Page content updated');
    } catch (err) {
      console.error('Failed to save edit:', err);
      toast.error('Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  }, [blocks, currentIndex]);

  // Admin: Delete current page
  const handleDeletePage = useCallback(async () => {
    const currentBlock = blocks[currentIndex];
    if (!currentBlock) return;
    
    const confirm = window.confirm('Delete this page? This cannot be undone.');
    if (!confirm) return;
    
    try {
      const { error } = await supabase
        .from('book_pages')
        .delete()
        .eq('id', currentBlock.id);
      
      if (error) throw error;
      
      // Update local state - remove the block
      const newBlocks = blocks.filter(b => b.id !== currentBlock.id);
      setBlocks(newBlocks);
      
      // Adjust current index if needed
      if (currentIndex >= newBlocks.length && newBlocks.length > 0) {
        setCurrentIndex(newBlocks.length - 1);
      }
      
      // Notify parent
      onBlocksUpdate?.(currentChapter, newBlocks);
      
      toast.success('Page deleted');
    } catch (err) {
      console.error('Failed to delete page:', err);
      toast.error('Failed to delete page');
    }
  }, [blocks, currentIndex, currentChapter, onBlocksUpdate]);

  // Admin: Insert a new page before/after current
  const handleInsertPage = useCallback(async (blockType: InsertBlockType) => {
    if (!isAdmin) return;
    
    setIsInserting(true);
    toast.info('Inserting new page...');
    
    try {
      const currentBlock = blocks[currentIndex];
      if (!currentBlock) throw new Error('No current block');
      
      // Step A: Calculate new page_order
      const targetOrder = insertDirection === 'before' 
        ? currentBlock.page_order 
        : currentBlock.page_order + 1;
      
      // Step B: Create new block content based on type
      let newContent: Record<string, unknown>;
      if (blockType === 'text') {
        newContent = { 
          text: "## New Page Title\n\nStart writing here. Use Markdown headers to structure your content.\n\n### Subheader\n\nAdd your detailed content in this section. Aim for 220-250 words for optimal 6x9 page fit." 
        };
      } else {
        // image_full
        newContent = { 
          query: "", 
          caption: "Enter caption..." 
        };
      }
      
      // Step C: Identify all subsequent blocks that need page_order increment
      const blocksToShift = blocks.filter(b => b.page_order >= targetOrder);
      
      // Step D: Perform bulk operations in Supabase
      // First, shift all subsequent blocks by +1
      if (blocksToShift.length > 0) {
        for (const block of blocksToShift) {
          await supabase
            .from('book_pages')
            .update({ page_order: block.page_order + 1 })
            .eq('id', block.id);
        }
      }
      
      // Insert the new block (let Supabase generate the ID)
      const { data: insertedBlock, error: insertError } = await supabase
        .from('book_pages')
        .insert({
          book_id: bookId,
          chapter_number: currentChapter,
          page_order: targetOrder,
          block_type: blockType,
          content: newContent as unknown as import('@/integrations/supabase/types').Json,
          image_url: null
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      // Step E: Update local state
      const newBlock: PageBlock = {
        id: insertedBlock.id,
        book_id: insertedBlock.book_id,
        chapter_number: insertedBlock.chapter_number,
        page_order: insertedBlock.page_order,
        block_type: insertedBlock.block_type as PageBlock['block_type'],
        content: insertedBlock.content as any,
        image_url: insertedBlock.image_url || undefined,
        created_at: insertedBlock.created_at,
        updated_at: insertedBlock.updated_at
      };
      
      // Update blocks array: shift orders and insert new block
      const updatedBlocks = blocks.map(b => {
        if (b.page_order >= targetOrder) {
          return { ...b, page_order: b.page_order + 1 };
        }
        return b;
      });
      
      // Insert new block at correct position
      const insertIndex = updatedBlocks.findIndex(b => b.page_order > targetOrder);
      if (insertIndex === -1) {
        updatedBlocks.push(newBlock);
      } else {
        updatedBlocks.splice(insertIndex, 0, newBlock);
      }
      
      // Sort by page_order to ensure correct order
      updatedBlocks.sort((a, b) => a.page_order - b.page_order);
      
      setBlocks(updatedBlocks);
      
      // Navigate to the new page
      const newPageIndex = updatedBlocks.findIndex(b => b.id === newBlock.id);
      if (newPageIndex >= 0) {
        setCurrentIndex(newPageIndex);
      }
      
      // Notify parent
      onBlocksUpdate?.(currentChapter, updatedBlocks);
      
      toast.success('Page inserted! Click "Edit Page Content" to customize.');
    } catch (err) {
      console.error('Failed to insert page:', err);
      toast.error('Failed to insert page');
    } finally {
      setIsInserting(false);
    }
  }, [isAdmin, blocks, currentIndex, insertDirection, bookId, currentChapter, onBlocksUpdate]);
  // Track preloaded blocks changes with a stable reference
  const preloadedBlocksLengthRef = useRef<Record<number, number>>({});
  
  // Track the preloaded blocks length for triggering fetches
  const currentPreloadedLength = preloadedBlocks?.[currentChapter]?.length || 0;
  
  useEffect(() => {
    // Only re-fetch if the chapter changes OR if preloaded blocks for this chapter
    // have newly arrived (length changed from 0 to >0)
    const prevLength = preloadedBlocksLengthRef.current[currentChapter] || 0;
    const hasNewPreloadedData = prevLength === 0 && currentPreloadedLength > 0;
    
    // Update the ref
    preloadedBlocksLengthRef.current[currentChapter] = currentPreloadedLength;
    
    // Only fetch if this is a new chapter or we just got preloaded data
    if (hasNewPreloadedData || !hydratedChaptersRef.current.has(currentChapter)) {
      fetchBlocks(currentChapter);
    }
  }, [currentChapter, fetchBlocks, currentPreloadedLength]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // IMPORTANT: don't hijack keyboard when user is typing OR interacting with any open dialog.
      const target = e.target as HTMLElement | null;
      const active = (document.activeElement as HTMLElement | null) ?? null;

      const isTypingEl = (el: HTMLElement | null) => {
        const tag = el?.tagName?.toLowerCase();
        return (
          tag === 'input' ||
          tag === 'textarea' ||
          (el ? (el as any).isContentEditable === true : false) ||
          el?.getAttribute?.('role') === 'textbox'
        );
      };

      const inDialog =
        !!active?.closest?.('[role="dialog"]') ||
        !!target?.closest?.('[role="dialog"]') ||
        !!document.querySelector('[data-state="open"][role="dialog"]');

      if (inDialog || isTypingEl(active) || isTypingEl(target)) return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks.length, currentIndex]);

  // Calculate cumulative page number across all chapters
  const cumulativePageNumber = useMemo(() => {
    if (!preloadedBlocks) return currentIndex + 1;
    
    let total = 0;
    for (let i = 1; i < currentChapter; i++) {
      if (preloadedBlocks[i]) {
        total += preloadedBlocks[i].length;
      }
    }
    return total + currentIndex + 1;
  }, [preloadedBlocks, currentChapter, currentIndex]);

  // Check if next chapter is ready
  const isNextChapterReady = useMemo(() => {
    if (currentChapter >= totalChapters) return false;
    return preloadedBlocks?.[currentChapter + 1]?.length > 0;
  }, [preloadedBlocks, currentChapter, totalChapters]);

  const isLastPageOfChapter = currentIndex === blocks.length - 1;
  const hasNextChapter = currentChapter < totalChapters;
  
  // Zoom state for "Fit to Screen" toggle - default to 'fit' for best visibility
  const [zoomMode, setZoomMode] = useState<'100%' | 'fit'>('fit');

  const goToNextChapter = useCallback(() => {
    if (currentChapter < totalChapters) {
      const nextChapter = currentChapter + 1;
      setCurrentChapter(nextChapter);
      setCurrentIndex(0); // Reset to first page
      onChapterChange?.(nextChapter);
    }
  }, [currentChapter, totalChapters, onChapterChange]);

  // AUTO-NAVIGATION: goNext automatically advances to next chapter when on last page
  const goNext = useCallback(() => {
    if (currentIndex < blocks.length - 1) {
      setCurrentIndex(prev => prev + 1);
      onPageChange?.(currentChapter, currentIndex + 1);
    } else if (hasNextChapter && isNextChapterReady) {
      // AUTO-ADVANCE: Last page of chapter → automatically go to next chapter
      goToNextChapter();
    }
  }, [currentIndex, blocks.length, hasNextChapter, isNextChapterReady, goToNextChapter, onPageChange, currentChapter]);

  const goToPrevChapter = useCallback(() => {
    if (currentChapter > 1) {
      const prevChapter = currentChapter - 1;
      setCurrentChapter(prevChapter);
      // Go to the last page of the previous chapter
      const prevChapterBlocks = preloadedBlocks?.[prevChapter];
      if (prevChapterBlocks && prevChapterBlocks.length > 0) {
        setCurrentIndex(prevChapterBlocks.length - 1);
      } else {
        setCurrentIndex(0);
      }
      onChapterChange?.(prevChapter);
    }
  }, [currentChapter, preloadedBlocks, onChapterChange]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      onPageChange?.(currentChapter, currentIndex - 1);
    } else if (currentChapter > 1) {
      // Navigate to previous chapter
      goToPrevChapter();
    }
  }, [currentIndex, currentChapter, goToPrevChapter, onPageChange]);

  // Can go back if not at index 0, OR if there's a previous chapter
  const canGoPrev = currentIndex > 0 || currentChapter > 1;
  // Can go forward if not at last page, OR if next chapter is ready
  const canGoNext = currentIndex < blocks.length - 1 || (hasNextChapter && isNextChapterReady);

  if (loading) {
    return (
      <div className="w-full h-[600px] bg-card rounded-lg border flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading pages...</p>
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="w-full h-[600px] bg-card rounded-lg border flex items-center justify-center">
        <p className="text-muted-foreground">No pages found for this chapter</p>
      </div>
    );
  }

  const currentBlock = blocks[currentIndex];

  return (
    <div className="w-full h-[calc(100vh-180px)] flex flex-col">
      {/* Image Upload Modal */}
      <ImageUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUpload={handleImageUpload}
        isUploading={isUploading}
      />
      
      {/* Image Search Gallery */}
      <ImageSearchGallery
        open={searchDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSearchDialogOpen(false);
            setSearchingBlockId(null);
            setSearchQuery('');
          }
        }}
        initialQuery={searchQuery}
        onSelect={handleImageSelect}
        onSelectBlob={handleCroppedImageUpload}
        orientation="landscape"
        enableCrop={true}
        bookTopic={topic}
        windowShopperMode={!hasFullAccess}
        onWindowShopperBlock={() => onPremiumFeatureAttempt?.('Image Selection')}
      />
      
      {/* Page Edit Modal (Admin only) */}
      {isAdmin && (
        <PageEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          initialContent={editingContent}
          onSave={handleSaveEdit}
          isSaving={isSavingEdit}
        />
      )}
      
      {/* Insert Page Dialog (Admin only) */}
      {isAdmin && (
        <InsertPageDialog
          open={insertDialogOpen}
          onOpenChange={setInsertDialogOpen}
          onInsert={handleInsertPage}
          direction={insertDirection}
        />
      )}
      
      <div 
        className="relative bg-card rounded-lg border shadow-lg overflow-hidden transition-transform duration-200 flex-1 mx-auto w-full"
        style={{ 
          maxWidth: zoomMode === 'fit' ? 'calc((100vh - 280px) * 0.75)' : '100%',
          aspectRatio: '3/4',
          transform: zoomMode === 'fit' ? 'scale(0.9)' : 'scale(1)',
          transformOrigin: 'top center'
        }}
      >
        <div className="absolute inset-0">
          {/* CRASH FIX: Wrap in null check */}
          {!currentBlock ? (
            <LoadingState />
          ) : /* Show paywall for chapters 2+ when user doesn't have full access */
            !hasFullAccess && currentChapter > 1 ? (
            <ChapterPaywall
              chapterNumber={currentChapter}
              chapterTitle={tableOfContents.find(c => c.chapter === currentChapter)?.title || `Chapter ${currentChapter}`}
            />
          ) : (
            <BlockRenderer 
              block={currentBlock} 
              loadingImages={loadingImages}
              imageAttributions={imageAttributions}
              attemptedFetches={attemptedFetches}
              canEditImages={canEditImages || isAdmin}
              onEditCaption={(blockId, newCaption) => {
                // Intercept if guest tries to edit
                if (!hasFullAccess && onPremiumFeatureAttempt) {
                  onPremiumFeatureAttempt('Edit Caption');
                  return;
                }
                handleEditCaption(blockId, newCaption);
              }}
              onRemove={(blockId) => {
                // Intercept if guest tries to remove
                if (!hasFullAccess && onPremiumFeatureAttempt) {
                  onPremiumFeatureAttempt('Remove Image');
                  return;
                }
                handleRemoveImage(blockId);
              }}
              onManualSearch={(blockId) => {
                // Intercept if guest tries to search
                if (!hasFullAccess && onPremiumFeatureAttempt) {
                  onPremiumFeatureAttempt('Search Gallery');
                  return;
                }
                handleOpenSearchDialog(blockId);
              }}
              onUpload={(blockId) => {
                // Intercept if guest tries to upload
                if (!hasFullAccess && onPremiumFeatureAttempt) {
                  onPremiumFeatureAttempt('Upload Photo');
                  return;
                }
                handleOpenUploadModal(blockId);
              }}
            />
          )}
        </div>

        {/* REMOVED: NextChapterOverlay - Auto-navigation handles this now */}
        
        {/* End of Preview card for guests at end of Chapter 1 */}
        {isLastPageOfChapter && !hasFullAccess && currentChapter === 1 && hasNextChapter && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center z-10">
            <div className="bg-background/95 backdrop-blur-sm rounded-xl px-6 py-4 flex flex-col items-center gap-3 shadow-xl border-2 border-primary/20 max-w-sm mx-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="text-center">
                <h4 className="font-serif text-base font-semibold mb-1">End of Preview</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You've reached the end of the free preview. Unlock the full book to access all {totalChapters} chapters, the Editing Suite, and KDP Export Tools.
                </p>
              </div>
              <Button 
                onClick={() => onPremiumFeatureAttempt?.('Full Book Access')}
                size="sm"
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Unlock Full Book
              </Button>
            </div>
          </div>
        )}
        
        {/* Weaving indicator when next chapter is loading (only for users with access) */}
        {isLastPageOfChapter && hasNextChapter && !isNextChapterReady && hasFullAccess && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center">
            <div className="bg-background/90 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 shadow-lg border">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Weaving Chapter {currentChapter + 1}...</span>
            </div>
          </div>
        )}

        {/* Navigation Overlays */}
        <button
          onClick={goPrev}
          disabled={!canGoPrev}
          className="absolute left-0 top-0 bottom-0 w-1/4 bg-transparent hover:bg-black/5 transition-colors disabled:opacity-0 disabled:cursor-default"
          aria-label="Previous page"
        />
        <button
          onClick={goNext}
          disabled={!canGoNext}
          className="absolute right-0 top-0 bottom-0 w-1/4 bg-transparent hover:bg-black/5 transition-colors disabled:opacity-0 disabled:cursor-default"
          aria-label="Next page"
        />
      </div>

      {/* Navigation Controls - Fixed at bottom */}
      <div className="flex items-center justify-between mt-auto pt-4 px-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={!canGoPrev}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
        </Button>

        <div className="flex items-center gap-4">
          {/* Page Tools Menu - Visible to all users, admin tools conditionally shown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Wrench className="w-4 h-4" />
                <span className="hidden sm:inline">Page Tools</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              {/* Section Header for Guests */}
              {!hasFullAccess && (
                <>
                  <div className="px-2 py-1.5 mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Premium Editing Suite
                    </span>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Insert Page Options */}
              {hasFullAccess ? (
                <>
                  <DropdownMenuItem 
                    onClick={() => {
                      setInsertDirection('before');
                      setInsertDialogOpen(true);
                    }}
                    disabled={isInserting}
                    className="gap-2"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Insert Page Before
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => {
                      setInsertDirection('after');
                      setInsertDialogOpen(true);
                    }}
                    disabled={isInserting}
                    className="gap-2"
                  >
                    <PlusSquare className="w-4 h-4" />
                    Insert Page After
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <LockedMenuItem icon={PlusCircle} label="Insert Page Before" featureName="Insert Page" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
                  <LockedMenuItem icon={PlusSquare} label="Insert Page After" featureName="Insert Page" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
                </>
              )}
              <DropdownMenuSeparator />

              {/* Image Tools - Always show for image pages */}
              {currentBlock && ['image_full', 'image_half'].includes(currentBlock.block_type) && (
                <>
                  {hasFullAccess ? (
                    <>
                      <DropdownMenuItem 
                        onClick={() => handleOpenSearchDialog(currentBlock.id)}
                        className="gap-2"
                      >
                        <Search className="w-4 h-4" />
                        Search Gallery
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleOpenUploadModal(currentBlock.id)}
                        className="gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Own Photo
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      {/* Search Gallery - Let guests try it (windowShopperMode locks at selection) */}
                      <DropdownMenuItem 
                        onClick={() => handleOpenSearchDialog(currentBlock.id)}
                        className="gap-2"
                      >
                        <Search className="w-4 h-4" />
                        Search Gallery
                        <span className="text-[10px] text-green-600 bg-green-50 dark:bg-green-950/50 px-1.5 py-0.5 rounded ml-auto">Try it!</span>
                      </DropdownMenuItem>
                      <LockedMenuItem icon={Upload} label="Upload Own Photo" featureName="Photo Upload" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
                    </>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Content Editing Tools */}
              {hasFullAccess ? (
                <>
                  <DropdownMenuItem 
                    onClick={handleRegenerateChapter}
                    disabled={isRegenerating}
                    className="gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                    Regenerate Chapter {currentChapter}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleOpenEditModal}
                    className="gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Page Content
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleDeletePage}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete This Page
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <LockedMenuItem icon={RefreshCw} label={`Regenerate Chapter ${currentChapter}`} featureName="AI Regeneration" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
                  <LockedMenuItem icon={Pencil} label="Edit Page Content" featureName="Content Editing" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} />
                  <DropdownMenuSeparator />
                  <LockedMenuItem icon={Trash2} label="Delete This Page" featureName="Page Deletion" onPremiumAttempt={(name) => onPremiumFeatureAttempt?.(name)} destructive />
                </>
              )}
              <DropdownMenuSeparator />
              
              {/* View Settings - FREE for all users */}
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4" />
                  <Label className="text-sm font-normal">B&W Print Mode</Label>
                </div>
                <Switch
                  checked={isGrayscale}
                  onCheckedChange={onGrayscaleChange}
                />
              </div>
              <p className="text-xs text-muted-foreground px-2 pb-2">
                Optimizes for Amazon's cheaper B&W printing
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Zoom Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoomMode(prev => prev === '100%' ? 'fit' : '100%')}
            className="gap-1.5 text-muted-foreground"
            title={zoomMode === '100%' ? 'Fit to Screen' : 'Full Size (100%)'}
          >
            {zoomMode === '100%' ? (
              <ZoomOut className="w-4 h-4" />
            ) : (
              <ZoomIn className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{zoomMode === '100%' ? 'Fit' : '100%'}</span>
          </Button>
          
          <div className="text-center">
            {/* Global page number like a real book */}
            <p className="font-serif text-lg text-foreground">
              {cumulativePageNumber}
              {totalPageCount && (
                <span className="text-muted-foreground/60"> of {totalPageCount}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Chapter {currentChapter} • {currentIndex + 1}/{blocks.length}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={!canGoNext}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Progress Bar - Global progress */}
      <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: totalPageCount ? `${(cumulativePageNumber / totalPageCount) * 100}%` : `${((currentIndex + 1) / blocks.length) * 100}%` }}
        />
      </div>
      
      {/* Independent Author Disclaimer for non-official books */}
      {!isOfficial && isLastPageOfChapter && !hasNextChapter && (
        <div className="mt-6 text-center py-4 border-t border-border">
          <p className="text-xs text-muted-foreground/60 italic">
            Created by an independent author using Loom & Page.
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">
            Content is AI-generated for creative inspiration. Not professional advice.
          </p>
        </div>
      )}
    </div>
  );
};

export default PageViewer;
