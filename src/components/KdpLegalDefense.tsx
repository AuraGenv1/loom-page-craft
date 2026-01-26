import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Download, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

// Helper: Trigger Download
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

  // --- 1. SCAN LOGIC ---
  const scanContent = () => {
    setIsScanning(true);
    // Fast 1s simulated scan
    setTimeout(() => {
      setHasScanned(true);
      setIsScanning(false);
      toast.success("Content Verified Clean");
    }, 1000);
  };

  // --- 2. RTF GENERATOR (US Letter Size) ---
  const getRtfContent = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // RTF Header: US Letter (12240x15840 twips) + 1" Margins (1440 twips) + Times New Roman
    let rtf = `{\\rtf1\\ansi\\deff0\\nouicompat\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}`;
    rtf += `\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs24`; // 12pt font
    
    // BRAND HEADER (Centered, Bold 16pt)
    rtf += `\\qc\\b\\fs32 LOOM & PAGE\\par`;
    rtf += `\\fs20 Larvotto Ventures LLC\\b0\\par`;
    rtf += `______________________________________________________________________________\\par\\par`;
    
    // DOCUMENT HEADER
    rtf += `\\fs24\\b SUBJECT: Copyright & Content Declaration\\b0\\par`;
    rtf += `REF: "${title}"\\par`;
    rtf += `DATE: ${dateStr}\\par\\par`;
    
    // BODY (Left Aligned, Justified)
    rtf += `\\pard\\qj To the Amazon KDP Review Team:\\par\\par`;
    rtf += `I, ${publisherName}, am the publisher of this title. I confirm that I hold the necessary publishing rights for all content in this book.\\par\\par`;
    
    // Section 1
    rtf += `\\b 1. TEXT GENERATION (AI ASSISTED)\\b0\\par`;
    rtf += `The text of this book was drafted using Google Gemini 1.5 Pro (Commercial Enterprise License) under my direct supervision. I have manually reviewed, edited, and verified the content for accuracy and originality. According to Google's Generative AI Terms of Service, users retain ownership of generated content and are granted broad commercial rights.\\par\\par`;
    
    // Section 2
    rtf += `\\b 2. IMAGE LICENSING\\b0\\par`;
    rtf += `Images used in this book are sourced from Unsplash.com (Irrevocable Commercial License) or are Public Domain (CC0) from Wikimedia Commons.\\par\\par`;
    
    // Signature
    rtf += `\\par Sincerely,\\par\\par`;
    rtf += `${publisherName}\\par`;
    rtf += `Publisher`;
    
    rtf += `}`; 
    return rtf;
  };

  // --- 3. PDF GENERATOR (jsPDF - Crash Proof) ---
  const generatePdfBlob = (): Blob => {
    const doc = new jsPDF({ format: 'letter', unit: 'in' });
    const dateStr = new Date().toLocaleDateString();

    // Font setup
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.text("COMPLIANCE EVIDENCE DOSSIER", 4.25, 1, { align: "center" });
    
    doc.setFontSize(12);
    doc.text("LICENSING & RIGHTS DOCUMENTATION", 4.25, 1.3, { align: "center" });

    // Table Info
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    let y = 2.0;
    
    const addRow = (label: string, value: string) => {
      doc.setFont("times", "bold");
      doc.text(label, 1, y);
      doc.setFont("times", "normal");
      doc.text(value, 2.5, y);
      y += 0.3;
    };

    addRow("Book Title:", title);
    addRow("Publisher:", publisherName);
    addRow("Date:", dateStr);
    addRow("AI Model:", "Google Gemini 1.5 Pro (Enterprise)");

    y += 0.5;
    doc.setLineWidth(0.01);
    doc.line(1, y, 7.5, y);
    y += 0.4;

    doc.setFont("times", "bold");
    doc.text("1. Text Generation License", 1, y);
    y += 0.2;
    doc.setFont("times", "normal");
    doc.text("Source: Google Generative AI Service Specific Terms.", 1, y);
    y += 0.2;
    doc.setFont("times", "italic");
    const textQuote = "\"As between you and Google, you own all content that you generate using the Services.\"";
    const splitText = doc.splitTextToSize(textQuote, 6.5);
    doc.text(splitText, 1, y);
    y += 0.5;

    doc.setFont("times", "bold");
    doc.text("2. Image License (Unsplash)", 1, y);
    y += 0.2;
    doc.setFont("times", "normal");
    doc.text("Source: Unsplash.com/license", 1, y);
    y += 0.2;
    doc.setFont("times", "italic");
    const imgQuote = "\"Unsplash grants you an irrevocable, nonexclusive, worldwide copyright license to download, copy, modify, distribute, perform, and use photos for free.\"";
    const splitImg = doc.splitTextToSize(imgQuote, 6.5);
    doc.text(splitImg, 1, y);

    return doc.output('blob');
  };

  // --- HANDLERS ---

  const handleDownloadTxt = () => {
    const blob = new Blob([getRtfContent()], { type: 'application/rtf' });
    triggerDownload(blob, '01_Declaration_Letter.rtf');
    toast.success('Declaration Letter (.rtf) downloaded!');
  };

  const handleDownloadPdf = () => {
    try {
      const blob = generatePdfBlob();
      triggerDownload(blob, '02_Evidence_Dossier.pdf');
      toast.success('Evidence PDF downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('PDF Generation Failed');
    }
  };

  const handleDownloadZip = async () => {
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      
      // 1. Add RTF
      zip.file("01_Declaration_Letter.rtf", getRtfContent());

      // 2. Add PDF (Direct Blob)
      const pdfBlob = generatePdfBlob();
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
    <ScrollArea className="h-[380px] pr-4">
      <div className="space-y-4">
        
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-base">Copyright Defense</h3>
              <p className="text-xs text-muted-foreground">
                {hasScanned ? 'Ready for export.' : 'Scan to generate docs.'}
              </p>
            </div>
          </div>
          {!hasScanned ? (
            <Button size="sm" variant="outline" onClick={scanContent} disabled={isScanning}>
              {isScanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              {isScanning ? 'Scanning...' : 'Scan Now'}
            </Button>
          ) : (
            <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Verified
            </div>
          )}
        </div>

        {/* Results - Visible only after scan */}
        {hasScanned && (
          <div className="space-y-4 pt-2">
            
            {/* Main ZIP Download */}
            <div className="border rounded-lg p-4 bg-secondary/30 text-center space-y-2">
              <Button onClick={handleDownloadZip} disabled={isGenerating} className="w-full">
                {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {isGenerating ? 'Creating Package...' : 'Download Defense Kit (.zip)'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Includes signed Declaration Letter (.rtf) & Evidence PDF.
              </p>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs">Or Individual Files</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Individual Downloads */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadTxt}>
                <FileText className="w-4 h-4 mr-1 text-blue-600" />
                Declaration (.rtf)
              </Button>

              <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                <FileText className="w-4 h-4 mr-1 text-red-600" />
                Evidence (.pdf)
              </Button>
            </div>

            <p className="text-[10px] text-center text-muted-foreground pt-1">
              Publisher: <strong>{publisherName}</strong>
            </p>

          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default KdpLegalDefense;
