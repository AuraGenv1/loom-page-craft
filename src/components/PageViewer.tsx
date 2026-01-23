import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Key, Image as ImageIcon, Quote, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBlock } from '@/lib/pageBlockTypes';
import { supabase } from '@/integrations/supabase/client';

// Track which blocks are currently being fetched to prevent duplicates
const fetchingImages = new Set<string>();

interface PageViewerProps {
  bookId: string;
  initialChapter?: number;
  onPageChange?: (chapter: number, page: number) => void;
  /** Pre-loaded blocks from parent state - used for instant display before DB sync */
  preloadedBlocks?: Record<number, PageBlock[]>;
}

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
  // Parse text for headers (lines starting with ## or ###)
  const parseTextWithHeaders = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let currentParagraph: string[] = [];
    
    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={elements.length} className="font-serif text-base leading-relaxed text-foreground mb-4">
            {currentParagraph.join('\n')}
          </p>
        );
        currentParagraph = [];
      }
    };
    
    lines.forEach((line, i) => {
      if (line.startsWith('### ')) {
        flushParagraph();
        elements.push(
          <h3 key={`h3-${i}`} className="font-serif text-lg font-semibold text-foreground mt-6 mb-3">
            {line.replace('### ', '')}
          </h3>
        );
      } else if (line.startsWith('## ')) {
        flushParagraph();
        elements.push(
          <h2 key={`h2-${i}`} className="font-serif text-xl font-bold text-foreground mt-8 mb-4">
            {line.replace('## ', '')}
          </h2>
        );
      } else {
        currentParagraph.push(line);
      }
    });
    
    flushParagraph();
    return elements;
  };

  return (
    <div className="h-full overflow-y-auto" style={{ 
      paddingLeft: '72px',  // Inner gutter: 0.75in
      paddingRight: '48px', // Outer edge: 0.5in
      paddingTop: '48px',   // Top: 0.5in
      paddingBottom: '48px' // Bottom: 0.5in
    }}>
      {parseTextWithHeaders(content.text)}
    </div>
  );
};

const ImageFullPage: React.FC<{ 
  content: { query: string; caption: string }; 
  imageUrl?: string;
  attribution?: string;
  isLoading?: boolean;
}> = ({ content, imageUrl, attribution, isLoading }) => (
  <div className="flex flex-col h-full">
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
        <img 
          src={imageUrl} 
          alt={content.caption}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    ) : (
      <div className="flex-1 bg-muted flex items-center justify-center">
        <div className="text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/60">No image found</p>
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
}> = ({ content, imageUrl, attribution, isLoading }) => (
  <div className="h-full flex flex-col">
    <div className="h-1/2 relative">
      {isLoading ? (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-spin" />
            <p className="text-xs text-muted-foreground">Searching...</p>
          </div>
        </div>
      ) : imageUrl ? (
        <img 
          src={imageUrl} 
          alt={content.caption}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
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

const ProTipPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="h-full flex items-start justify-center pt-12" style={{
    paddingLeft: '72px',
    paddingRight: '48px'
  }}>
    <div className="bg-card border-l-4 border-foreground p-8 max-w-md">
      <div className="flex items-start gap-4">
        <Key className="w-5 h-5 text-foreground flex-shrink-0 mt-1" />
        <div>
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-foreground mb-3">
            PRO TIP
          </p>
          <p className="font-serif text-lg italic text-muted-foreground leading-relaxed">
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

// Quote page for chapter breakers
const QuotePage: React.FC<{ content: { text: string; attribution?: string } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center px-8">
    <div className="text-center max-w-md">
      <Quote className="w-10 h-10 text-muted-foreground/40 mx-auto mb-6 rotate-180" />
      <p className="font-serif text-xl md:text-2xl italic text-foreground leading-relaxed mb-6">
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
}> = ({ block, loadingImages, imageAttributions }) => {
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
        />
      );
    case 'image_half':
      return (
        <ImageHalfPage 
          content={block.content as { query: string; caption: string }} 
          imageUrl={block.image_url}
          attribution={attribution}
          isLoading={isLoading}
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
  onPageChange,
  preloadedBlocks
}) => {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(initialChapter);
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [imageAttributions, setImageAttributions] = useState<Map<string, string>>(new Map());

  // Sync with external chapter changes (from TOC clicks)
  useEffect(() => {
    if (initialChapter !== currentChapter) {
      setCurrentChapter(initialChapter);
      setCurrentIndex(0);
    }
  }, [initialChapter]);

  // Auto-fetch images for blocks without URLs
  const fetchImageForBlock = useCallback(async (block: PageBlock) => {
    if (fetchingImages.has(block.id)) return;
    fetchingImages.add(block.id);
    
    setLoadingImages(prev => new Set(prev).add(block.id));

    const content = block.content as { query: string; caption: string };
    console.log('[PageViewer] Auto-fetching image for:', content.query);

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
      setBlocks(preloadedBlocks[chapter]);
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
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error fetching blocks:', err);
    } finally {
      setLoading(false);
    }
  }, [bookId, preloadedBlocks]);

  // Auto-trigger image fetch for blocks without images
  useEffect(() => {
    blocks.forEach(block => {
      if (['image_full', 'image_half'].includes(block.block_type) && !block.image_url) {
        fetchImageForBlock(block);
      }
    });
  }, [blocks, fetchImageForBlock]);

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

  const goNext = () => {
    if (currentIndex < blocks.length - 1) {
      setCurrentIndex(prev => prev + 1);
      onPageChange?.(currentChapter, currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      onPageChange?.(currentChapter, currentIndex - 1);
    }
  };

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
      {/* Page Container - Kindle-style aspect ratio */}
      <div className="relative bg-card rounded-lg border shadow-lg overflow-hidden" style={{ aspectRatio: '3/4' }}>
        <div className="absolute inset-0">
          <BlockRenderer 
            block={currentBlock} 
            loadingImages={loadingImages}
            imageAttributions={imageAttributions}
          />
        </div>

        {/* Navigation Overlays */}
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="absolute left-0 top-0 bottom-0 w-1/4 bg-transparent hover:bg-black/5 transition-colors disabled:opacity-0 disabled:cursor-default"
          aria-label="Previous page"
        />
        <button
          onClick={goNext}
          disabled={currentIndex === blocks.length - 1}
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
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
        </Button>

        <div className="text-center">
          {/* Page number like a real book */}
          <p className="font-serif text-lg text-foreground">
            {currentBlock?.page_order || currentIndex + 1}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Chapter {currentChapter} • {currentIndex + 1}/{blocks.length}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={currentIndex === blocks.length - 1}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / blocks.length) * 100}%` }}
        />
      </div>
    </div>
  );
};

export default PageViewer;
