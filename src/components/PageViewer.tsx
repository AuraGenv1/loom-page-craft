import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Key, Loader2, Pencil, Type, RefreshCw, Trash2, Search, Upload, AlertTriangle, Wrench, ImagePlus, ZoomIn, ZoomOut, PlusCircle, PlusSquare, Image as ImageIcon, PanelTop, ImageOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBlock } from '@/lib/pageBlockTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  preloadedBlocks?: Record<number, PageBlock[]>;
  totalPageCount?: number;
  isAdmin?: boolean;
  canEditImages?: boolean;
  isOfficial?: boolean;
  topic?: string;
  tableOfContents?: Array<{ chapter: number; title: string }>;
  onBlocksUpdate?: (chapter: number, blocks: PageBlock[]) => void;
}

// Loading state component
const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full gap-4">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
    <p className="text-muted-foreground">Loading page...</p>
  </div>
);

// Individual block renderers
const ChapterTitlePage: React.FC<{ content: { chapter_number: number; title: string } }> = ({ content }) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-4">
      Chapter {content.chapter_number}
    </p>
    <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight">
      {content.title}
    </h1>
    <div className="w-16 h-px bg-primary/30 mt-8" />
  </div>
);

const TextPage: React.FC<{ content: { text: string } }> = ({ content }) => {
  const parseTextWithHeaders = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let currentParagraph: string[] = [];
    
    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ').trim();
        if (paragraphText) {
          elements.push(
            <p key={`p-${elements.length}`} className="text-[15px] leading-relaxed mb-5 text-foreground/90 font-serif">
              {paragraphText}
            </p>
          );
        }
        currentParagraph = [];
      }
    };
    
    lines.forEach((line, i) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('## ')) {
        flushParagraph();
        elements.push(<h2 key={`h2-${i}`} className="text-xl font-display font-semibold mt-6 mb-3">{trimmedLine.replace('## ', '')}</h2>);
      } else if (trimmedLine.startsWith('### ')) {
        flushParagraph();
        elements.push(<h3 key={`h3-${i}`} className="text-lg font-display font-medium mt-4 mb-2">{trimmedLine.replace('### ', '')}</h3>);
      } else if (trimmedLine.startsWith('> ')) {
        flushParagraph();
        elements.push(<p key={`q-${i}`} className="text-[15px] font-semibold leading-relaxed mb-4">{trimmedLine.replace('> ', '')}</p>);
      } else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
        flushParagraph();
        elements.push(
          <div key={`li-${i}`} className="flex gap-2 mb-2 ml-4">
            <span className="text-primary">•</span>
            <span className="text-[15px] leading-relaxed font-serif">{trimmedLine.replace(/^[\*\-]\s/, '')}</span>
          </div>
        );
      } else if (trimmedLine === '') {
        flushParagraph();
      } else {
        currentParagraph.push(trimmedLine);
      }
    });
    
    flushParagraph();
    return elements;
  };

  return <div className="px-8 py-6 h-full overflow-y-auto">{parseTextWithHeaders(content.text)}</div>;
};

// Author Toolbar
interface AuthorImageToolbarProps {
  blockId: string;
  currentCaption: string;
  onEditCaption: (newCaption: string) => void;
  onReroll: () => void;
  onRemove: () => void;
  onOpenMediaDialog: () => void;
}

const AuthorImageToolbar: React.FC<AuthorImageToolbarProps> = ({ currentCaption, onEditCaption, onReroll, onRemove, onOpenMediaDialog }) => {
  const handleEditCaption = () => {
    const newCaption = window.prompt('Edit caption:', currentCaption);
    if (newCaption !== null && newCaption !== currentCaption) onEditCaption(newCaption);
  };

  return (
    <div className="absolute top-2 right-2 flex gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 shadow-lg z-50 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onOpenMediaDialog(); }} title="Change Image"><Search className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleEditCaption(); }} title="Edit Caption"><Type className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onReroll(); }} title="Get New Image"><RefreshCw className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove Image"><Trash2 className="w-4 h-4" /></Button>
    </div>
  );
};

// Add Image Button
const AddImageButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div 
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group z-40 relative"
  >
    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
      <ImagePlus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>
    <span className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">Add Image</span>
    <span className="text-xs text-muted-foreground">Click to search or upload</span>
  </div>
);

// Unified Media Dialog
interface MediaSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string) => void;
  onUpload: (file: File) => void;
  isProcessing: boolean;
  initialQuery?: string;
}

const MediaSelectionDialog: React.FC<MediaSelectionDialogProps> = ({ open, onOpenChange, onSearch, onUpload, isProcessing, initialQuery = '' }) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [hasRights, setHasRights] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setSearchQuery(initialQuery);
  }, [open, initialQuery]);

  const handleSearch = () => {
    if (searchQuery.trim()) onSearch(searchQuery);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && hasRights) {
      onUpload(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Image</DialogTitle>
          <DialogDescription>Search for a professional photo or upload your own.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">AI Search</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g. Modern Miami Apartment" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
              <Button onClick={handleSearch} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Use descriptive terms like "cinematic", "aerial view", or "warm lighting".
            </p>
          </TabsContent>
          <TabsContent value="upload" className="space-y-4 pt-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <Checkbox id="rights-confirm" checked={hasRights} onCheckedChange={(c) => setHasRights(c === true)} className="mt-1" />
              <div className="grid gap-1.5">
                <Label htmlFor="rights-confirm" className="font-medium cursor-pointer">I own the rights to this image</Label>
                <p className="text-xs text-muted-foreground">You are responsible for copyright compliance.</p>
              </div>
            </div>
            <div className="space-y-2">
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} disabled={!hasRights || isProcessing} />
              <Button variant="outline" className="w-full h-24 border-dashed flex-col gap-2" disabled={!hasRights || isProcessing} onClick={() => fileInputRef.current?.click()}>
                {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                {isProcessing ? 'Uploading...' : 'Click to select file'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

// FIX: ImageFullPage - Correct "Loading" vs "Empty" state
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
  onOpenMediaDialog?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, onEditCaption, onReroll, onRemove, onOpenMediaDialog }) => (
  <div className="flex flex-col h-full">
    {imageUrl ? (
      <div className="flex-1 relative group">
        {canEditImages && blockId && (
          <AuthorImageToolbar blockId={blockId} currentCaption={content.caption} onEditCaption={onEditCaption!} onReroll={onReroll!} onRemove={onRemove!} onOpenMediaDialog={onOpenMediaDialog!} />
        )}
        <img src={imageUrl} alt={content.caption} className="w-full h-full object-cover" />
      </div>
    ) : (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center p-8">
          {isLoading ? (
            <>
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground font-medium">Searching Archives...</p>
              <p className="text-xs text-muted-foreground mt-2">{content.query}</p>
            </>
          ) : canEditImages && onOpenMediaDialog ? (
            <AddImageButton onClick={onOpenMediaDialog} />
          ) : (
            <>
              <ImageOff className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">Image Not Found</p>
              <p className="text-xs text-muted-foreground mt-1">Try refreshing or editing</p>
            </>
          )}
        </div>
      </div>
    )}
    <div className="p-4 text-center border-t bg-background">
      <p className="text-sm italic text-muted-foreground">{content.caption}</p>
      {attribution && <p className="text-[9px] text-muted-foreground/60 mt-1">{attribution}</p>}
    </div>
  </div>
);

// FIX: ImageHalfPage - Correct "Loading" vs "Empty" state
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
  onOpenMediaDialog?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, onEditCaption, onReroll, onRemove, onOpenMediaDialog }) => (
  <div className="flex flex-col h-full">
    <div className="h-1/2 relative group">
      {imageUrl ? (
        <>
          {canEditImages && blockId && (
            <AuthorImageToolbar blockId={blockId} currentCaption={content.caption} onEditCaption={onEditCaption!} onReroll={onReroll!} onRemove={onRemove!} onOpenMediaDialog={onOpenMediaDialog!} />
          )}
          <img src={imageUrl} alt={content.caption} className="w-full h-full object-cover" />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/20">
          <div className="text-center p-4">
            {isLoading ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Searching...</p>
              </>
            ) : canEditImages && onOpenMediaDialog ? (
              <AddImageButton onClick={onOpenMediaDialog} />
            ) : (
              <>
                <ImageOff className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No image available</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    <div className="h-1/2 p-6 flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm italic text-muted-foreground">{content.caption}</p>
        {attribution && <p className="text-[9px] text-muted-foreground/60 mt-1">{attribution}</p>}
      </div>
    </div>
  </div>
);

// PRO TIP: Kept exactly as user provided (Amber Gradient Style)
const ProTipPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="flex items-start justify-center h-full px-8 pt-12">
    <div className="w-full max-w-md p-6 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/50 dark:border-amber-800/30 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        <h3 className="font-display font-semibold text-amber-900 dark:text-amber-100">PRO TIP</h3>
      </div>
      <p className="text-[15px] leading-relaxed text-amber-800 dark:text-amber-200 font-serif">{content.text}</p>
    </div>
  </div>
);

const HeadingPage: React.FC<{ content: { level: 2 | 3; text: string } }> = ({ content }) => (
  <div className="flex items-center justify-center h-full px-8 text-center">
    {content.level === 2 ? <h2 className="text-2xl font-display font-bold">{content.text}</h2> : <h3 className="text-xl font-display font-semibold">{content.text}</h3>}
  </div>
);

const ListPage: React.FC<{ content: { items: string[]; ordered?: boolean } }> = ({ content }) => (
  <div className="px-8 py-6 h-full overflow-y-auto">
    <div className="space-y-3">
      {content.ordered ? <ol className="list-decimal list-inside space-y-2">{content.items.map((item, i) => <li key={i} className="text-[15px] leading-relaxed font-serif">{item}</li>)}</ol> : <ul className="space-y-2">{content.items.map((item, i) => <li key={i} className="flex gap-2 text-[15px] leading-relaxed font-serif"><span className="text-primary">•</span>{item}</li>)}</ul>}
    </div>
  </div>
);

const KeyTakeawayPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="flex items-start justify-center h-full px-8 pt-12">
    <div className="w-full max-w-md p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200/50 dark:border-emerald-800/30 shadow-sm">
      <h3 className="font-display font-semibold text-emerald-900 dark:text-emerald-100 mb-3">KEY TAKEAWAY</h3>
      <p className="text-[15px] leading-relaxed text-emerald-800 dark:text-emerald-200 font-serif">{content.text}</p>
    </div>
  </div>
);

const DividerPage: React.FC<{ content: { style?: 'minimal' | 'ornate' | 'line' } }> = ({ content }) => (
  <div className="flex items-center justify-center h-full">
    {content.style === 'ornate' ? <span className="text-4xl text-muted-foreground/30">❧</span> : content.style === 'line' ? <div className="w-1/3 h-px bg-border" /> : <div className="flex gap-2">{[...Array(3)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/20" />)}</div>}
  </div>
);

const BlockRenderer: React.FC<{ 
  block: PageBlock; 
  loadingImages: Set<string>;
  imageAttributions: Map<string, string>;
  canEditImages?: boolean;
  onEditCaption?: (blockId: string, newCaption: string) => void;
  onReroll?: (blockId: string) => void;
  onRemove?: (blockId: string) => void;
  onOpenMediaDialog?: (blockId: string) => void;
}> = ({ block, loadingImages, imageAttributions, canEditImages, onEditCaption, onReroll, onRemove, onOpenMediaDialog }) => {
  const isLoading = loadingImages.has(block.id);
  const attribution = imageAttributions.get(block.id);

  switch (block.block_type) {
    case 'chapter_title': return <ChapterTitlePage content={block.content as any} />;
    case 'text': return <TextPage content={block.content as any} />;
    case 'image_full': return <ImageFullPage content={block.content as any} imageUrl={block.image_url} attribution={attribution} isLoading={isLoading} canEditImages={canEditImages} blockId={block.id} onEditCaption={(c) => onEditCaption?.(block.id, c)} onReroll={() => onReroll?.(block.id)} onRemove={() => onRemove?.(block.id)} onOpenMediaDialog={() => onOpenMediaDialog?.(block.id)} />;
    case 'image_half': return <ImageHalfPage content={block.content as any} imageUrl={block.image_url} attribution={attribution} isLoading={isLoading} canEditImages={canEditImages} blockId={block.id} onEditCaption={(c) => onEditCaption?.(block.id, c)} onReroll={() => onReroll?.(block.id)} onRemove={() => onRemove?.(block.id)} onOpenMediaDialog={() => onOpenMediaDialog?.(block.id)} />;
    case 'pro_tip': return <ProTipPage content={block.content as any} />;
    case 'heading': return <HeadingPage content={block.content as any} />;
    case 'list': return <ListPage content={block.content as any} />;
    case 'divider': return <DividerPage content={block.content as any} />;
    default: 
      // Handle key_takeaway and any other extended types
      if ((block.block_type as string) === 'key_takeaway') {
        return <KeyTakeawayPage content={block.content as any} />;
      }
      return <TextPage content={{ text: 'Unknown block type' }} />;
  }
};

export const PageViewer: React.FC<PageViewerProps> = ({ 
  bookId, 
  initialChapter = 1, 
  totalChapters = 12,
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
  
  // Media Dialog State
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [mediaQuery, setMediaQuery] = useState('');
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);

  const attemptedFetches = useRef<Set<string>>(new Set());
  const [zoomMode, setZoomMode] = useState<'100%' | 'fit'>('fit');

  // Sync chapter changes
  useEffect(() => {
    if (initialChapter !== currentChapter) setCurrentChapter(initialChapter);
  }, [initialChapter]);

  // Image Fetcher (Hybrid)
  const fetchImageForBlock = useCallback(async (block: PageBlock) => {
    if (fetchingImages.has(block.id)) return;
    fetchingImages.add(block.id);
    setLoadingImages(prev => new Set(prev).add(block.id));

    const content = block.content as { query: string; caption: string };
    try {
      const { data, error } = await supabase.functions.invoke('fetch-book-images', {
        body: { 
          query: content.query, 
          orientation: block.block_type === 'image_full' ? 'landscape' : 'portrait' 
        }
      });
      if (error) throw error;
      if (data?.imageUrl) {
        // ALWAYS update DB (Admin or not)
        if (isAdmin || canEditImages) {
           await supabase.from('book_pages').update({ image_url: data.imageUrl }).eq('id', block.id);
        }
        if (data.attribution) setImageAttributions(prev => new Map(prev).set(block.id, data.attribution));
        setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, image_url: data.imageUrl } : b));
      }
    } catch (err) {
      console.error('[PageViewer] Fetch error:', err);
    } finally {
      fetchingImages.delete(block.id);
      setLoadingImages(prev => { const n = new Set(prev); n.delete(block.id); return n; });
    }
  }, [isAdmin, canEditImages]);

  // Fetch Blocks
  const fetchBlocks = useCallback(async (chapter: number) => {
    if (preloadedBlocks?.[chapter]?.length) {
      const loaded = preloadedBlocks[chapter];
      setBlocks(loaded);
      setCurrentIndex(loaded.findIndex(b => b.block_type === 'chapter_title') || 0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase.from('book_pages').select('*').eq('book_id', bookId).eq('chapter_number', chapter).order('page_order', { ascending: true });
      if (data) {
        const mapped = data.map(row => ({ ...row, block_type: row.block_type as any, content: row.content as any }));
        setBlocks(mapped);
        setCurrentIndex(mapped.findIndex(b => b.block_type === 'chapter_title') || 0);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [bookId, preloadedBlocks]);

  useEffect(() => { fetchBlocks(currentChapter); }, [currentChapter, fetchBlocks]);

  // FIX: Unblocked Auto-fetch effect (Removed isAdmin check)
  useEffect(() => {
    // REMOVED: if (isAdmin) return; 
    blocks.forEach(block => {
      if (['image_full', 'image_half'].includes(block.block_type) && !block.image_url && !loadingImages.has(block.id) && !attemptedFetches.current.has(block.id)) {
        attemptedFetches.current.add(block.id);
        fetchImageForBlock(block);
      }
    });
  }, [blocks, fetchImageForBlock, loadingImages]);

  // Handlers
  const handleOpenMediaDialog = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    setActiveBlockId(blockId);
    setMediaQuery((block.content as any).query || '');
    setMediaDialogOpen(true);
  }, [blocks]);

  const handleManualSearch = useCallback(async (query: string) => {
    if (!activeBlockId) return;
    const block = blocks.find(b => b.id === activeBlockId);
    if (!block) return;
    
    setIsProcessingMedia(true);
    
    // Update local content first
    const updatedContent = { ...(block.content as any), query: query };
    setBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, content: updatedContent, image_url: undefined } : b));

    try {
      await supabase.from('book_pages').update({ content: updatedContent, image_url: null }).eq('id', activeBlockId);
      
      const { data } = await supabase.functions.invoke('fetch-book-images', {
        body: { query: query, orientation: block.block_type === 'image_full' ? 'landscape' : 'portrait' }
      });
      
      if (data?.imageUrl) {
        await supabase.from('book_pages').update({ image_url: data.imageUrl }).eq('id', activeBlockId);
        setBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, image_url: data.imageUrl } : b));
        if (data.attribution) setImageAttributions(prev => new Map(prev).set(activeBlockId, data.attribution));
        toast.success("Image updated!");
        setMediaDialogOpen(false);
      } else {
        toast.error("No images found.");
      }
    } catch (e) {
      toast.error("Search failed.");
    } finally {
      setIsProcessingMedia(false);
    }
  }, [activeBlockId, blocks]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!activeBlockId) return;
    setIsProcessingMedia(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${activeBlockId}-${Date.now()}.${fileExt}`;
      const filePath = `user-uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('book-images').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('book-images').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      await supabase.from('book_pages').update({ image_url: publicUrl }).eq('id', activeBlockId);
      setBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, image_url: publicUrl } : b));
      
      toast.success('Image uploaded!');
      setMediaDialogOpen(false);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Upload failed.');
    } finally {
      setIsProcessingMedia(false);
    }
  }, [activeBlockId]);

  // Nav
  const goNext = () => {
    if (currentIndex < blocks.length - 1) setCurrentIndex(p => p + 1);
    else if (currentChapter < totalChapters) { setCurrentChapter(c => c + 1); setCurrentIndex(0); onChapterChange?.(currentChapter + 1); }
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(p => p - 1);
    else if (currentChapter > 1) { setCurrentChapter(c => c - 1); onChapterChange?.(currentChapter - 1); }
  };

  if (loading) return <div className="h-[calc(100vh-180px)] flex items-center justify-center"><LoadingState /></div>;
  if (!blocks.length) return <div className="h-[calc(100vh-180px)] flex items-center justify-center text-muted-foreground">No pages found.</div>;

  const currentBlock = blocks[currentIndex];

  return (
    // RESTORED: Fixed height calculation to prevent layout collapse
    <div className="h-[calc(100vh-180px)] flex flex-col">
      <MediaSelectionDialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen} onSearch={handleManualSearch} onUpload={handleImageUpload} isProcessing={isProcessingMedia} initialQuery={mediaQuery} />

      <div className="flex-1 flex items-center justify-center overflow-hidden px-4">
        <div 
          className="w-full h-full bg-background border border-border/30 shadow-lg overflow-hidden flex flex-col"
          style={{ 
            maxWidth: zoomMode === 'fit' ? '480px' : '600px',
            aspectRatio: '6/9',
            transform: zoomMode === 'fit' ? 'scale(0.9)' : 'scale(1)',
            transformOrigin: 'center center'
          }}
        >
          <BlockRenderer block={currentBlock} loadingImages={loadingImages} imageAttributions={imageAttributions} canEditImages={canEditImages || isAdmin} onEditCaption={() => {}} onReroll={(id) => { attemptedFetches.current.delete(id); fetchImageForBlock(blocks.find(b => b.id === id)!); }} onRemove={async (id) => { await supabase.from('book_pages').update({ image_url: null }).eq('id', id); setBlocks(prev => prev.map(b => b.id === id ? { ...b, image_url: undefined } : b)); toast.success("Image removed."); }} onOpenMediaDialog={handleOpenMediaDialog} />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t bg-background/80 backdrop-blur-sm">
        <Button variant="ghost" size="sm" onClick={goPrev} disabled={currentIndex === 0 && currentChapter === 1}><ChevronLeft className="w-4 h-4 mr-1" /> Prev</Button>
        <div className="text-center">
          <p className="text-sm font-medium">{currentIndex + 1} / {blocks.length}</p>
          <p className="text-xs text-muted-foreground">Chapter {currentChapter}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={goNext} disabled={currentIndex === blocks.length - 1 && currentChapter >= totalChapters}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
      </div>
    </div>
  );
};

export default PageViewer;
