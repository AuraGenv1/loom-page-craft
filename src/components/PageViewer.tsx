import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Key, Image as ImageIcon, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBlock } from '@/lib/pageBlockTypes';
import { supabase } from '@/integrations/supabase/client';

interface PageViewerProps {
  bookId: string;
  initialChapter?: number;
  onPageChange?: (chapter: number, page: number) => void;
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

const TextPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="h-full overflow-y-auto px-6 py-8">
    <p className="font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap">
      {content.text}
    </p>
  </div>
);

const ImageFullPage: React.FC<{ 
  content: { query: string; caption: string }; 
  imageUrl?: string;
  onGenerateImage?: () => void;
}> = ({ content, imageUrl, onGenerateImage }) => (
  <div className="flex flex-col h-full">
    {imageUrl ? (
      <div className="flex-1 relative">
        <img 
          src={imageUrl} 
          alt={content.caption}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    ) : (
      <div 
        className="flex-1 bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
        onClick={onGenerateImage}
      >
        <div className="text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Click to generate image</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{content.query}</p>
        </div>
      </div>
    )}
    <div className="p-4 bg-card border-t">
      <p className="text-sm italic text-muted-foreground text-center">
        {content.caption}
      </p>
    </div>
  </div>
);

const ImageHalfPage: React.FC<{ 
  content: { query: string; caption: string }; 
  imageUrl?: string;
}> = ({ content, imageUrl }) => (
  <div className="h-full flex flex-col">
    <div className="h-1/2 relative">
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={content.caption}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
    </div>
    <div className="h-1/2 p-6 flex items-center justify-center">
      <p className="text-center italic text-muted-foreground">
        {content.caption}
      </p>
    </div>
  </div>
);

const ProTipPage: React.FC<{ content: { text: string } }> = ({ content }) => (
  <div className="h-full flex items-center justify-center px-8">
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

// Block renderer dispatcher
const BlockRenderer: React.FC<{ block: PageBlock; onGenerateImage?: (blockId: string) => void }> = ({ 
  block, 
  onGenerateImage 
}) => {
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
          onGenerateImage={() => onGenerateImage?.(block.id)}
        />
      );
    case 'image_half':
      return (
        <ImageHalfPage 
          content={block.content as { query: string; caption: string }} 
          imageUrl={block.image_url}
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
  onPageChange 
}) => {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(initialChapter);

  // Fetch blocks for a chapter
  const fetchBlocks = useCallback(async (chapter: number) => {
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
  }, [bookId]);

  useEffect(() => {
    fetchBlocks(currentChapter);
  }, [currentChapter, fetchBlocks]);

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

  const handleGenerateImage = async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !['image_full', 'image_half'].includes(block.block_type)) return;

    const content = block.content as { query: string; caption: string };
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-cover-image', {
        body: { 
          prompt: content.query,
          style: 'photorealistic'
        }
      });

      if (error) throw error;

      // Update block with image URL
      await supabase
        .from('book_pages')
        .update({ image_url: data.imageUrl })
        .eq('id', blockId);

      // Refresh blocks
      fetchBlocks(currentChapter);
    } catch (err) {
      console.error('Error generating image:', err);
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
        {/* Page Content */}
        <div className="absolute inset-0">
          <BlockRenderer block={currentBlock} onGenerateImage={handleGenerateImage} />
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
          <p className="text-sm text-muted-foreground">
            Page {currentIndex + 1} of {blocks.length}
          </p>
          <p className="text-xs text-muted-foreground/60">
            Chapter {currentChapter}
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
