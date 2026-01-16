import jsPDF from 'jspdf';
import { BookData } from './bookTypes';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  coverImageUrl, 
  isKdpManuscript = false,
  returnBlob = false,
  includeCoverPage = false
}: GeneratePDFOptions): Promise<Blob | void> => {
  const format = isKdpManuscript ? [6, 9] : 'letter';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format });
  const title = bookData.displayTitle || topic;
  const pageWidth = isKdpManuscript ? 6 : 8.5;
  const pageHeight = isKdpManuscript ? 9 : 11;
  const margin = 0.8;
  const writableWidth = pageWidth - (margin * 2);

  const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(new Image());
    img.src = url;
  });

  // --- 1. COVER PAGE (Optional - for Guests) ---
  if (includeCoverPage) {
    // Dark Onyx Background
    doc.setFillColor(20, 20, 20); 
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Cover Image (Top 60%)
    if (coverImageUrl) {
      try {
        const img = await loadImage(coverImageUrl);
        if (img.width > 0) {
          doc.addImage(img, 'JPEG', 0, 0, pageWidth, pageHeight * 0.6); 
        }
      } catch (e) {}
    }

    // Title Block (Bottom 40%)
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageHeight * 0.6, pageWidth, pageHeight * 0.4, 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.setFont('times', 'bold');
    doc.setFontSize(28);
    const titleLines = doc.splitTextToSize(title, writableWidth);
    doc.text(titleLines, pageWidth / 2, pageHeight * 0.7, { align: 'center' });
    
    if (bookData.subtitle) {
      doc.setFontSize(14);
      doc.setFont('times', 'italic');
      doc.setTextColor(80, 80, 80);
      doc.text(doc.splitTextToSize(bookData.subtitle, writableWidth), pageWidth / 2, pageHeight * 0.8, { align: 'center' });
    }
    
    doc.addPage();
  }

  // --- 2. TITLE PAGE ---
  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  const splitTitle = doc.splitTextToSize(title, writableWidth);
  let yPos = 3.5;
  doc.text(splitTitle, pageWidth / 2, yPos, { align: 'center' });
  
  if (bookData.subtitle) {
    yPos += (splitTitle.length * 0.4) + 0.5;
    doc.setFontSize(14);
    doc.setFont('times', 'italic');
    doc.text(doc.splitTextToSize(bookData.subtitle, writableWidth), pageWidth / 2, yPos, { align: 'center' });
  }

  // --- 3. TOC ---
  doc.addPage();
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text("Table of Contents", pageWidth / 2, margin + 0.5, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const chapters = bookData.tableOfContents || [];
  yPos = margin + 1.5;

  chapters.forEach((ch: any) => {
    if (yPos > pageHeight - margin) {
      doc.addPage();
      yPos = margin + 0.5;
    }
    doc.text(`Chapter ${ch.chapter}: ${ch.title}`, margin, yPos);
    yPos += 0.35;
  });

  // --- 4. CHAPTERS (With Pro-Tips & Images) ---
  for (const ch of chapters) {
    doc.addPage();
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text(`CHAPTER ${ch.chapter}`, pageWidth / 2, margin + 0.5, { align: 'center' });
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    const chapterTitleLines = doc.splitTextToSize(ch.title, writableWidth);
    doc.text(chapterTitleLines, pageWidth / 2, margin + 0.9, { align: 'center' });
    yPos = margin + 1.8;

    const content = bookData[`chapter${ch.chapter}Content`] || "";
    const lines = content.split('\n');

    doc.setFont('times', 'normal');
    doc.setFontSize(11);

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
        yPos += 0.15;
        continue;
      }

      if (yPos > pageHeight - margin) {
        doc.addPage();
        yPos = margin + 0.5;
      }

      // Images (![alt](url))
      const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch && imgMatch[1]) {
        try {
          if (yPos + 3.5 > pageHeight - margin) {
            doc.addPage();
            yPos = margin + 0.5;
          }
          const img = await loadImage(imgMatch[1]);
          if (img.width > 0) {
            const aspect = img.width / img.height;
            const w = Math.min(4.5, writableWidth);
            const h = w / aspect;
            doc.addImage(img, 'JPEG', (pageWidth - w) / 2, yPos, w, h);
            yPos += h + 0.3;
          }
        } catch (e) {}
        continue;
      }

      // Headers (###)
      if (line.startsWith('#')) {
        doc.setFont('times', 'bold');
        doc.setFontSize(13);
        yPos += 0.25;
        const text = line.replace(/#+\s*/, '');
        const split = doc.splitTextToSize(text, writableWidth);
        doc.text(split, margin, yPos);
        yPos += (split.length * 0.22) + 0.15;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        continue;
      }

      // Pro-Tips (> Text) - Gray Box
      if (line.startsWith('>')) {
        doc.setFont('times', 'italic');
        const text = line.replace(/^>\s*/, '').replace(/\*\*/g, '');
        const split = doc.splitTextToSize(text, writableWidth - 0.4);
        const boxHeight = (split.length * 0.22) + 0.4;
        
        doc.setFillColor(245, 245, 245);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(margin, yPos, writableWidth, boxHeight, 0.1, 0.1, 'FD');
        
        doc.setTextColor(60, 60, 60);
        doc.text(split, margin + 0.2, yPos + 0.3);
        
        yPos += boxHeight + 0.2;
        doc.setTextColor(0, 0, 0);
        doc.setFont('times', 'normal');
        continue;
      }

      // Standard Text
      const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '');
      const splitText = doc.splitTextToSize(cleanLine, writableWidth);
      doc.text(splitText, margin, yPos);
      yPos += (splitText.length * 0.22);
    }
  }

  if (returnBlob) return doc.output('blob');
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};
