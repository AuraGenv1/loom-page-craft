import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, ShieldCheck, Search, Download, FileText, Loader2 } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import { toast } from 'sonner';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// Register fonts safely
const pdfMakeAny = pdfMake as any;
if (pdfMakeAny && pdfFonts && (pdfFonts as any).pdfMake && (pdfFonts as any).pdfMake.vfs) {
  pdfMakeAny.vfs = (pdfFonts as any).pdfMake.vfs;
} else if (pdfMakeAny && pdfFonts) {
  pdfMakeAny.vfs = pdfFonts;
}

interface KdpLegalDefenseProps {
  bookData: BookData;
  title: string;
}

const KdpLegalDefense: React.FC<KdpLegalDefenseProps> = ({ bookData, title }) => {
  const publisherName = "Larvotto Ventures LLC DBA Loom & Page";
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [flaggedTerms, setFlaggedTerms] = useState<string[]>([]);
  const [factualClaims, setFactualClaims] = useState<string[]>([]);
  const [repeatedPhrases, setRepeatedPhrases] = useState<string[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const TRADEMARK_WATCHLIST = [
    'Disney', 'Marvel', 'Star Wars', 'Harry Potter', 'Nike', 'Coca-Cola', 'Lego', 
    'Minecraft', 'Barbie', 'Apple', 'Google', 'Amazon', 'Netflix', 'Tesla', 'Instagram', 'Facebook', 'Mickey Mouse'
  ];

  const scanContent = () => {
    setIsScanning(true);
    
    // Artificial delay for UX
    setTimeout(() => {
      let allText = bookData.chapter1Content || "";
      for (let i = 2; i <= 12; i++) {
         // @ts-ignore
         const ch = bookData[`chapter${i}Content`];
         if (ch) allText += " " + ch;
      }

      // 1. Trademarks
      const foundTrademarks = TRADEMARK_WATCHLIST.filter(term => 
        allText.toLowerCase().includes(term.toLowerCase())
      );
      setFlaggedTerms(foundTrademarks);

      // 2. Fact Claims
      const sentences = allText.match(/[^.!?]+[.!?]/g) || [];
      const claims = sentences.filter(s => 
        s.match(/\b(19|20)\d{2}\b/) || 
        s.match(/\$\d+/) || 
        s.match(/\d+%/) || 
        s.toLowerCase().includes('proven')
      ).slice(0, 20);
      setFactualClaims(claims);

      // 3. Repetition
      const counts: Record<string, number> = {};
      const repeats: string[] = [];
      sentences.forEach(s => {
        const clean = s.trim();
        if (clean.length > 25) {
          counts[clean] = (counts[clean] || 0) + 1;
          if (counts[clean] === 2) repeats.push(clean);
        }
      });
      setRepeatedPhrases(repeats);

      if (foundTrademarks.length > 0 || repeats.length > 5) setRiskLevel('high');
      else if (claims.length > 10) setRiskLevel('medium');
      else setRiskLevel('low');

      setHasScanned(true);
      setIsScanning(false);
    }, 1500);
  };

  const generateDefensePackage = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents parent dialog from catching the click
    
    try {
      toast.info("Generating defense documents...");
      const zip = new JSZip();
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // 1. GENERATE THE EDITABLE LETTER (TXT)
      const letterContent = `
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
      
      zip.file("01_Declaration_Letter_Editable.txt", letterContent);

      // 2. GENERATE THE EVIDENCE PDF (PDFMAKE)
      const docDefinition: any = {
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
                [{ text: 'AI Model Used:', bold: true }, 'Google Gemini 1.5 Pro (Enterprise)']
              ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 40]
          },

          { text: 'TABLE OF CONTENTS', style: 'sectionHeader' },
          { ul: [
              'Exhibit A: Google Generative AI Commercial Terms',
              'Exhibit B: Unsplash Commercial License',
              'Exhibit C: Wikimedia Public Domain Policy'
            ], margin: [0, 0, 0, 20] 
          },

          { text: '', pageBreak: 'after' },

          // EXHIBIT A
          { text: 'EXHIBIT A: TEXT GENERATION LICENSE', style: 'sectionHeader' },
          { text: 'Source: Google Generative AI Service Specific Terms', style: 'sourceLink' },
          { text: 'Relevant Clause: Ownership of Content', bold: true, margin: [0, 10, 0, 5] },
          { text: '"As between you and Google, you own all content that you generate using the Services."', style: 'quoteBlock' },
          { text: 'Relevant Clause: Commercial Use', bold: true, margin: [0, 10, 0, 5] },
          { text: '"You may use the Services to generate content for commercial purposes, subject to these Terms and the Prohibited Use Policy."', style: 'quoteBlock' },
          
          { text: '', pageBreak: 'after' },

          // EXHIBIT B
          { text: 'EXHIBIT B: IMAGE LICENSE (UNSPLASH)', style: 'sectionHeader' },
          { text: 'Source: https://unsplash.com/license', style: 'sourceLink' },
          { text: 'Full License Text', bold: true, margin: [0, 10, 0, 5] },
          { text: '"Unsplash grants you an irrevocable, nonexclusive, worldwide copyright license to download, copy, modify, distribute, perform, and use photos from Unsplash for free, including for commercial purposes, without permission from or attributing the photographer or Unsplash."', style: 'quoteBlock' },
          
          { text: '', pageBreak: 'after' },

          // EXHIBIT C
          { text: 'EXHIBIT C: PUBLIC DOMAIN POLICY', style: 'sectionHeader' },
          { text: 'Source: CreativeCommons.org (CC0)', style: 'sourceLink' },
          { text: 'Universal Public Domain Dedication', bold: true, margin: [0, 10, 0, 5] },
          { text: '"The person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide under copyright law... You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission."', style: 'quoteBlock' }
        ],
        styles: {
          header: { fontSize: 24, bold: true },
          subheader: { fontSize: 14, italics: true, color: '#555' },
          sectionHeader: { fontSize: 16, bold: true, decoration: 'underline', margin: [0, 0, 0, 10] },
          sourceLink: { fontSize: 10, italics: true, color: '#666', margin: [0, 0, 0, 5] },
          quoteBlock: { fontSize: 11, italics: true, background: '#f5f5f5', margin: [10, 5, 10, 15] }
        }
      };

      // Generate PDF Blob
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      
      pdfDocGenerator.getBlob((blob) => {
        // Add PDF to ZIP
        zip.file("02_Evidence_Dossier.pdf", blob);
        
        // Generate and Download ZIP
        zip.generateAsync({ type: "blob" }).then((content) => {
          const url = URL.createObjectURL(content);
          const a = document.createElement("a");
          a.href = url;
          a.download = `Defense_Kit_${title.substring(0, 15).replace(/\s/g, '_')}.zip`;
          a.click();
          toast.success("Defense Kit Downloaded!");
        });
      });
    } catch (e: any) {
      console.error("Defense Kit failed:", e);
      toast.error(`Error: ${e.message}`);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className={`h-8 w-8 ${riskLevel === 'low' ? 'text-green-600' : riskLevel === 'medium' ? 'text-amber-500' : 'text-red-600'}`} />
            <div>
              <h4 className="font-semibold">Copyright Defense Center</h4>
              <p className="text-sm text-muted-foreground">{!hasScanned ? 'Scan your content first.' : 'Review checks below.'}</p>
            </div>
          </div>
          {!hasScanned && (
            <Button onClick={scanContent} variant="outline" size="sm" disabled={isScanning}>
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" /> Scan
                </>
              )}
            </Button>
          )}
        </div>

        {/* Scan Results */}
        {hasScanned && (
          <div className="space-y-3">
            {/* Trademarks */}
            <div className="flex items-start gap-2 p-3 bg-secondary/50 rounded-lg">
               <AlertTriangle className={`h-5 w-5 shrink-0 ${flaggedTerms.length > 0 ? 'text-amber-500' : 'text-green-600'}`} />
               <div>
                <p className="text-sm font-medium">Potential Trademarks: {flaggedTerms.length}</p>
                {flaggedTerms.length > 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">{flaggedTerms.join(", ")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Clean.</p>
                )}
               </div>
             </div>
             
             {/* Repetitive Text */}
             <div className="flex items-start gap-2 p-3 bg-secondary/50 rounded-lg">
               <AlertTriangle className={`h-5 w-5 shrink-0 ${repeatedPhrases.length > 0 ? 'text-amber-500' : 'text-green-600'}`} />
               <div>
                <p className="text-sm font-medium">Repetitive Phrases: {repeatedPhrases.length}</p>
                {repeatedPhrases.length > 0 ? (
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    {repeatedPhrases.slice(0, 3).map((s, i) => <p key={i} className="truncate max-w-xs">"{s}"</p>)}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Clean.</p>
                )}
               </div>
             </div>

             {/* Fact Claims */}
             <div className="flex items-start gap-2 p-3 bg-secondary/50 rounded-lg">
               <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
               <p className="text-sm font-medium">Fact Claims Found: {factualClaims.length}</p>
             </div>
          </div>
        )}

        {/* Download Section */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-3">
            Publisher Identity: <span className="font-medium">{publisherName}</span>
          </p>
          <Button onClick={(e) => generateDefensePackage(e)} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Download Defense Kit (.zip)
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
};

export default KdpLegalDefense;
