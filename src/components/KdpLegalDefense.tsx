import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Download, FileText, Loader2, AlertTriangle, Copy, Search } from 'lucide-react';
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
  
  // State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{
    trademarks: string[];
    repeats: string[];
    facts: string[];
    hasRun: boolean;
  }>({ trademarks: [], repeats: [], facts: [], hasRun: false });
  const [isGenerating, setIsGenerating] = useState(false);

  const TRADEMARK_WATCHLIST = [
    'Disney', 'Marvel', 'Star Wars', 'Harry Potter', 'Nike', 'Coca-Cola', 'Lego', 
    'Minecraft', 'Barbie', 'Apple', 'Google', 'Amazon', 'Netflix', 'Tesla', 'Instagram', 'Facebook', 'Mickey Mouse'
  ];

  // --- 1. REAL SCAN LOGIC ---
  const scanContent = () => {
    setIsScanning(true);
    
    setTimeout(() => {
      let allText = bookData.chapter1Content || "";
      for (let i = 2; i <= 12; i++) {
         // @ts-ignore
         const ch = bookData[`chapter${i}Content`];
         if (ch) allText += " " + ch;
      }

      // A. Trademarks
      const foundTrademarks = TRADEMARK_WATCHLIST.filter(term => 
        allText.toLowerCase().includes(term.toLowerCase())
      );

      // B. Facts (Regex for dates/money)
      const sentences = allText.match(/[^.!?]+[.!?]/g) || [];
      const facts = sentences.filter(s => 
        s.match(/\b(19|20)\d{2}\b/) || s.match(/\$\d+/) || s.match(/\d+%/)
      ).slice(0, 5);

      // C. Repetition
      const counts: Record<string, number> = {};
      const repeats: string[] = [];
      sentences.forEach(s => {
        const clean = s.trim();
        if (clean.length > 25) {
          counts[clean] = (counts[clean] || 0) + 1;
          if (counts[clean] === 2) repeats.push(clean);
        }
      });

      setScanResults({
        trademarks: foundTrademarks,
        repeats: repeats,
        facts: facts,
        hasRun: true
      });
      
      setIsScanning(false);
      toast.success("Content Scan Complete");
    }, 1000);
  };

  // --- 2. RTF GENERATOR (Professional - NO URLs) ---
  const getRtfContent = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    let rtf = `{\\rtf1\\ansi\\deff0\\nouicompat\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}`;
    rtf += `\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs24`;
    
    // LETTERHEAD
    rtf += `\\qc\\b\\fs32 LOOM & PAGE\\par`;
    rtf += `\\fs20 Larvotto Ventures LLC\\b0\\par`;
    rtf += `______________________________________________________________________________\\par\\par`;
    
    // SUBJECT LINE
    rtf += `\\fs24\\b RE: Copyright & Content Declaration\\b0\\par`;
    rtf += `TITLE: "${title}"\\par`;
    rtf += `DATE: ${dateStr}\\par\\par`;
    
    // BODY (Corporate Tone)
    rtf += `\\pard\\qj To the Amazon KDP Review Team:\\par\\par`;
    
    rtf += `This correspondence serves as a formal declaration regarding the copyright ownership and licensing for the title referenced above.\\par\\par`;
    
    rtf += `I, ${publisherName}, hereby confirm that I am the publisher of this work and hold all necessary publishing rights. The content was created under my direct supervision using the tools and licenses detailed below.\\par\\par`;
    
    // 1. TEXT
    rtf += `\\b 1. TEXT GENERATION (AI ASSISTED)\\b0\\par`;
    rtf += `The manuscript for this book was drafted using Google Gemini 1.5 Pro (Commercial Enterprise License). I have manually reviewed, edited, and verified the content for accuracy and originality. In accordance with the Google Generative AI Terms of Service, users retain full ownership of generated content and are granted broad commercial rights.\\par\\par`;
    
    // 2. IMAGES
    rtf += `\\b 2. IMAGE LICENSING\\b0\\par`;
    rtf += `All images appearing in this book are sourced from Unsplash.com (under an irrevocable Commercial License) or utilize Public Domain (CC0) assets from Wikimedia Commons.\\par\\par`;
    
    // 3. TRADEMARKS
    rtf += `\\b 3. TRADEMARK USAGE\\b0\\par`;
    rtf += `Any references to trademarked terms within the text are utilized strictly for descriptive, non-commercial, or educational commentary (Fair Use). No affiliation, sponsorship, or endorsement by any brand is implied or claimed.\\par\\par`;
    
    // SIGNATURE
    rtf += `Sincerely,\\par\\par`;
    rtf += `${publisherName}\\par`;
    rtf += `Publisher\\par`;
    rtf += `Larvotto Ventures LLC`;
    
    rtf += `}`; 
    return rtf;
  };

  // --- 3. PDF GENERATOR (jsPDF - with Visible URLs) ---
  const generatePdfBlob = (): Blob => {
    const doc = new jsPDF({ format: 'letter', unit: 'in' });
    const dateStr = new Date().toLocaleDateString();

    // Title
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

    y += 0.2;
    doc.setLineWidth(0.01);
    doc.line(1, y, 7.5, y);
    y += 0.4;

    // 1. TEXT
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
    y += 0.3;
    doc.setFont("times", "normal");
    doc.setTextColor(0, 0, 255);
    doc.text("URL: https://policies.google.com/terms/generative-ai", 1, y);
    doc.setTextColor(0, 0, 0);
    y += 0.5;

    // 2. IMAGES (Unsplash)
    doc.setFont("times", "bold");
    doc.text("2. Image License (Unsplash)", 1, y);
    y += 0.2;
    doc.setFont("times", "normal");
    doc.text("Source: Unsplash License", 1, y);
    y += 0.2;
    doc.setFont("times", "italic");
    const imgQuote = "\"Unsplash grants you an irrevocable, nonexclusive, worldwide copyright license to download, copy, modify, distribute, perform, and use photos for free.\"";
    const splitImg = doc.splitTextToSize(imgQuote, 6.5);
    doc.text(splitImg, 1, y);
    y += 0.3;
    doc.setFont("times", "normal");
    doc.setTextColor(0, 0, 255);
    doc.text("URL: https://unsplash.com/license", 1, y);
    doc.setTextColor(0, 0, 0);
    y += 0.5;

    // 3. WIKIMEDIA (Public Domain)
    doc.setFont("times", "bold");
    doc.text("3. Public Domain (Wikimedia Commons)", 1, y);
    y += 0.2;
    doc.setFont("times", "normal");
    doc.text("Source: CreativeCommons.org (CC0 1.0 Universal)", 1, y);
    y += 0.2;
    doc.setFont("times", "italic");
    const wikiQuote = "\"The person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide.\"";
    const splitWiki = doc.splitTextToSize(wikiQuote, 6.5);
    doc.text(splitWiki, 1, y);
    y += 0.3;
    doc.setFont("times", "normal");
    doc.setTextColor(0, 0, 255);
    doc.text("URL: https://creativecommons.org/publicdomain/zero/1.0/", 1, y);
    doc.setTextColor(0, 0, 0);

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
      zip.file("01_Declaration_Letter.rtf", getRtfContent());
      zip.file("02_Evidence_Dossier.pdf", generatePdfBlob());

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
      <div className="space-y-4">
        
        {/* Header / Scanner */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-base">Copyright Defense</h3>
              <p className="text-xs text-muted-foreground">
                {scanResults.hasRun ? 'Scan complete.' : 'Scan content to verify risks.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={scanContent} disabled={isScanning}>
            {isScanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
            {isScanning ? 'Scanning...' : 'Scan Content'}
          </Button>
        </div>

        {/* Scan Results (Only visible after scan) */}
        {scanResults.hasRun && (
          <div className="grid grid-cols-3 gap-2 text-xs">
             {/* Trademarks */}
             <div className="p-2 rounded-md bg-secondary/50 flex items-start gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${scanResults.trademarks.length > 0 ? 'text-amber-500' : 'text-green-600'}`} />
               <div>
                <p className="font-medium">Trademarks: {scanResults.trademarks.length}</p>
                {scanResults.trademarks.length > 0 && <p className="text-muted-foreground truncate">{scanResults.trademarks.join(", ")}</p>}
               </div>
             </div>
             {/* Repetition */}
             <div className="p-2 rounded-md bg-secondary/50 flex items-start gap-2">
                <Copy className={`w-4 h-4 shrink-0 ${scanResults.repeats.length > 0 ? 'text-amber-500' : 'text-green-600'}`} />
               <div>
                <p className="font-medium">Repetition: {scanResults.repeats.length}</p>
               </div>
             </div>
             {/* Facts */}
             <div className="p-2 rounded-md bg-secondary/50 flex items-start gap-2">
               <FileText className="w-4 h-4 shrink-0 text-blue-500" />
               <div>
                <p className="font-medium">Fact Claims: {scanResults.facts.length}</p>
               </div>
             </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t my-2" />

        {/* DOWNLOADS (Always Visible) */}
        <div className="space-y-3">
          
          {/* Main ZIP Download */}
          <div className="border rounded-lg p-4 bg-secondary/30 text-center space-y-2">
            <Button onClick={handleDownloadZip} disabled={isGenerating} className="w-full">
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {isGenerating ? 'Packaging...' : 'Download Defense Kit (.zip)'}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Includes signed Declaration Letter (.rtf) & Evidence PDF.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 border-t" />
            <span>Or Individual Files</span>
            <div className="flex-1 border-t" />
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
      </div>
    </ScrollArea>
  );
};

export default KdpLegalDefense;
