import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Download, FileText, Loader2, FileCheck } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import { toast } from 'sonner';
import pdfMake from "pdfmake/build/pdfmake";

// NOTE: Using standard fonts (Helvetica) avoids VFS crashes entirely.

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
  const [isGenerating, setIsGenerating] = useState(false);

  // --- 1. RTF GENERATOR (With Letterhead) ---
  const getRtfContent = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // RTF Header: standard ansi, Times New Roman font
    let rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}`;
    rtf += `\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs24`; // 12pt font
    
    // --- BRAND LETTERHEAD ---
    // \qc = Center Align, \b = Bold, \fs40 = 20pt size, \fs20 = 10pt size
    rtf += `\\qc\\par`; 
    rtf += `{\\b\\fs40 LOOM & PAGE\\par}`;
    rtf += `{\\fs20 Larvotto Ventures LLC\\par}`;
    rtf += `______________________________________________________________________________\\par\\par`;
    
    // Document Header
    rtf += `\\qc\\b SUBJECT: Copyright & Content Declaration\\b0\\par`;
    rtf += `REF: "${title}"\\par`;
    rtf += `DATE: ${dateStr}\\par\\par`;
    
    // Body (Left Aligned)
    rtf += `\\pard\\qj To the Amazon KDP Review Team:\\par\\par`;
    rtf += `I, ${publisherName}, am the publisher of this title. I confirm that I hold the necessary publishing rights for all content in this book.\\par\\par`;
    
    // Section 1
    rtf += `\\b 1. TEXT GENERATION (AI ASSISTED)\\b0\\par`;
    rtf += `The text of this book was drafted using Google Gemini 1.5 Pro (Commercial Enterprise License) under my direct supervision. I have manually reviewed, edited, and verified the content for accuracy and originality. According to Google's Generative AI Terms of Service, users retain ownership of generated content and are granted broad commercial rights.\\par\\par`;
    
    // Section 2
    rtf += `\\b 2. IMAGE LICENSING\\b0\\par`;
    rtf += `Images used in this book are sourced from Unsplash.com (Irrevocable Commercial License) or are Public Domain (CC0) from Wikimedia Commons.\\par\\par`;
    
    // Section 3
    rtf += `\\b 3. TRADEMARKS\\b0\\par`;
    rtf += `Any mention of trademarked terms is purely for descriptive, non-commercial, commentary, or educational purposes (Fair Use). No affiliation with any brand is implied or claimed.\\par\\par`;
    
    // Signature
    rtf += `Sincerely,\\par\\par`;
    rtf += `${publisherName}\\par`;
    rtf += `Publisher`;
    
    rtf += `}`; // Close RTF
    return rtf;
  };

  // --- 2. PDF GENERATOR (Standard Fonts) ---
  const getPdfDefinition = (): any => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return {
      defaultStyle: { font: 'Helvetica' }, // CRITICAL: Prevents font crash
      content: [
        { text: 'COMPLIANCE EVIDENCE DOSSIER', style: 'header', alignment: 'center', margin: [0, 0, 0, 20] },
        { 
          table: {
            widths: ['30%', '70%'],
            body: [
              [{ text: 'Book Title:', bold: true }, title],
              [{ text: 'Publisher:', bold: true }, publisherName],
              [{ text: 'Date:', bold: true }, dateStr],
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

  const handleDownloadRtf = () => {
    // Note: application/rtf MIME type makes browsers handle it correctly
    const blob = new Blob([getRtfContent()], { type: 'application/rtf' });
    triggerDownload(blob, '01_Declaration_Letter.rtf');
    toast.success('Declaration Letter (.rtf) downloaded!');
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
    } catch (e: any) {
      console.error(e);
      toast.error('PDF Error: ' + (e.message || "Unknown error"));
    }
  };

  const handleDownloadZip = async () => {
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      
      // 1. RTF (Rich Text)
      zip.file("01_Declaration_Letter.rtf", getRtfContent());

      // 2. PDF
      const pdfBlob = await new Promise<Blob>((resolve, reject) => {
        try {
          pdfMake.createPdf(getPdfDefinition()).getBlob((blob: Blob) => resolve(blob));
        } catch (e) { reject(e); }
      });
      zip.file("02_Evidence_Dossier.pdf", pdfBlob);

      // 3. Generate ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerDownload(zipBlob, `Defense_Kit_${title.substring(0, 15).replace(/[^a-z0-9]/gi, '_')}.zip`);
      toast.success('Defense Kit ZIP downloaded!');
    } catch (e: any) {
      console.error(e);
      toast.error('ZIP Error: ' + (e.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-green-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-lg">Copyright Defense Center</h3>
              <p className="text-sm text-muted-foreground">
                Legal documentation for your book.
              </p>
            </div>
          </div>
        </div>

        {/* Downloads Area */}
        <div className="space-y-6">
          
          {/* 1. Main ZIP Download */}
          <div className="border rounded-lg p-6 bg-secondary/30 text-center space-y-4">
            <FileCheck className="w-10 h-10 mx-auto text-green-600" />
            <h4 className="font-semibold text-lg">Complete Defense Kit</h4>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Includes the signed Declaration Letter (.rtf) and the Evidence Dossier (.pdf) in one package.
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
            <Button variant="outline" className="justify-start h-auto py-3" onClick={handleDownloadRtf}>
              <FileText className="w-5 h-5 mr-3 text-blue-600" />
              <div className="text-left">
                <p className="font-medium">Declaration Letter (.rtf)</p>
                <p className="text-xs text-muted-foreground">Professional format (Word/Pages compatible)</p>
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
      </div>
    </ScrollArea>
  );
};

export default KdpLegalDefense;
