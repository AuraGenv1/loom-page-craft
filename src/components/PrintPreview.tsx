import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Download } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import { generatePixelPerfectPDF } from '@/lib/generatePDF';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface PrintPreviewProps {
  topic: string;
  bookData: BookData;
  displayTitle: string;
  diagramImages: Record<string, string>;
}

// 6x9 Trade Paperback dimensions in pixels (at 96 DPI for screen)
const BOOK_WIDTH_PX = 576; // 6 inches * 96 DPI
const BOOK_HEIGHT_PX = 864; // 9 inches * 96 DPI
const SCALE_FACTOR = 0.6; // Scale for preview fit

const PrintPreview = ({ topic, bookData, displayTitle, diagramImages }: PrintPreviewProps) => {
  const [open, setOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const { user } = useAuth();

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Wait for images when dialog opens
  useEffect(() => {
    if (!open) return;
    
    const checkImages = () => {
      const container = previewRef.current;
      if (!container) return;
      
      const images = container.querySelectorAll('img');
      const allLoaded = Array.from(images).every((img) => img.complete);
      setImagesLoaded(allLoaded);
      
      if (!allLoaded) {
        setTimeout(checkImages, 100);
      }
    };
    
    checkImages();
  }, [open, diagramImages]);

  const handleExportPDF = async () => {
    if (!previewRef.current) return;
    
    setIsExporting(true);
    toast.loading('Generating 6x9 Trade Paperback PDF...', { id: 'pdf-export' });
    
    try {
      await generatePixelPerfectPDF(
        previewRef.current,
        `${topic.toLowerCase().replace(/\s+/g, '-')}-guide.pdf`,
        isAdmin
      );
      toast.success('PDF exported successfully!', { id: 'pdf-export' });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF', { id: 'pdf-export' });
    } finally {
      setIsExporting(false);
    }
  };

  const renderContent = () => {
    if (!bookData.chapter1Content) return null;

    const paragraphs = bookData.chapter1Content.split('\n\n').filter((p) => p.trim());

    return paragraphs.map((paragraph, index) => {
      const trimmed = paragraph.trim();

      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={index} className="font-serif text-base font-semibold mt-5 mb-2 text-foreground">
            {trimmed.replace('### ', '')}
          </h3>
        );
      }
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={index} className="font-serif text-lg font-semibold mt-6 mb-3 text-foreground print-chapter-break">
            {trimmed.replace('## ', '')}
          </h2>
        );
      }
      if (trimmed.startsWith('# ')) {
        return (
          <h2 key={index} className="font-serif text-lg font-semibold mt-6 mb-3 text-foreground print-chapter-break">
            {trimmed.replace('# ', '')}
          </h2>
        );
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const items = trimmed
          .split('\n')
          .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'));
        return (
          <ul key={index} className="list-disc pl-5 space-y-0.5 text-foreground/80 my-3 text-xs">
            {items.map((item, i) => (
              <li key={i}>{item.replace(/^[-*]\s*/, '')}</li>
            ))}
          </ul>
        );
      }

      if (trimmed.startsWith('>')) {
        return (
          <blockquote
            key={index}
            className="border-l-2 border-foreground/20 pl-3 my-3 italic text-foreground/60 text-xs"
          >
            {trimmed.replace(/^>\s*/gm, '')}
          </blockquote>
        );
      }

      return (
        <p key={index} className="text-xs text-foreground/85 leading-relaxed mb-2">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          Print Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="font-serif">Print Preview</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">6×9 Trade Paperback Format (Amazon KDP Ready)</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
          </div>
        </DialogHeader>
        
        <div className="overflow-auto p-6 bg-muted/30" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          {/* 6x9 Book Page Preview - Exact proportions */}
          <div
            ref={previewRef}
            className="mx-auto bg-white book-page-6x9"
            style={{
              width: `${BOOK_WIDTH_PX}px`,
              minHeight: `${BOOK_HEIGHT_PX}px`,
              padding: '72px', // 0.75in at 96 DPI
              transform: `scale(${SCALE_FACTOR})`,
              transformOrigin: 'top center',
              fontFamily: "'Playfair Display', Georgia, serif",
              color: 'hsl(0 0% 10%)',
              borderRadius: '2px',
              position: 'relative',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.15), 0 12px 24px -8px rgba(0,0,0,0.08)',
            }}
          >
            {/* Cover Page */}
            <div className="text-center print-chapter-break" style={{ pageBreakAfter: 'always', minHeight: `${BOOK_HEIGHT_PX - 144}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
                A Complete Guide
              </p>
              <h1 className="font-serif text-3xl font-bold text-foreground mb-4">
                {displayTitle}
              </h1>
              {bookData.subtitle && (
                <p className="text-sm text-muted-foreground italic">
                  {bookData.subtitle}
                </p>
              )}
              <div className="mt-8 flex justify-center">
                <div className="w-16 h-16 rounded-full border-2 border-border flex items-center justify-center">
                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground">
                    {topic.substring(0, 6)}
                  </span>
                </div>
              </div>
              <div className="mt-auto pt-16">
                <p className="text-xs text-muted-foreground">LOOM & PAGE</p>
              </div>
            </div>

            {/* Page Break Indicator */}
            <div className="border-t-2 border-dashed border-muted-foreground/20 my-6 relative">
              <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-white px-2 text-[9px] text-muted-foreground">
                Page Break
              </span>
            </div>

            {/* Chapter 1 */}
            <div className="print-chapter-break">
              {/* Diagram at top */}
              {diagramImages['1.1'] && (
                <div className="mb-6">
                  <img
                    src={diagramImages['1.1']}
                    alt="Chapter diagram"
                    className="w-full h-auto object-cover rounded"
                    style={{ maxHeight: '160px', objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="mt-1 p-2 bg-secondary/30 rounded">
                    <p className="text-[9px] text-muted-foreground italic text-center">
                      Plate 1.1 — Core concepts of {topic} visualized
                    </p>
                  </div>
                </div>
              )}
              
              {/* Chapter Title */}
              <header className="text-center mb-6">
                <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
                  Chapter One
                </p>
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  Introduction to {topic}
                </h2>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <div className="w-6 h-[1px] bg-foreground/20" />
                  <div className="w-1 h-1 rounded-full border border-foreground/30" />
                  <div className="w-6 h-[1px] bg-foreground/20" />
                </div>
              </header>

              {/* Content */}
              <div className="prose prose-sm max-w-none">
                {renderContent()}
              </div>

              {/* Second diagram */}
              {diagramImages['1.2'] && (
                <div className="mt-6">
                  <img
                    src={diagramImages['1.2']}
                    alt="Chapter diagram"
                    className="w-full h-auto object-cover rounded"
                    style={{ maxHeight: '160px', objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="mt-1 p-2 bg-secondary/30 rounded">
                    <p className="text-[9px] text-muted-foreground italic text-center">
                      Plate 1.2 — Essential tools and materials for {topic}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Page Break Indicator */}
            <div className="border-t-2 border-dashed border-muted-foreground/20 my-6 relative">
              <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-white px-2 text-[9px] text-muted-foreground">
                Page Break
              </span>
            </div>

            {/* Commercial Rights Certificate */}
            <div className="print-chapter-break pt-6">
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-[0.3em] text-accent mb-3">
                  Certificate of Ownership
                </p>
                <h2 className="font-serif text-lg font-bold text-foreground mb-4">
                  Commercial Rights<br />& Ownership Grant
                </h2>
                
                <div className="max-w-sm mx-auto text-left space-y-3 text-xs text-foreground/80">
                  <p>
                    This certificate confirms that the bearer holds complete ownership
                    of the enclosed instructional guide, including all intellectual
                    property rights therein.
                  </p>
                  
                  <div>
                    <p className="font-semibold text-foreground mb-1 text-[11px]">RIGHTS GRANTED:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
                      <li>Full commercial use and distribution rights</li>
                      <li>Permission to modify, adapt, and create derivative works</li>
                      <li>Unlimited reproduction in any format or medium</li>
                      <li>Rights to sell, license, or transfer this work</li>
                      <li>No attribution required (though appreciated)</li>
                    </ul>
                  </div>
                  
                  <p className="italic text-muted-foreground text-[10px]">
                    Generated: {new Date().toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                
                <div className="mt-6">
                  <div className="w-16 h-[1px] bg-foreground/30 mx-auto mb-1" />
                  <p className="text-[9px] text-muted-foreground">Authorized by Loom & Page</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dimension indicator */}
          <div className="text-center mt-4 text-xs text-muted-foreground">
            Preview scaled to {Math.round(SCALE_FACTOR * 100)}% • Actual size: 6" × 9" (Trade Paperback)
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintPreview;
