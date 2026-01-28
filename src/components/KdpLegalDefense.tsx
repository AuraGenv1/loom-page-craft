import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Download, FileText, Loader2, AlertTriangle, Copy, Search, Image } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import { supabase } from '@/integrations/supabase/client';
import JSZip from 'jszip';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

// --- HELPER: Trigger Download (Hidden Anchor) ---
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

// Image metadata from book_pages table
interface ImagePageData {
  page_order: number;
  chapter_number: number;
  content: { caption?: string; query?: string };
  image_url: string | null;
  image_source: string | null;
  original_url: string | null;
  image_license: string | null;
  image_attribution: string | null;
  archived_at: string | null;
}

interface KdpLegalDefenseProps {
  bookData: BookData;
  bookId: string; // Book ID for fetching image metadata
  title: string;
}

const KdpLegalDefense: React.FC<KdpLegalDefenseProps> = ({ bookData, bookId, title }) => {
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
  const [imageCount, setImageCount] = useState<number | null>(null);

  const TRADEMARK_WATCHLIST = [
    'Disney', 'Marvel', 'Star Wars', 'Harry Potter', 'Nike', 'Coca-Cola', 'Lego', 
    'Minecraft', 'Barbie', 'Apple', 'Google', 'Amazon', 'Netflix', 'Tesla', 'Instagram', 'Facebook', 'Mickey Mouse'
  ];

  // --- 1. REAL SCAN LOGIC ---
  const scanContent = async () => {
    setIsScanning(true);
    
    // Count images in database
    try {
      const { count } = await supabase
        .from('book_pages')
        .select('*', { count: 'exact', head: true })
        .eq('book_id', bookId)
        .in('block_type', ['image_full', 'image_half'])
        .not('image_url', 'is', null);
      
      setImageCount(count || 0);
    } catch (err) {
      console.error('Failed to count images:', err);
    }
    
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

  // --- 2. RTF GENERATOR (Approved Text) ---
  const getRtfContent = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Header: US Letter, Times New Roman
    let rtf = `{\\rtf1\\ansi\\deff0\\nouicompat\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}`;
    rtf += `\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs24`; // 12pt font
    
    // LETTERHEAD
    rtf += `\\qc\\b\\fs32 LOOM & PAGE\\par`;
    rtf += `\\fs20 Larvotto Ventures LLC\\b0\\par`;
    rtf += `______________________________________________________________________________\\par\\par`;
    
    // SUBJECT LINE
    rtf += `\\fs24\\b RE: Copyright & Content Declaration\\b0\\par`;
    rtf += `TITLE: "${title}"\\par`;
    rtf += `DATE: ${dateStr}\\par\\par`;
    
    // BODY
    rtf += `\\pard\\qj To the Amazon KDP Review Team:\\par\\par\\par `;
    rtf += `This correspondence serves as a formal declaration regarding the copyright ownership and licensing for the title referenced above.\\par\\par `;
    rtf += `Larvotto Ventures LLC DBA Loom & Page hereby confirms that we are the publisher of this work and hold all necessary publishing rights. The content was created under our direct supervision using the tools and licenses detailed below.\\par\\par `;
    
    // 1. TEXT
    rtf += `\\b 1. TEXT GENERATION (AI ASSISTED): \\b0 The manuscript for this book was drafted using Google Gemini 1.5 Pro (Commercial Enterprise License). I have manually reviewed, edited, and verified the content for accuracy and originality. In accordance with the Google Generative AI Terms of Service, users retain full ownership of generated content and are granted broad commercial rights.\\par\\par`;
    
    // 2. IMAGES
    rtf += `\\b 2. IMAGE LICENSING: \\b0 All images appearing in this book are sourced from one of the following platforms with appropriate commercial licenses:\\par`;
    rtf += `\\tab - \\b Unsplash: \\b0 Irrevocable Commercial License. Assets incorporated into creative design (Significant Modification).\\par`;
    rtf += `\\tab - \\b Pexels: \\b0 Free Commercial License. All photos and videos are free to use, with no attribution required.\\par`;
    rtf += `\\tab - \\b Wikimedia Commons: \\b0 Public Domain (CC0) assets with no restrictions on commercial use.\\par`;
    rtf += `\\tab - \\b User Uploads: \\b0 Rights certified by publisher at time of upload.\\par\\par`;
    rtf += `A complete Image Licensing Manifest (03_Image_Manifest.pdf) is included in this Defense Kit with detailed provenance for every image.\\par\\par`;
    
    // 3. TRADEMARKS
    rtf += `\\b 3. TRADEMARK USAGE: \\b0 Any references to trademarked terms within the text are utilized strictly for descriptive, non-commercial, or educational commentary (Fair Use). No affiliation, sponsorship, or endorsement by any brand is implied or claimed.\\par\\par `;
    
    // SIGNATURE
    rtf += `Sincerely,\\par\\par `;
    rtf += `${publisherName}`;
    
    rtf += `}`; 
    return rtf;
  };

  // --- 3. PDF GENERATOR (Evidence Dossier) ---
  const generatePdfBlob = (): Blob => {
    const doc = new jsPDF({ format: 'letter', unit: 'in' });
    const dateStr = new Date().toLocaleDateString();

    // Header
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.text("COMPLIANCE EVIDENCE DOSSIER", 4.25, 1, { align: "center" });
    
    doc.setFontSize(12);
    doc.text("LICENSING & RIGHTS DOCUMENTATION", 4.25, 1.3, { align: "center" });

    // Meta Data Table
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
    const textQuote = "\"As between you and Google, you own all content that you generate using the Services. You may use the Services to generate content for commercial purposes.\"";
    const splitText = doc.splitTextToSize(textQuote, 6.5);
    doc.text(splitText, 1, y);
    y += (splitText.length * 0.2) + 0.1; 
    
    doc.setFont("times", "normal");
    doc.setTextColor(0, 0, 255);
    doc.setFontSize(9);
    doc.text("URL: https://policies.google.com/terms/generative-ai", 1, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    y += 0.5;

    // 2. IMAGES - UNSPLASH
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
    y += (splitImg.length * 0.2) + 0.1;

    doc.setFont("times", "normal");
    doc.text("Usage: Incorporated into creative design (Significant Modification).", 1, y);
    y += 0.2;

    doc.setTextColor(0, 0, 255);
    doc.setFontSize(9);
    doc.text("URL: https://unsplash.com/license", 1, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    y += 0.5;

    // 3. IMAGES - PEXELS
    doc.setFont("times", "bold");
    doc.text("3. Image License (Pexels)", 1, y);
    y += 0.2;
    doc.setFont("times", "normal");
    doc.text("Source: Pexels License", 1, y);
    y += 0.2;
    doc.setFont("times", "italic");
    const pexelsQuote = "\"All photos and videos on Pexels are free to use. Attribution is not required. You can modify the photos and videos from Pexels.\"";
    const splitPexels = doc.splitTextToSize(pexelsQuote, 6.5);
    doc.text(splitPexels, 1, y);
    y += (splitPexels.length * 0.2) + 0.1;

    doc.setFont("times", "normal");
    doc.text("Usage: Free for commercial use, no attribution required.", 1, y);
    y += 0.2;

    doc.setTextColor(0, 0, 255);
    doc.setFontSize(9);
    doc.text("URL: https://www.pexels.com/license/", 1, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    y += 0.5;

    // 4. WIKIMEDIA
    doc.setFont("times", "bold");
    doc.text("4. Public Domain (Wikimedia Commons)", 1, y);
    y += 0.2;
    doc.setFont("times", "normal");
    doc.text("Source: CreativeCommons.org (CC0 1.0 Universal)", 1, y);
    y += 0.2;
    doc.setFont("times", "italic");
    const wikiQuote = "\"The person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide.\"";
    const splitWiki = doc.splitTextToSize(wikiQuote, 6.5);
    doc.text(splitWiki, 1, y);
    y += (splitWiki.length * 0.2) + 0.1;

    doc.setTextColor(0, 0, 255);
    doc.setFontSize(9);
    doc.text("URL: https://creativecommons.org/publicdomain/zero/1.0/", 1, y);

    return doc.output('blob');
  };

  // --- 4. IMAGE MANIFEST PDF GENERATOR ---
  const generateImageManifestBlob = async (): Promise<Blob> => {
    const doc = new jsPDF({ format: 'letter', unit: 'in' });
    const dateStr = new Date().toLocaleDateString();

    // Fetch ALL image blocks that have an image_url (regardless of metadata columns)
    const { data: imagePages, error } = await supabase
      .from('book_pages')
      .select('page_order, chapter_number, content, image_url, image_source, original_url, image_license, image_attribution, archived_at')
      .eq('book_id', bookId)
      .in('block_type', ['image_full', 'image_half'])
      .not('image_url', 'is', null)
      .order('chapter_number', { ascending: true })
      .order('page_order', { ascending: true });

    if (error) {
      console.error('Failed to fetch image pages:', error);
      throw new Error('Failed to fetch image data');
    }

    const images = (imagePages || []) as ImagePageData[];
    console.log('[ImageManifest] Found images:', images.length);

    // Header
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.text("IMAGE LICENSING MANIFEST", 4.25, 0.8, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("times", "normal");
    doc.text(`Book: ${title}`, 4.25, 1.1, { align: "center" });
    doc.text(`Publisher: ${publisherName}`, 4.25, 1.3, { align: "center" });
    doc.text(`Generated: ${dateStr} | Total Images: ${images.length}`, 4.25, 1.5, { align: "center" });

    // Divider
    doc.setLineWidth(0.01);
    doc.line(0.75, 1.7, 7.75, 1.7);

    // Table headers
    let y = 2.0;
    const colWidths = { page: 0.5, chapter: 0.6, caption: 1.8, source: 0.8, license: 1.2, urls: 2.3 };
    const startX = 0.75;

    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.text("Page", startX, y);
    doc.text("Ch.", startX + colWidths.page, y);
    doc.text("Caption/Description", startX + colWidths.page + colWidths.chapter, y);
    doc.text("Source", startX + colWidths.page + colWidths.chapter + colWidths.caption, y);
    doc.text("License", startX + colWidths.page + colWidths.chapter + colWidths.caption + colWidths.source, y);
    doc.text("Archived URL", startX + colWidths.page + colWidths.chapter + colWidths.caption + colWidths.source + colWidths.license, y);

    y += 0.15;
    doc.setLineWidth(0.005);
    doc.line(startX, y, 7.75, y);
    y += 0.2;

    // Rows
    doc.setFont("times", "normal");
    doc.setFontSize(7);

    for (const img of images) {
      // Check if we need a new page
      if (y > 10) {
        doc.addPage();
        y = 1.0;
        
        // Repeat headers
        doc.setFont("times", "bold");
        doc.setFontSize(8);
        doc.text("Page", startX, y);
        doc.text("Ch.", startX + colWidths.page, y);
        doc.text("Caption/Description", startX + colWidths.page + colWidths.chapter, y);
        doc.text("Source", startX + colWidths.page + colWidths.chapter + colWidths.caption, y);
        doc.text("License", startX + colWidths.page + colWidths.chapter + colWidths.caption + colWidths.source, y);
        doc.text("Archived URL", startX + colWidths.page + colWidths.chapter + colWidths.caption + colWidths.source + colWidths.license, y);

        y += 0.15;
        doc.setLineWidth(0.005);
        doc.line(startX, y, 7.75, y);
        y += 0.2;
        doc.setFont("times", "normal");
        doc.setFontSize(7);
      }

      const content = img.content as { caption?: string; query?: string };
      const caption = content?.caption || content?.query || 'No caption';
      const truncatedCaption = caption.length > 50 ? caption.substring(0, 47) + '...' : caption;
      
      // Determine source - default to "Legacy" for older images without metadata
      const source = img.image_source || 'Legacy';
      // Determine license - default based on URL patterns for older images
      let license = img.image_license || 'Unknown';
      if (!img.image_license && img.image_url) {
        // Infer license from URL for legacy images
        if (img.image_url.includes('unsplash')) license = 'Unsplash License';
        else if (img.image_url.includes('pexels')) license = 'Pexels License';
        else if (img.image_url.includes('wikimedia') || img.image_url.includes('wikipedia')) license = 'CC0/Public Domain';
        else if (img.image_url.includes('supabase')) license = 'Archived/Upload';
      }
      const truncatedLicense = license.length > 20 ? license.substring(0, 17) + '...' : license;
      
      // Format source display
      const sourceDisplay = source === 'upload' ? 'Upload' : 
                           source === 'unsplash' ? 'Unsplash' :
                           source === 'pexels' ? 'Pexels' :
                           source === 'wikimedia' ? 'Wikimedia' : 
                           source === 'Legacy' ? 'Legacy' : source;

      // Truncate URL for display
      const archivedUrl = img.image_url || '';
      const truncatedUrl = archivedUrl.length > 45 ? archivedUrl.substring(0, 42) + '...' : archivedUrl;

      doc.text(String(img.page_order), startX, y);
      doc.text(String(img.chapter_number), startX + colWidths.page, y);
      doc.text(truncatedCaption, startX + colWidths.page + colWidths.chapter, y);
      doc.text(sourceDisplay, startX + colWidths.page + colWidths.chapter + colWidths.caption, y);
      doc.text(truncatedLicense, startX + colWidths.page + colWidths.chapter + colWidths.caption + colWidths.source, y);
      
      // URL as link
      doc.setTextColor(0, 0, 255);
      doc.text(truncatedUrl, startX + colWidths.page + colWidths.chapter + colWidths.caption + colWidths.source + colWidths.license, y);
      doc.setTextColor(0, 0, 0);

      y += 0.25;

      // Add original URL on next line if different from archived
      if (img.original_url && img.original_url !== img.image_url) {
        const truncatedOriginal = img.original_url.length > 60 ? img.original_url.substring(0, 57) + '...' : img.original_url;
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        doc.text(`Original: ${truncatedOriginal}`, startX + colWidths.page + colWidths.chapter, y);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
        y += 0.2;
      }
    }

    // Footer note
    y += 0.3;
    doc.setFontSize(8);
    doc.setFont("times", "italic");
    const footerNote = images.length > 0 
      ? "This manifest documents the provenance of all images used in this publication. Archived URLs point to permanent copies stored in our secure infrastructure. Original URLs document the source for legal verification."
      : "No images found in book_pages table. Images may not have been selected or archived yet.";
    const splitFooter = doc.splitTextToSize(footerNote, 7);
    doc.text(splitFooter, 0.75, y);

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

  const handleDownloadManifest = async () => {
    try {
      setIsGenerating(true);
      const blob = await generateImageManifestBlob();
      triggerDownload(blob, '03_Image_Manifest.pdf');
      toast.success('Image Manifest downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Manifest Generation Failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      zip.file("01_Declaration_Letter.rtf", getRtfContent());
      zip.file("02_Evidence_Dossier.pdf", generatePdfBlob());
      
      // Generate and add Image Manifest
      const manifestBlob = await generateImageManifestBlob();
      zip.file("03_Image_Manifest.pdf", manifestBlob);

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
                {scanResults.hasRun 
                  ? `Scan complete. ${imageCount !== null ? `${imageCount} images tracked.` : ''}` 
                  : 'Scan content to verify risks.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={scanContent} disabled={isScanning}>
            {isScanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
            {isScanning ? 'Scanning...' : 'Scan Content'}
          </Button>
        </div>

        {/* Scan Results */}
        {scanResults.hasRun && (
          <div className="grid grid-cols-3 gap-2 text-xs">
             <div className="p-2 rounded-md bg-secondary/50 flex items-start gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${scanResults.trademarks.length > 0 ? 'text-amber-500' : 'text-green-600'}`} />
               <div>
                <p className="font-medium">Trademarks Found: {scanResults.trademarks.length}</p>
                {scanResults.trademarks.length > 0 && <p className="text-muted-foreground truncate">{scanResults.trademarks.join(", ")}</p>}
               </div>
             </div>
             <div className="p-2 rounded-md bg-secondary/50 flex items-start gap-2">
                <Copy className={`w-4 h-4 shrink-0 ${scanResults.repeats.length > 0 ? 'text-amber-500' : 'text-green-600'}`} />
               <div>
                <p className="font-medium">Repetitive Phrases: {scanResults.repeats.length}</p>
               </div>
             </div>
             <div className="p-2 rounded-md bg-secondary/50 flex items-start gap-2">
               <Image className="w-4 h-4 shrink-0 text-blue-500" />
               <div>
                <p className="font-medium">Images Tracked: {imageCount ?? '...'}</p>
               </div>
             </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t my-2" />

        {/* DOWNLOADS (Always Visible) */}
        <div className="space-y-3">
          
          <div className="border rounded-lg p-4 bg-secondary/30 text-center space-y-2">
            <Button onClick={handleDownloadZip} disabled={isGenerating} className="w-full">
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {isGenerating ? 'Packaging...' : 'Download Defense Kit (.zip)'}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Includes Declaration Letter, Evidence PDF, and Image Manifest.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 border-t" />
            <span>Or Individual Files</span>
            <div className="flex-1 border-t" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTxt}>
              <FileText className="w-4 h-4 mr-1 text-blue-600" />
              Declaration
            </Button>

            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <FileText className="w-4 h-4 mr-1 text-red-600" />
              Evidence
            </Button>

            <Button variant="outline" size="sm" onClick={handleDownloadManifest} disabled={isGenerating}>
              <Image className="w-4 h-4 mr-1 text-green-600" />
              Manifest
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
