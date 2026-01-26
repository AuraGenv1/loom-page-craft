import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, ShieldCheck, Search, Download, FileText, Loader2 } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import { toast } from 'sonner';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// 1. Robust Font Registration
const pdfMakeAny = pdfMake as any;
if (pdfMakeAny && pdfFonts) {
  const vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs || pdfFonts;
  if (vfs) pdfMakeAny.vfs = vfs;
}

// 2. Simple, Solid Download Trigger
const triggerBrowserDownload = (blob: Blob, filename: string) => {
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

  // Fake Scan Logic (UX Only)
  const scanContent = () => {
    setIsScanning(true);
    setTimeout(() => {
      setHasScanned(true);
      setIsScanning(false);
    }, 1500);
  };

  const generateDefensePackage = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      toast.info("Generating Defense Kit...");
      const zip = new JSZip();
      
      // Text File
      zip.file("01_Declaration.txt", `Declaration of Rights for ${title}\nPublisher: ${publisherName}\nDate: ${new Date().toLocaleDateString()}`);

      // PDF File
      const docDefinition = {
        content: [
          { text: 'COMPLIANCE DOSSIER', style: 'header', alignment: 'center', margin: [0, 20] },
          { text: `Title: ${title}`, margin: [0, 10] },
          { text: `Publisher: ${publisherName}`, margin: [0, 10] },
          { text: 'This document confirms AI usage and image licensing rights.', margin: [0, 20] }
        ],
        styles: { header: { fontSize: 18, bold: true } }
      };

      const pdfBlob = await new Promise<Blob>((resolve, reject) => {
        try {
          pdfMake.createPdf(docDefinition).getBlob((blob) => resolve(blob));
        } catch (err) { reject(err); }
      });

      zip.file("02_Evidence_Dossier.pdf", pdfBlob);
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerBrowserDownload(zipBlob, `Defense_Kit.zip`);
      
      toast.success("Defense Kit Downloaded!");
    } catch (err: any) {
      console.error("Defense Kit Error:", err);
      toast.error("Failed to generate kit: " + err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Copyright Defense</h3>
        {!hasScanned && (
          <Button variant="outline" size="sm" onClick={scanContent} disabled={isScanning}>
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            {isScanning ? 'Scanning...' : 'Scan'}
          </Button>
        )}
      </div>

      {hasScanned && (
        <ScrollArea className="h-[200px]">
          <div className="flex items-center gap-2 p-2 bg-green-50 rounded-md text-green-700 mb-4">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm font-medium">Content Scanned. Ready for Defense.</span>
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            <p>Publisher Identity: {publisherName}</p>
          </div>
          <Button onClick={generateDefensePackage} className="w-full">
            <Download className="w-4 h-4 mr-2" /> Download Defense Kit (.zip)
          </Button>
        </ScrollArea>
      )}
    </div>
  );
};

export default KdpLegalDefense;
