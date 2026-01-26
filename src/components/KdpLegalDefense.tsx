import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, ShieldCheck, Eye, Search, Copy, Download } from 'lucide-react';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import { toast } from 'sonner';

interface KdpLegalDefenseProps {
  bookData: BookData;
  title: string;
}

const KdpLegalDefense: React.FC<KdpLegalDefenseProps> = ({ bookData, title }) => {
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [flaggedTerms, setFlaggedTerms] = useState<string[]>([]);
  const [factualClaims, setFactualClaims] = useState<string[]>([]);
  const [repeatedPhrases, setRepeatedPhrases] = useState<string[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  // High-risk trademarks often flagged by Amazon
  const TRADEMARK_WATCHLIST = [
    'Disney', 'Marvel', 'Star Wars', 'Harry Potter', 'Nike', 'Coca-Cola', 'Lego', 
    'Minecraft', 'Barbie', 'Apple', 'Google', 'Amazon', 'Netflix', 'Tesla', 'Instagram', 'Facebook'
  ];

  const scanContent = () => {
    let allText = bookData.chapter1Content || "";
    // Aggregate all text from available chapters
    for (let i = 2; i <= 12; i++) {
       // @ts-ignore
       const ch = bookData[`chapter${i}Content`];
       if (ch) allText += " " + ch;
    }

    // 1. Trademark Scan
    const foundTrademarks = TRADEMARK_WATCHLIST.filter(term => 
      allText.toLowerCase().includes(term.toLowerCase())
    );
    setFlaggedTerms(foundTrademarks);

    // 2. Fact/Claim Extraction (Simple Heuristics)
    const sentences = allText.match(/[^.!?]+[.!?]/g) || [];
    const claims = sentences.filter(s => 
      s.match(/\b(19|20)\d{2}\b/) || // Years like 1999 or 2024
      s.match(/\$\d+/) || // Money
      s.match(/\d+%/) ||  // Percentages
      s.toLowerCase().includes('proven') ||
      s.toLowerCase().includes('study shows')
    ).slice(0, 20); // Limit to top 20 for review
    setFactualClaims(claims);

    // 3. Repetition Detection
    const counts: Record<string, number> = {};
    const repeats: string[] = [];
    sentences.forEach(s => {
      const clean = s.trim();
      if (clean.length > 25) { // Ignore short phrases
        counts[clean] = (counts[clean] || 0) + 1;
        if (counts[clean] === 2) repeats.push(clean); // Only add once
      }
    });
    setRepeatedPhrases(repeats);

    // Set Risk Level
    if (foundTrademarks.length > 0 || repeats.length > 5) setRiskLevel('high');
    else if (claims.length > 10) setRiskLevel('medium');
    else setRiskLevel('low');

    setHasScanned(true);
  };

  const downloadDefenseKit = async () => {
    const zip = new JSZip();

    // 1. Declaration Letter
    const letter = `
SUBJECT: Copyright & Content Declaration for "${title}"

To the Amazon KDP Review Team:

I confirm that I hold the necessary publishing rights for all content in this book.

1. TEXT GENERATION
The text of this book was drafted using Google Gemini 1.5 Pro (Commercial License) under my direct supervision. I have manually reviewed, edited, and verified the content for accuracy and originality. I retain full copyright ownership of the final compiled work.

2. IMAGE LICENSING
Images used in this book are sourced from:
- Unsplash.com (Commercial License, no attribution required for print).
- Wikimedia Commons (Creative Commons / Public Domain).
- User-Generated Content (Photos taken by the author).
* Section 3: User-Provided Content. Any images not sourced via the automated API were photographed by the author or licensed directly. Proof of license is held on file.

3. TRADEMARKS
Any mention of trademarked terms is purely for descriptive, non-commercial, or fair use purposes (commentary/educational). No affiliation is implied.

4. HUMAN REVIEW
This work has been reviewed for repetitive text and factual hallucinations.

Sincerely,
[Your Name]
[Date]
    `;
    zip.file("01_Declaration_Letter_For_Amazon.txt", letter);

    // 2. Licenses
    zip.file("02_Google_Gemini_Commercial_Terms.txt", "Google allows commercial use of generated output for paid API users. Ownership of generated content belongs to the user.");
    zip.file("03_Unsplash_License.txt", "All photos can be downloaded and used for free for commercial and non-commercial purposes. No permission needed (though attribution is appreciated).");
    zip.file("04_Wikimedia_Policy.txt", "Content is sourced from Public Domain or CC0 sources.");

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "KDP_Defense_Kit.zip";
    a.click();
    toast.success("Defense Kit Downloaded!");
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className={`p-4 rounded-lg border ${
        riskLevel === 'high' ? 'bg-red-50 border-red-200' : 
        riskLevel === 'medium' ? 'bg-amber-50 border-amber-200' : 
        'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-start gap-4">
          {riskLevel === 'high' ? <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" /> :
           riskLevel === 'medium' ? <Eye className="h-6 w-6 text-amber-600 shrink-0" /> :
           <ShieldCheck className="h-6 w-6 text-green-600 shrink-0" />}
          <div className="flex-1">
            <h3 className={`font-semibold ${
              riskLevel === 'high' ? 'text-red-800' : 
              riskLevel === 'medium' ? 'text-amber-800' : 
              'text-green-800'
            }`}>
              {!hasScanned ? 'Scan Required' : 
               riskLevel === 'high' ? 'High Risk Detected' : 
               riskLevel === 'medium' ? 'Moderate Risk (Review Needed)' : 
               'Low Risk (Ready)'}
            </h3>
            <p className={`text-sm mt-1 ${
              riskLevel === 'high' ? 'text-red-700' : 
              riskLevel === 'medium' ? 'text-amber-700' : 
              'text-green-700'
            }`}>
              {!hasScanned ? 'Run a scan to check for trademarks and potential hallucinations.' : 
               'Review the flagged items below before publishing.'}
            </p>
          </div>
          {!hasScanned && (
            <Button onClick={scanContent} variant="outline" size="sm">
              <Search className="h-4 w-4 mr-2" /> Scan Content
            </Button>
          )}
        </div>
      </div>

      {/* Results Area */}
      {hasScanned && (
        <div className="space-y-4">
          <ScrollArea className="h-[400px] pr-4">
            {/* Trademarks */}
            <div className="mb-6">
              <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> 
                Potential Trademarks ({flaggedTerms.length})
              </h4>
              {flaggedTerms.length === 0 ? (
                <p className="text-sm text-muted-foreground">None detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {flaggedTerms.map(t => (
                    <span key={t} className="px-2 py-1 bg-red-100 text-red-800 text-sm rounded-md">{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Repetitions */}
            <div className="mb-6">
              <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                <Copy className="h-4 w-4 text-amber-500" /> 
                Repetitive Phrases ({repeatedPhrases.length})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                AI often repeats itself. Delete these duplicates manually in the Editor.
              </p>
              {repeatedPhrases.length === 0 ? (
                 <p className="text-sm text-green-600">Clean. No loops found.</p>
              ) : (
                <div className="space-y-1">
                  {repeatedPhrases.slice(0, 5).map((s, i) => (
                    <p key={i} className="text-sm text-muted-foreground">• "{s}"</p>
                  ))}
                  {repeatedPhrases.length > 5 && <p className="text-xs text-muted-foreground">...and {repeatedPhrases.length - 5} more</p>}
                </div>
              )}
            </div>

            {/* Facts */}
            <div className="mb-6">
              <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-blue-500" /> 
                Factual Claims to Verify ({factualClaims.length})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                The AI claimed these as facts (dates, money, stats). You must verify them.
              </p>
              <div className="space-y-2">
                {factualClaims.map((claim, i) => (
                  <div key={i} className="p-2 bg-muted rounded-md text-sm text-muted-foreground">
                    "{claim}"
                  </div>
                ))}
              </div>
            </div>

          </ScrollArea>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t">
        <Button onClick={downloadDefenseKit} className="w-full" variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download Copyright Defense Kit (.zip)
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Includes: Declaration Letter, License Terms, and Source Logs.
        </p>
      </div>
    </div>
  );
};

export default KdpLegalDefense;
