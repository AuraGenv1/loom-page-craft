import jsPDF from 'jspdf';
import { BookData } from './bookTypes';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
}

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  coverImageUrl, 
  isKdpManuscript = false,
  returnBlob = false 
}: GeneratePDFOptions): Promise<Blob | void> => {
  const format = isKdpManuscript ? [6, 9] : 'letter';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: format });

  const title = bookData.displayTitle || topic;
  const pageWidth = isKdpManuscript ? 6 : 8.5;
  const pageHeight = isKdpManuscript ? 9 : 11;
  const margin = 0.8; 
  const writableWidth = pageWidth - (margin * 2);

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(new Image()); 
      img.src = url;
    });
  };

  // Title Page
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  const splitTitle = doc.splitTextToSize(title, writableWidth);
  let yPos = 3.5;
  doc.text(splitTitle, pageWidth / 2, yPos, { align: 'center' });
  
  if (bookData.subtitle) {
    yPos += (splitTitle.length * 0.5);
    doc.setFontSize(14);
    doc.setFont('times', 'italic');
    const splitSub = doc.splitTextToSize(bookData.subtitle, writableWidth);
    doc.text(splitSub, pageWidth / 2, yPos, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  doc.text("Loom & Page", pageWidth / 2, pageHeight - 1, { align: 'center' });

  // TOC
  doc.addPage();
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text("Table of Contents", pageWidth / 2, margin + 0.5, { align: 'center' });
  
  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const chapters = bookData.tableOfContents || [];
  yPos = margin + 1.5;
  
  chapters.forEach((ch: any) => {
    if (yPos > pageHeight - margin) { doc.addPage(); yPos = margin + 0.5; }
    doc.text(`Chapter ${ch.chapter}: ${ch.title}`, margin, yPos);
    yPos += 0.35;
  });

  // Chapters
  for (const ch of chapters) {
    doc.addPage();
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text(`CHAPTER ${ch.chapter}`, pageWidth / 2, margin + 0.5, { align: 'center' });
    
    doc.setFontSize(20);
    const titleLines = doc.splitTextToSize(ch.title, writableWidth);
    doc.text(titleLines, pageWidth / 2, margin + 0.9, { align: 'center' });
    yPos = margin + 1.5 + (titleLines.length * 0.3);

    const content = bookData[`chapter${ch.chapter}Content`] || "";
    const lines = content.split('\n');

    doc.setFont('times', 'normal');
    doc.setFontSize(11.5);
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      if (yPos > pageHeight - margin) { doc.addPage(); yPos = margin + 0.5; }

      // Handle Image
      const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch && imgMatch[1]) {
        try {
           const img = await loadImage(imgMatch[1]);
           if (img.width > 0) {
             const imgAspect = img.width / img.height;
             const renderWidth = Math.min(4, writableWidth);
             const renderHeight = renderWidth / imgAspect;
             if (yPos + renderHeight > pageHeight - margin) { doc.addPage(); yPos = margin + 0.5; }
             doc.addImage(img, 'JPEG', (pageWidth - renderWidth) / 2, yPos, renderWidth, renderHeight);
             yPos += renderHeight + 0.3;
           }
        } catch (e) {}
        continue;
      }

      // Handle Headers
      if (line.startsWith('#')) {
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        yPos += 0.2;
        const text = line.replace(/#+\s*/, '');
        const splitText = doc.splitTextToSize(text, writableWidth);
        doc.text(splitText, margin, yPos);
        yPos += (splitText.length * 0.22) + 0.1;
        doc.setFont('times', 'normal');
        doc.setFontSize(11.5);
        continue;
      }

      const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '');
      const splitText = doc.splitTextToSize(cleanLine, writableWidth);
      doc.text(splitText, margin, yPos);
      yPos += (splitText.length * 0.22) + 0.15;
    }
  }

  if (returnBlob) return doc.output('blob');
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
};
