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
    toast.loading('Generating pixel-perfect PDF...', { id: 'pdf-export' });
    
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
          <h3 key={index} className="font-serif text-lg font-semibold mt-6 mb-3 text-foreground">
            {trimmed.replace('### ', '')}
          </h3>
        );
      }
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={index} className="font-serif text-xl font-semibold mt-8 mb-4 text-foreground print-page-break">
            {trimmed.replace('## ', '')}
          </h2>
        );
      }
      if (trimmed.startsWith('# ')) {
        return (
          <h2 key={index} className="font-serif text-xl font-semibold mt-8 mb-4 text-foreground print-page-break">
            {trimmed.replace('# ', '')}
          </h2>
        );
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const items = trimmed
          .split('\n')
          .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'));
        return (
          <ul key={index} className="list-disc pl-6 space-y-1 text-foreground/80 my-4 text-sm">
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
            className="border-l-2 border-foreground/20 pl-4 my-4 italic text-foreground/60 text-sm"
          >
            {trimmed.replace(/^>\s*/gm, '')}
          </blockquote>
        );
      }

      return (
        <p key={index} className="text-sm text-foreground/85 leading-relaxed mb-3">
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
          <DialogTitle className="font-serif">Print Preview (A4)</DialogTitle>
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
          {/* A4 Sheet Preview - Exact 210mm width for PDF sync */}
          <div
            ref={previewRef}
            className="mx-auto shadow-book gradient-paper"
            style={{
              width: '210mm',
              minHeight: '297mm',
              padding: '20mm',
              transform: 'scale(0.55)',
              transformOrigin: 'top center',
              fontFamily: "'Playfair Display', Georgia, serif",
              color: 'hsl(0 0% 10%)',
              borderRadius: '2px',
              position: 'relative',
            }}
          >
            {/* Cover Page */}
            <div className="text-center mb-12 print-page-break" style={{ pageBreakAfter: 'always' }}>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
                A Complete Guide
              </p>
              <h1 className="font-serif text-4xl font-bold text-foreground mb-6">
                {displayTitle}
              </h1>
              {bookData.subtitle && (
                <p className="text-lg text-muted-foreground italic">
                  {bookData.subtitle}
                </p>
              )}
              <div className="mt-12 flex justify-center">
                <div className="w-24 h-24 rounded-full border-2 border-border flex items-center justify-center">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {topic.substring(0, 8)}
                  </span>
                </div>
              </div>
              <div className="mt-auto pt-32">
                <p className="text-sm text-muted-foreground">LOOM & PAGE</p>
              </div>
            </div>

            {/* Chapter 1 */}
            <div className="print-page-break" style={{ pageBreakBefore: 'always' }}>
              {/* Diagram at top - full width */}
              {diagramImages['1.1'] && (
                <div className="mb-8">
                  <img
                    src={diagramImages['1.1']}
                    alt="Chapter diagram"
                    className="w-full h-auto object-cover rounded"
                    style={{ maxHeight: '200px', objectFit: 'cover' }}
                  />
                  <div className="mt-2 p-3 bg-secondary/30 rounded">
                    <p className="text-xs text-muted-foreground italic text-center">
                      Plate 1.1 — Core concepts of {topic} visualized
                    </p>
                    {bookData.tableOfContents?.[0]?.imageDescription && (
                      <p className="text-xs text-muted-foreground/70 text-center mt-1">
                        {bookData.tableOfContents[0].imageDescription}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Chapter Title */}
              <header className="text-center mb-8">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
                  Chapter One
                </p>
                <h2 className="font-serif text-2xl font-semibold text-foreground">
                  Introduction to {topic}
                </h2>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <div className="w-8 h-[1px] bg-foreground/20" />
                  <div className="w-1.5 h-1.5 rounded-full border border-foreground/30" />
                  <div className="w-8 h-[1px] bg-foreground/20" />
                </div>
              </header>

              {/* Content */}
              <div className="prose prose-sm max-w-none">
                {renderContent()}
              </div>

              {/* Second diagram */}
              {diagramImages['1.2'] && (
                <div className="mt-8">
                  <img
                    src={diagramImages['1.2']}
                    alt="Chapter diagram"
                    className="w-full h-auto object-cover rounded"
                    style={{ maxHeight: '200px', objectFit: 'cover' }}
                  />
                  <div className="mt-2 p-3 bg-secondary/30 rounded">
                    <p className="text-xs text-muted-foreground italic text-center">
                      Plate 1.2 — Essential tools and materials for {topic}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Commercial Rights Certificate */}
            <div className="print-page-break mt-12 pt-8 border-t-2 border-accent/30" style={{ pageBreakBefore: 'always' }}>
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-accent mb-4">
                  Certificate of Ownership
                </p>
                <h2 className="font-serif text-2xl font-bold text-foreground mb-6">
                  Commercial Rights<br />& Ownership Grant
                </h2>
                
                <div className="max-w-md mx-auto text-left space-y-4 text-sm text-foreground/80">
                  <p>
                    This certificate confirms that the bearer holds complete ownership
                    of the enclosed instructional guide, including all intellectual
                    property rights therein.
                  </p>
                  
                  <div>
                    <p className="font-semibold text-foreground mb-2">RIGHTS GRANTED:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Full commercial use and distribution rights</li>
                      <li>Permission to modify, adapt, and create derivative works</li>
                      <li>Unlimited reproduction in any format or medium</li>
                      <li>Rights to sell, license, or transfer this work</li>
                      <li>No attribution required (though appreciated)</li>
                    </ul>
                  </div>
                  
                  <p className="italic text-muted-foreground">
                    Generated: {new Date().toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                
                <div className="mt-8">
                  <div className="w-20 h-[1px] bg-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Authorized by Loom & Page</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintPreview;
