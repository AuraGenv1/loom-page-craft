import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Key, Quote, Loader2, Pencil, Type, RefreshCw, Trash2, Search, Upload, AlertTriangle, Wrench, ImagePlus, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBlock } from '@/lib/pageBlockTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Track which blocks are currently being fetched to prevent duplicates
const fetchingImages = new Set<string>();

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
  // Parse text for headers, blockquotes, and lists
  const parseTextWithHeaders = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let currentParagraph: string[] = [];
    
    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ').trim();
        if (paragraphText) {
          elements.push(
            <p key={elements.length} className="font-serif text-[15px] leading-relaxed text-foreground mb-4">
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
          <h2 key={`h2-${i}`} className="text-xl font-bold mt-5 mb-3 font-serif text-foreground">
            {trimmedLine.replace('## ', '')}
          </h2>
        );
      }
      // H3 Headers (### )
      else if (trimmedLine.startsWith('### ')) {
        flushParagraph();
        elements.push(
          <h3 key={`h3-${i}`} className="text-lg font-semibold mt-4 mb-2 font-serif text-foreground">
            {trimmedLine.replace('### ', '')}
          </h3>
        );
      }
      // Blockquotes (> )
      else if (trimmedLine.startsWith('> ')) {
        flushParagraph();
        elements.push(
          <blockquote key={`bq-${i}`} className="border-l-4 border-primary/30 pl-4 py-2 my-4 italic text-muted-foreground font-serif text-[15px]">
            {trimmedLine.replace('> ', '')}
          </blockquote>
        );
      }
      // Bullet points (* or - )
      else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
        flushParagraph();
        elements.push(
          <div key={`li-${i}`} className="flex items-start gap-2 mb-2 ml-4">
            <span className="text-primary mt-1">•</span>
            <span className="font-serif text-[15px] text-foreground">{trimmedLine.replace(/^[\*\-]\s/, '')}</span>
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
    <div className="h-full overflow-y-auto px-12 py-10">
      {parseTextWithHeaders(content.text)}
    </div>
  );
};

// Author Toolbar for Image Blocks (Available to Admin or Paid Owner)
interface AuthorImageToolbarProps {
  blockId: string;
  currentCaption: string;
  onEditCaption: (newCaption: string) => void;
  onReroll: () => void;
  onRemove: () => void;
  onUpload: () => void;
  onManualSearch: () => void;
}

const AuthorImageToolbar: React.FC<AuthorImageToolbarProps> = ({
  currentCaption,
  onEditCaption,
  onReroll,
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
    <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onManualSearch}
        title="Manual Search"
      >
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onUpload}
        title="Upload Own Photo"
      >
        <Upload className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleEditCaption}
        title="Edit Caption"
      >
        <Type className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onReroll}
        title="Get New Image"
      >
        <RefreshCw className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={onRemove}
        title="Remove Image"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};

// Large "Add Image" button for empty blocks (replaces small search button)
const AddImageButton: React.FC<{ onSearch: () => void }> = ({ onSearch }) => (
  <Button
    variant="outline"
    size="lg"
    onClick={onSearch}
    className="gap-3 px-8 py-6 text-lg border-2 border-dashed hover:border-primary"
  >
    <ImagePlus className="w-6 h-6" />
    Add Image
  </Button>
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

// Image Upload Modal with Liability Checkbox
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
                Loom & Page is not liable for copyright infringement or misuse of uploaded content.
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
  onEditCaption?: (newCaption: string) => void;
  onReroll?: () => void;
  onRemove?: () => void;
  onManualSearch?: () => void;
  onUpload?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, onEditCaption, onReroll, onRemove, onManualSearch, onUpload }) => (
  <div className="flex flex-col h-full group">
    {isLoading ? (
      <div className="flex-1 bg-muted flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Searching Archives...</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{content.query}</p>
        </div>
      </div>
    ) : imageUrl ? (
      <div className="flex-1 relative">
        {canEditImages && blockId && onEditCaption && onReroll && onRemove && onUpload && onManualSearch && (
          <AuthorImageToolbar
            blockId={blockId}
            currentCaption={content.caption}
            onEditCaption={onEditCaption}
            onReroll={onReroll}
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
      </div>
    ) : (
      // NO FALLBACK IMAGE - show skeleton instead
      <div className="flex-1 bg-muted flex items-center justify-center">
        <div className="text-center">
          {canEditImages && onManualSearch ? (
            <AddImageButton onSearch={onManualSearch} />
          ) : (
            <>
              <Loader2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Searching Archives...</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{content.query}</p>
            </>
          )}
        </div>
      </div>
    )}
    <div className="p-4 bg-card border-t">
      <p className="text-sm italic text-muted-foreground text-center">
        {content.caption}
      </p>
      {attribution && (
        <p className="text-[9px] text-muted-foreground/50 text-center mt-1">
          {attribution}
        </p>
      )}
    </div>
  </div>
);

const ImageHalfPage: React.FC<{ 
  content: { query: string; caption: string }; 
  imageUrl?: string;
  attribution?: string;
  isLoading?: boolean;
  canEditImages?: boolean;
  blockId?: string;
  onEditCaption?: (newCaption: string) => void;
  onReroll?: () => void;
  onRemove?: () => void;
  onManualSearch?: () => void;
  onUpload?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, onEditCaption, onReroll, onRemove, onManualSearch, onUpload }) => (
  <div className="h-full flex flex-col group">
    <div className="h-1/2 relative">
      {isLoading ? (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-spin" />
            <p className="text-xs text-muted-foreground">Searching...</p>
          </div>
        </div>
      ) : imageUrl ? (
        <>
          {canEditImages && blockId && onEditCaption && onReroll && onRemove && onUpload && onManualSearch && (
            <AuthorImageToolbar
              blockId={blockId}
              currentCaption={content.caption}
              onEditCaption={onEditCaption}
              onReroll={onReroll}
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
      ) : (
        // NO FALLBACK IMAGE - show skeleton instead
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="text-center">
            {canEditImages && onManualSearch ? (
              <AddImageButton onSearch={onManualSearch} />
            ) : (
              <>
                <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-spin" />
                <p className="text-xs text-muted-foreground">Searching...</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    <div className="h-1/2 p-6 flex items-center justify-center">
      <div className="text-center">
        <p className="italic text-muted-foreground">
          {content.caption}
        </p>
        {attribution && (
          <p className="text-[9px] text-muted-foreground/50 mt-2">
            {attribution}
          </p>
        )}
      </div>
    </div>
  </div>
);

// Pro Tip page - BOXED style for advice
const ProTipPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="h-full flex items-start justify-center pt-12" style={{
    paddingLeft: '72px',
    paddingRight: '48px'
  }}>
    <div className="bg-muted/50 border-2 border-foreground/20 rounded-lg p-8 max-w-md shadow-sm">
      <div className="flex items-start gap-4">
        <Key className="w-5 h-5 text-foreground flex-shrink-0 mt-1" />
        <div>
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-foreground mb-3">
            PRO TIP
          </p>
          <p className="font-serif text-lg text-foreground leading-relaxed">
            {content.text}
          </p>
        </div>
      </div>
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

// Quote page for chapter breakers - CENTER, ITALIC PULL QUOTE style (famous quotes only)
const QuotePage: React.FC<{ content: { text: string; attribution?: string } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center px-12">
    <div className="text-center max-w-lg">
      <Quote className="w-10 h-10 text-muted-foreground/30 mx-auto mb-6 rotate-180" />
      <p className="font-serif text-2xl italic text-foreground leading-relaxed mb-6">
        "{content.text}"
      </p>
      {content.attribution && (
        <p className="text-sm tracking-[0.15em] uppercase text-muted-foreground">
          — {content.attribution}
        </p>
      )}
    </div>
  </div>
);

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
  canEditImages?: boolean;
  onEditCaption?: (blockId: string, newCaption: string) => void;
  onReroll?: (blockId: string) => void;
  onRemove?: (blockId: string) => void;
  onManualSearch?: (blockId: string) => void;
  onUpload?: (blockId: string) => void;
}> = ({ block, loadingImages, imageAttributions, canEditImages, onEditCaption, onReroll, onRemove, onManualSearch, onUpload }) => {
  const isLoading = loadingImages.has(block.id);
  const attribution = imageAttributions.get(block.id);

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
          canEditImages={canEditImages}
          blockId={block.id}
          onEditCaption={onEditCaption ? (c) => onEditCaption(block.id, c) : undefined}
          onReroll={onReroll ? () => onReroll(block.id) : undefined}
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
          canEditImages={canEditImages}
          blockId={block.id}
          onEditCaption={onEditCaption ? (c) => onEditCaption(block.id, c) : undefined}
          onReroll={onReroll ? () => onReroll(block.id) : undefined}
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
    case 'quote':
      return <QuotePage content={block.content as { text: string; attribution?: string }} />;
    case 'divider':
      return <DividerPage content={block.content as { style?: 'minimal' | 'ornate' | 'line' }} />;
    default: {
      const _exhaustiveCheck: never = block;
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground">Unknown block type: {(block as any).block_type}</p>
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
  onBlocksUpdate
}) => {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
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
  const attemptedFetches = useRef<Set<string>>(new Set());
  
  // Page edit modal state (Admin only)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

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

  // Auto-fetch images for blocks without URLs using the hybrid engine
  const fetchImageForBlock = useCallback(async (block: PageBlock) => {
    if (fetchingImages.has(block.id)) return;
    fetchingImages.add(block.id);
    
    setLoadingImages(prev => new Set(prev).add(block.id));

    const content = block.content as { query: string; caption: string };
    console.log('[PageViewer] Auto-fetching image via hybrid engine:', content.query);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-book-images', {
        body: { 
          query: content.query,
          orientation: block.block_type === 'image_full' ? 'landscape' : 'portrait'
        }
      });

      if (error) throw error;

      if (data?.imageUrl) {
        // Update database with image URL
        await supabase
          .from('book_pages')
          .update({ image_url: data.imageUrl })
          .eq('id', block.id);

        // Store attribution if present (from Wikimedia)
        if (data.attribution) {
          setImageAttributions(prev => new Map(prev).set(block.id, data.attribution));
        }

        // Update local state
        setBlocks(prevBlocks => 
          prevBlocks.map(b => 
            b.id === block.id ? { ...b, image_url: data.imageUrl } : b
          )
        );
      }
    } catch (err) {
      console.error('[PageViewer] Failed to fetch image:', err);
    } finally {
      fetchingImages.delete(block.id);
      setLoadingImages(prev => {
        const next = new Set(prev);
        next.delete(block.id);
        return next;
      });
    }
  }, []);

  // Fetch blocks for a chapter - prefer preloaded, fallback to DB
  const fetchBlocks = useCallback(async (chapter: number) => {
    // First, check if we have preloaded blocks from parent state
    if (preloadedBlocks && preloadedBlocks[chapter] && preloadedBlocks[chapter].length > 0) {
      console.log('[PageViewer] Using preloaded blocks for chapter', chapter, preloadedBlocks[chapter].length);
      const loadedBlocks = preloadedBlocks[chapter];
      setBlocks(loadedBlocks);
      // Start on the chapter_title block, not a quote or divider
      setCurrentIndex(findTitleBlockIndex(loadedBlocks));
      setLoading(false);
      return;
    }

    // Fallback: fetch from database
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('book_pages')
        .select('*')
        .eq('book_id', bookId)
        .eq('chapter_number', chapter)
        .order('page_order', { ascending: true });

      if (error) throw error;
      
      // Map database rows to PageBlock type
      const mappedBlocks: PageBlock[] = (data || []).map(row => ({
        id: row.id,
        book_id: row.book_id,
        chapter_number: row.chapter_number,
        page_order: row.page_order,
        block_type: row.block_type as PageBlock['block_type'],
        content: row.content as any,
        image_url: row.image_url || undefined,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
      
      setBlocks(mappedBlocks);
      // Start on the chapter_title block
      setCurrentIndex(findTitleBlockIndex(mappedBlocks));
    } catch (err) {
      console.error('Error fetching blocks:', err);
    } finally {
      setLoading(false);
    }
  }, [bookId, preloadedBlocks, findTitleBlockIndex]);

  // Auto-trigger image fetch for blocks without images on mount
  // FIX: Check if block has no URL AND we haven't already attempted to fetch it
  useEffect(() => {
    if (isAdmin) return; // Admin can manually trigger searches
    
    blocks.forEach(block => {
      const isImageBlock = ['image_full', 'image_half'].includes(block.block_type);
      const hasNoImage = !block.image_url;
      const notLoading = !loadingImages.has(block.id);
      const notAttempted = !attemptedFetches.current.has(block.id);
      
      if (isImageBlock && hasNoImage && notLoading && notAttempted) {
        // Mark as attempted to prevent duplicate fetches
        attemptedFetches.current.add(block.id);
        fetchImageForBlock(block);
      }
    });
  }, [blocks, fetchImageForBlock, isAdmin, loadingImages]);

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
      toast.error('Failed to update caption');
      return;
    }

    // Update local state
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, content: updatedContent } as PageBlock;
    }));

    toast.success('Caption updated');
  }, [blocks]);

  const handleReroll = useCallback(async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !['image_full', 'image_half'].includes(block.block_type)) return;

    // Clear current image and refetch
    await supabase
      .from('book_pages')
      .update({ image_url: null })
      .eq('id', blockId);

    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, image_url: undefined } as PageBlock;
    }));

    toast.info('Finding new image...');
    const updatedBlock = { ...block, image_url: undefined } as PageBlock;
    fetchImageForBlock(updatedBlock);
  }, [blocks, fetchImageForBlock]);

  const handleRemoveImage = useCallback(async (blockId: string) => {
    const { error } = await supabase
      .from('book_pages')
      .update({ image_url: null })
      .eq('id', blockId);

    if (error) {
      toast.error('Failed to remove image');
      return;
    }

    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, image_url: undefined } as PageBlock;
    }));

    toast.success('Image removed');
  }, []);

  // Open manual search dialog
  const handleOpenSearchDialog = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !['image_full', 'image_half'].includes(block.block_type)) return;
    
    const currentContent = block.content as { query: string; caption: string };
    setSearchingBlockId(blockId);
    setSearchQuery(currentContent.query || '');
    setSearchDialogOpen(true);
  }, [blocks]);

  // Execute manual search from dialog
  const handleManualSearch = useCallback(async () => {
    if (!searchingBlockId || !searchQuery.trim()) return;
    
    const block = blocks.find(b => b.id === searchingBlockId);
    if (!block) return;

    setIsSearching(true);
    const currentContent = block.content as { query: string; caption: string };
    const updatedContent = { ...currentContent, query: searchQuery.trim() };

    try {
      // Update database
      await supabase
        .from('book_pages')
        .update({ content: updatedContent, image_url: null })
        .eq('id', searchingBlockId);

      // Update local state
      setBlocks(prev => prev.map(b => {
        if (b.id !== searchingBlockId) return b;
        return { ...b, content: updatedContent, image_url: undefined } as PageBlock;
      }));

      // Close dialog
      setSearchDialogOpen(false);
      
      toast.info(`Searching: "${searchQuery}"...`);
      const updatedBlock = { ...block, content: updatedContent, image_url: undefined } as PageBlock;
      
      // Remove from attempted fetches so we can fetch again
      attemptedFetches.current.delete(searchingBlockId);
      fetchImageForBlock(updatedBlock);
    } catch (err) {
      console.error('Failed to update search query:', err);
      toast.error('Failed to search');
    } finally {
      setIsSearching(false);
      setSearchingBlockId(null);
      setSearchQuery('');
    }
  }, [searchingBlockId, searchQuery, blocks, fetchImageForBlock]);

  // Handle opening upload modal
  const handleOpenUploadModal = useCallback((blockId: string) => {
    setUploadingBlockId(blockId);
    setUploadModalOpen(true);
  }, []);

  // Handle image upload from modal
  const handleImageUpload = useCallback(async (file: File) => {
    if (!uploadingBlockId) return;

    setIsUploading(true);
    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${uploadingBlockId}-${Date.now()}.${fileExt}`;
      const filePath = `user-uploads/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('book-images')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('book-images')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update database with new image URL
      const { error: updateError } = await supabase
        .from('book_pages')
        .update({ image_url: publicUrl })
        .eq('id', uploadingBlockId);

      if (updateError) throw updateError;

      // Update local state
      setBlocks(prev => prev.map(b => {
        if (b.id !== uploadingBlockId) return b;
        return { ...b, image_url: publicUrl } as PageBlock;
      }));

      toast.success('Image uploaded successfully!');
    } catch (err) {
      console.error('[PageViewer] Upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
      setUploadingBlockId(null);
    }
  }, [uploadingBlockId]);

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

  // Re-fetch when chapter changes OR when preloadedBlocks update for current chapter
  useEffect(() => {
    fetchBlocks(currentChapter);
  }, [currentChapter, fetchBlocks, preloadedBlocks]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  
  // Zoom state for "Fit to Screen" toggle
  const [zoomMode, setZoomMode] = useState<'100%' | 'fit'>('100%');

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
    <div className="w-full">
      {/* Image Upload Modal */}
      <ImageUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUpload={handleImageUpload}
        isUploading={isUploading}
      />
      
      {/* Manual Search Dialog */}
      <Dialog open={searchDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setSearchDialogOpen(false);
          setSearchingBlockId(null);
          setSearchQuery('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search for Image
            </DialogTitle>
            <DialogDescription>
              Enter a search term to find a new image. Be descriptive for best results.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., 1960s red convertible sunset"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleManualSearch();
                }
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tip: Include atmosphere words like "atmospheric", "cinematic", or specific angles like "aerial view", "close-up"
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleManualSearch} 
              disabled={!searchQuery.trim() || isSearching}
              className="gap-2"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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
      
      {/* Page Container - Kindle-style aspect ratio with Zoom support */}
      <div 
        className="relative bg-card rounded-lg border shadow-lg overflow-hidden transition-transform duration-200"
        style={{ 
          aspectRatio: '3/4',
          transform: zoomMode === 'fit' ? 'scale(0.85)' : 'scale(1)',
          transformOrigin: 'top center'
        }}
      >
        <div className="absolute inset-0">
          {/* CRASH FIX: Wrap in null check */}
          {!currentBlock ? (
            <LoadingState />
          ) : (
            <BlockRenderer 
              block={currentBlock} 
              loadingImages={loadingImages}
              imageAttributions={imageAttributions}
              canEditImages={canEditImages || isAdmin}
              onEditCaption={handleEditCaption}
              onReroll={handleReroll}
              onRemove={handleRemoveImage}
              onManualSearch={handleOpenSearchDialog}
              onUpload={handleOpenUploadModal}
            />
          )}
        </div>

        {/* REMOVED: NextChapterOverlay - Auto-navigation handles this now */}
        
        {/* Weaving indicator when next chapter is loading */}
        {isLastPageOfChapter && hasNextChapter && !isNextChapterReady && (
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

      {/* Navigation Controls */}
      <div className="flex items-center justify-between mt-4 px-2">
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
          {/* Admin Page Tools Menu */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <Wrench className="w-4 h-4" />
                  <span className="hidden sm:inline">Page Tools</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
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
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
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
