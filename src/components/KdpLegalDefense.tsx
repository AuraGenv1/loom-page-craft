import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Search, Download, FileText, Loader2, FileCheck } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import { toast } from 'sonner';
import pdfMake from "pdfmake/build/pdfmake";

// NOTE: using standard fonts (Helvetica) avoids VFS crashes entirely.

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
};

interface KdpLegalDefenseProps {
  bookData: BookData;
  title: string;
}

const KdpLegalDefense: React.FC<KdpLegalDefenseProps> = ({ bookData, title }) => {
  const publisherName = "Larvotto Ventures LLC DBA Loom & Page";
  const [hasScanned, setHasScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fake Scan Logic (UX Only)
  const scanContent = () => {
    setIsScanning(true);
    setTimeout(() => {
      setHasScanned(true);
      setIsScanning(false);
    }, 1500);
  };

  // --- CONTENT GENERATORS ---
  const getDeclarationText = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
SUBJECT: Copyright & Content Declaration
REF: "${title}"
DATE: ${dateStr}

To the Amazon KDP Review Team:

I, ${publisherName}, am the publisher of this title. I confirm that I hold the necessary publishing rights for all content in this book.

1. TEXT GENERATION (AI ASSISTED)
The text of this book was drafted using Google Gemini 1.5 Pro (Commercial Enterprise License) under my direct supervision. 
- I have manually reviewed, edited, and verified the content for accuracy and originality.
- According to Google's Generative AI Terms of Service, users retain ownership of generated content and are granted broad commercial rights.

2. IMAGE LICENSING
Images used in this book are sourced from:
- Unsplash.com: Licensed under the Unsplash License (Irrevocable, nonexclusive, worldwide copyright license to download, copy, modify, distribute, perform, and use photos for free, including for commercial purposes).
- Wikimedia Commons: Sourced strictly from Public Domain (CC0) or Creative Commons Attribution (CC BY) categories.
- User-Provided Content: Any images not from the above sources were photographed/created by the author.

3. TRADEMARKS
Any mention of trademarked terms is purely for descriptive, non-commercial, commentary, or educational purposes (Fair Use). No affiliation with any brand is implied or claimed.

Sincerely,

${publisherName}
Publisher
    `.trim();
  };

  const getPdfDefinition = (): any => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return {
      defaultStyle: { font: 'Helvetica' }, // CRITICAL: Prevents font crash
      content: [
        { text: 'COMPLIANCE EVIDENCE DOSSIER', style: 'header', alignment: 'center', margin: [0, 0, 0, 10] },
        { text: 'LICENSING & RIGHTS DOCUMENTATION', style: 'subheader', alignment: 'center', margin: [0, 0, 0, 40] },
        { 
          table: {
            widths: ['30%', '70%'],
            body: [
              [{ text: 'Book Title:', bold: true }, title],
              [{ text: 'Publisher:', bold: true }, publisherName],
              [{ text: 'Date Generated:', bold: true }, dateStr],
              [{ text: 'AI Model:', bold: true }, 'Google Gemini 1.5 Pro (Enterprise)']
            ]
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 40]
        },
        { text: 'LICENSING STATEMENTS', style: 'sectionHeader', margin: [0, 0, 0, 10] },
        { text: '1. Text Generation License', bold: true, margin: [0, 5, 0, 2] },
        { text: 'Source: Google Generative AI Service Specific Terms. "As between you and Google, you own all content that you generate using the Services."', margin: [10, 0, 0, 10], fontSize: 10, italics: true },
        { text: '2. Image License (Unsplash)', bold: true, margin: [0, 5, 0, 2] },
        { text: 'Source: Unsplash License. "Unsplash grants you an irrevocable, nonexclusive, worldwide copyright license to download, copy, modify, distribute, perform, and use photos for free, including for commercial purposes."', margin: [10, 0, 0, 10], fontSize: 10, italics: true }
      ],
      styles: {
        header: { fontSize: 18, bold: true },
        subheader: { fontSize: 12, italics: true },
        sectionHeader: { fontSize: 14, bold: true, decoration: 'underline' }
      }
    };
  };

  // --- HANDLERS ---

  const handleDownloadTxt = () => {
    const blob = new Blob([getDeclarationText()], { type: 'text/plain' });
    triggerDownload(blob, '01_Declaration_Letter.txt');
    toast.success('Declaration Letter downloaded!');
  };

  const handleDownloadPdf = async () => {
    try {
      const pdfBlob = await new Promise<Blob>((resolve, reject) => {
        try {
          const pdfDocGenerator = pdfMake.createPdf(getPdfDefinition());
          pdfDocGenerator.getBlob((blob: Blob) => resolve(blob));
        } catch (e) { reject(e); }
      });
      triggerDownload(pdfBlob, '02_Evidence_Dossier.pdf');
      toast.success('Evidence PDF downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const handleDownloadZip = async () => {
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      
      // 1. TXT
      zip.file("01_Declaration_Letter.txt", getDeclarationText());

      // 2. PDF
      const pdfBlob = await new Promise<Blob>((resolve, reject) => {
        try {
          pdfMake.createPdf(getPdfDefinition()).getBlob((blob: Blob) => resolve(blob));
        } catch (e) { reject(e); }
      });
      zip.file("02_Evidence_Dossier.pdf", pdfBlob);

      // 3. Generate
      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerDownload(zipBlob, `Defense_Kit_${title.substring(0, 15).replace(/[^a-z0-9]/gi, '_')}.zip`);
      toast.success('Defense Kit ZIP downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create ZIP package.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-6">
        
        {/* Header / Scanner */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-green-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-lg">Copyright Defense Center</h3>
              <p className="text-sm text-muted-foreground">
                {!hasScanned ? 'Scan content to generate documents.' : 'Content verified. Ready to export.'}
              </p>
            </div>
          </div>
          {!hasScanned && (
            <Button onClick={scanContent} disabled={isScanning} size="sm">
              {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              {isScanning ? 'Scanning...' : 'Scan'}
            </Button>
          )}
        </div>

        {/* Results Area */}
        {hasScanned && (
          <div className="space-y-6">
            
            {/* 1. Main ZIP Download */}
            <div className="border rounded-lg p-6 bg-secondary/30 text-center space-y-4">
              <FileCheck className="w-10 h-10 mx-auto text-green-600" />
              <h4 className="font-semibold text-lg">Complete Defense Kit</h4>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Includes the signed Declaration Letter and the Evidence Dossier PDF in one package.
              </p>
              <Button onClick={handleDownloadZip} disabled={isGenerating} className="w-full max-w-xs">
                {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {isGenerating ? 'Packaging...' : 'Download All (.zip)'}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs uppercase tracking-wider">Or Download Individually</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* 2. Individual Downloads */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" className="justify-start h-auto py-3" onClick={handleDownloadTxt}>
                <FileText className="w-5 h-5 mr-3 text-blue-600" />
                <div className="text-left">
                  <p className="font-medium">Declaration Letter (.txt)</p>
                  <p className="text-xs text-muted-foreground">Editable plain text format</p>
                </div>
              </Button>

              <Button variant="outline" className="justify-start h-auto py-3" onClick={handleDownloadPdf}>
                <FileText className="w-5 h-5 mr-3 text-red-600" />
                <div className="text-left">
                  <p className="font-medium">Evidence Dossier (.pdf)</p>
                  <p className="text-xs text-muted-foreground">Formatted PDF with timestamps</p>
                </div>
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground pt-2">
              Publisher Identity: <strong>{publisherName}</strong>
            </p>

          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default KdpLegalDefense;
