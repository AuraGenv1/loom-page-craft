import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Key, Loader2, Pencil, Type, RefreshCw, Trash2, Search, Upload, AlertTriangle, Wrench, ImagePlus, ZoomIn, ZoomOut, PlusCircle, PlusSquare, Image, PanelTop, ImageOff } from 'lucide-react';
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
    <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight text-foreground">
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
            <p key={`p-${elements.length}`} className="text-base leading-relaxed text-foreground/90 mb-4 text-justify">
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
        elements.push(<h2 key={`h2-${i}`} className="font-display text-xl font-bold mt-6 mb-3 text-foreground">{trimmedLine.replace('## ', '')}</h2>);
      } else if (trimmedLine.startsWith('### ')) {
        flushParagraph();
        elements.push(<h3 key={`h3-${i}`} className="font-display text-lg font-semibold mt-4 mb-2 text-foreground">{trimmedLine.replace('### ', '')}</h3>);
      } else if (trimmedLine.startsWith('> ')) {
        flushParagraph();
        elements.push(<blockquote key={`bq-${i}`} className="border-l-2 border-primary/30 pl-4 italic text-muted-foreground my-4">{trimmedLine.replace('> ', '')}</blockquote>);
      } else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
        flushParagraph();
        elements.push(
          <div key={`li-${i}`} className="flex gap-2 mb-2">
            <span className="text-primary">•</span>
            <span className="text-foreground/90">{trimmedLine.replace(/^[\*\-]\s/, '')}</span>
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

  return <div className="px-8 py-6">{parseTextWithHeaders(content.text)}</div>;
};

// Author Toolbar
interface AuthorImageToolbarProps {
  blockId: string;
  currentCaption: string;
  onEditCaption: (newCaption: string) => void;
  onReroll: () => void;
  onRemove: () => void;
  onUpload: () => void;
  onManualSearch: () => void;
}

const AuthorImageToolbar: React.FC<AuthorImageToolbarProps> = ({ currentCaption, onEditCaption, onReroll, onRemove, onUpload, onManualSearch }) => {
  const handleEditCaption = () => {
    const newCaption = window.prompt('Edit caption:', currentCaption);
    if (newCaption !== null && newCaption !== currentCaption) onEditCaption(newCaption);
  };

  return (
    <div className="absolute top-2 right-2 z-50 flex gap-1 bg-black/70 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onManualSearch(); }} title="Manual Search"><Search className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onUpload(); }} title="Upload Own Photo"><Upload className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); handleEditCaption(); }} title="Edit Caption"><Type className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onReroll(); }} title="Get New Image"><RefreshCw className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove Image"><Trash2 className="w-4 h-4" /></Button>
    </div>
  );
};

// Add Image Button
const AddImageButton: React.FC<{ onSearch: () => void }> = ({ onSearch }) => (
  <div
    onClick={(e) => { e.stopPropagation(); onSearch(); }}
    className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group z-40 relative"
  >
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
      <ImagePlus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>
    <span className="text-lg font-medium text-muted-foreground group-hover:text-primary transition-colors">Add Image</span>
    <span className="text-sm text-muted-foreground/70">Click to search or upload</span>
  </div>
);

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
  onManualSearch?: () => void;
  onUpload?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, onEditCaption, onReroll, onRemove, onManualSearch, onUpload }) => (
  <div className="flex flex-col h-full">
    {imageUrl ? (
      <div className="relative flex-1 group">
        {canEditImages && blockId && (
          <AuthorImageToolbar blockId={blockId} currentCaption={content.caption} onEditCaption={onEditCaption!} onReroll={onReroll!} onRemove={onRemove!} onUpload={onUpload!} onManualSearch={onManualSearch!} />
        )}
        <img src={imageUrl} alt={content.caption} className="w-full h-full object-cover" />
      </div>
    ) : (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center p-8">
          {isLoading ? (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
              <p className="text-muted-foreground">Searching Archives...</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{content.query}</p>
            </>
          ) : canEditImages && onManualSearch ? (
            <AddImageButton onSearch={onManualSearch} />
          ) : (
            <>
              <ImageOff className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">Image Not Found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try refreshing or editing</p>
            </>
          )}
        </div>
      </div>
    )}
    <div className="px-6 py-4 bg-muted/20 border-t border-border/30">
      <p className="text-sm text-center italic text-muted-foreground">{content.caption}</p>
      {attribution && <p className="text-[9px] text-center text-muted-foreground/60 mt-1">{attribution}</p>}
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
  onManualSearch?: () => void;
  onUpload?: () => void;
}> = ({ content, imageUrl, attribution, isLoading, canEditImages, blockId, onEditCaption, onReroll, onRemove, onManualSearch, onUpload }) => (
  <div className="flex flex-col h-full">
    <div className="flex-1 relative group">
      {imageUrl ? (
        <>
          {canEditImages && blockId && (
            <AuthorImageToolbar blockId={blockId} currentCaption={content.caption} onEditCaption={onEditCaption!} onReroll={onReroll!} onRemove={onRemove!} onUpload={onUpload!} onManualSearch={onManualSearch!} />
          )}
          <img src={imageUrl} alt={content.caption} className="w-full h-full object-cover" />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/30">
          <div className="text-center p-6">
            {isLoading ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Searching...</p>
              </>
            ) : canEditImages && onManualSearch ? (
              <AddImageButton onSearch={onManualSearch} />
            ) : (
              <>
                <ImageOff className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No image available</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    <div className="flex-1 px-6 py-4 flex flex-col justify-center">
      <div className="space-y-2">
        <p className="text-sm italic text-muted-foreground">{content.caption}</p>
        {attribution && <p className="text-[9px] text-muted-foreground/60">{attribution}</p>}
      </div>
    </div>
  </div>
);

// Other Page Components (ProTip, Heading, List, KeyTakeaway, Divider)
const ProTipPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="flex items-start justify-center h-full pt-12 px-8">
    <div className="bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent border border-amber-500/20 rounded-xl p-6 max-w-md">
      <div className="flex items-center gap-3 mb-3">
        <Key className="w-5 h-5 text-amber-500" />
        <h3 className="font-display text-lg font-bold text-amber-600 dark:text-amber-400">PRO TIP</h3>
      </div>
      <p className="text-foreground/80 leading-relaxed">{content.text}</p>
    </div>
  </div>
);

const HeadingPage: React.FC<{ content: { level: 2 | 3; text: string } }> = ({ content }) => (
  <div className="flex items-center justify-center h-full px-8">
    {content.level === 2 ? <h2 className="font-display text-3xl font-bold text-center">{content.text}</h2> : <h3 className="font-display text-2xl font-semibold text-center">{content.text}</h3>}
  </div>
);

const ListPage: React.FC<{ content: { items: string[]; ordered?: boolean } }> = ({ content }) => (
  <div className="px-8 py-6">
    <div className="space-y-3">
      {content.ordered ? <ol className="list-decimal list-inside space-y-2">{content.items.map((item, i) => <li key={i} className="text-foreground/90">{item}</li>)}</ol> : <ul className="space-y-2">{content.items.map((item, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span className="text-foreground/90">{item}</span></li>)}</ul>}
    </div>
  </div>
);

const KeyTakeawayPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="flex items-center justify-center h-full px-8">
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-8 max-w-lg text-center">
      <h3 className="font-display text-sm uppercase tracking-widest text-primary mb-4">KEY TAKEAWAY</h3>
      <p className="text-xl font-medium text-foreground leading-relaxed">{content.text}</p>
    </div>
  </div>
);

const DividerPage: React.FC<{ content: { style?: 'minimal' | 'ornate' | 'line' } }> = ({ content }) => (
  <div className="flex items-center justify-center h-full">
    {content.style === 'ornate' ? <p className="text-4xl text-muted-foreground/30">❧</p> : content.style === 'line' ? <div className="w-32 h-px bg-border" /> : <div className="flex gap-2">{[...Array(3)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/20" />)}</div>}
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
  onManualSearch?: (blockId: string) => void;
  onUpload?: (blockId: string) => void;
}> = ({ block, loadingImages, imageAttributions, canEditImages, onEditCaption, onReroll, onRemove, onManualSearch, onUpload }) => {
  const isLoading = loadingImages.has(block.id);
  const attribution = imageAttributions.get(block.id);

  switch (block.block_type) {
    case 'chapter_title': return <ChapterTitlePage content={block.content as any} />;
    case 'text': return <TextPage content={block.content as any} />;
    case 'image_full': return <ImageFullPage content={block.content as any} imageUrl={block.image_url} attribution={attribution} isLoading={isLoading} canEditImages={canEditImages} blockId={block.id} onEditCaption={(c) => onEditCaption?.(block.id, c)} onReroll={() => onReroll?.(block.id)} onRemove={() => onRemove?.(block.id)} onManualSearch={() => onManualSearch?.(block.id)} onUpload={() => onUpload?.(block.id)} />;
    case 'image_half': return <ImageHalfPage content={block.content as any} imageUrl={block.image_url} attribution={attribution} isLoading={isLoading} canEditImages={canEditImages} blockId={block.id} onEditCaption={(c) => onEditCaption?.(block.id, c)} onReroll={() => onReroll?.(block.id)} onRemove={() => onRemove?.(block.id)} onManualSearch={() => onManualSearch?.(block.id)} onUpload={() => onUpload?.(block.id)} />;
    case 'pro_tip': return <ProTipPage content={block.content as any} />;
    case 'heading': return <HeadingPage content={block.content as any} />;
    case 'list': return <ListPage content={block.content as any} />;
    case 'divider': return <DividerPage content={block.content as any} />;
    case 'key_takeaway': return <KeyTakeawayPage content={block.content as any} />;
    default: return <TextPage content={{ text: 'Unknown block type' }} />;
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
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchingBlockId, setSearchingBlockId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
        // Update DB silently (best effort)
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

  // Auto-fetch effect
  useEffect(() => {
    if (isAdmin) return;
    blocks.forEach(block => {
      if (['image_full', 'image_half'].includes(block.block_type) && !block.image_url && !loadingImages.has(block.id) && !attemptedFetches.current.has(block.id)) {
        attemptedFetches.current.add(block.id);
        fetchImageForBlock(block);
      }
    });
  }, [blocks, fetchImageForBlock, isAdmin, loadingImages]);

  // Handlers
  const handleOpenSearchDialog = useCallback((blockId: string) => {
    console.log("Opening search dialog for:", blockId);
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    setSearchingBlockId(blockId);
    setSearchQuery((block.content as any).query || '');
    setSearchDialogOpen(true);
  }, [blocks]);

  const handleManualSearch = useCallback(async () => {
    if (!searchingBlockId || !searchQuery.trim()) return;
    const block = blocks.find(b => b.id === searchingBlockId);
    if (!block) return;
    
    // Optimistic UI Update
    setSearchDialogOpen(false);
    setLoadingImages(prev => new Set(prev).add(searchingBlockId));
    
    // Update local content first
    const updatedContent = { ...(block.content as any), query: searchQuery.trim() };
    setBlocks(prev => prev.map(b => b.id === searchingBlockId ? { ...b, content: updatedContent, image_url: undefined } : b));

    try {
      // 1. Update text in DB
      await supabase.from('book_pages').update({ content: updatedContent, image_url: null }).eq('id', searchingBlockId);
      
      // 2. Fetch new image
      const { data } = await supabase.functions.invoke('fetch-book-images', {
        body: { query: searchQuery.trim(), orientation: block.block_type === 'image_full' ? 'landscape' : 'portrait' }
      });
      
      if (data?.imageUrl) {
        await supabase.from('book_pages').update({ image_url: data.imageUrl }).eq('id', searchingBlockId);
        setBlocks(prev => prev.map(b => b.id === searchingBlockId ? { ...b, image_url: data.imageUrl } : b));
        if (data.attribution) setImageAttributions(prev => new Map(prev).set(searchingBlockId, data.attribution));
        toast.success("Image updated!");
      } else {
        toast.error("No images found for that query.");
      }
    } catch (e) {
      toast.error("Failed to search image.");
    } finally {
      setLoadingImages(prev => { const n = new Set(prev); n.delete(searchingBlockId); return n; });
      setSearchingBlockId(null);
    }
  }, [searchingBlockId, searchQuery, blocks]);

  // Nav
  const goNext = () => {
    if (currentIndex < blocks.length - 1) setCurrentIndex(p => p + 1);
    else if (currentChapter < totalChapters) { setCurrentChapter(c => c + 1); setCurrentIndex(0); onChapterChange?.(currentChapter + 1); }
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(p => p - 1);
    else if (currentChapter > 1) { setCurrentChapter(c => c - 1); onChapterChange?.(currentChapter - 1); }
  };

  if (loading) return <div className="w-full h-full flex items-center justify-center"><LoadingState /></div>;
  if (!blocks.length) return <div className="w-full h-full flex items-center justify-center text-muted-foreground">No pages found.</div>;

  const currentBlock = blocks[currentIndex];

  return (
    <div className="relative w-full h-full flex flex-col bg-background">
      {/* Search Dialog */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search Image</DialogTitle>
          </DialogHeader>
          <div className="py-4"><Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." onKeyDown={e => e.key === 'Enter' && handleManualSearch()} /></div>
          <DialogFooter><Button onClick={handleManualSearch}>Search</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Page Container */}
      <div className="flex-1 relative overflow-hidden">
        <div 
          className={`w-full h-full max-w-[6in] mx-auto bg-card border border-border/50 shadow-lg overflow-hidden ${zoomMode === 'fit' ? 'transform scale-[0.85] origin-top' : ''}`}
          style={{ aspectRatio: '6/9' }}
        >
          <BlockRenderer 
            block={currentBlock} 
            loadingImages={loadingImages} 
            imageAttributions={imageAttributions}
            canEditImages={canEditImages || isAdmin}
            onManualSearch={handleOpenSearchDialog}
          />
        </div>
        {/* Nav Overlays */}
        <div className="absolute inset-y-0 left-0 w-1/4 cursor-pointer z-10" onClick={goPrev} />
        <div className="absolute inset-y-0 right-0 w-1/4 cursor-pointer z-10" onClick={goNext} />
      </div>

      {/* Bottom Nav */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/30">
        <Button variant="ghost" size="sm" onClick={goPrev} disabled={currentIndex === 0 && currentChapter === 1}><ChevronLeft className="w-4 h-4 mr-1" /> Prev</Button>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{currentIndex + 1} / {blocks.length}</p>
          <p className="text-xs text-muted-foreground">Chapter {currentChapter}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={goNext} disabled={currentIndex === blocks.length - 1 && currentChapter === totalChapters}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
      </div>
    </div>
  );
};

export default PageViewer;
