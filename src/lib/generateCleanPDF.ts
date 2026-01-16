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
  isKdpManuscript = false,
  returnBlob = false
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

  // Title Page
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
    if (yPos > pageHeight - margin) {
      doc.addPage();
      yPos = margin + 0.5;
    }
    doc.text(`Chapter ${ch.chapter}: ${ch.title}`, margin, yPos);
    yPos += 0.35;
  });

  // Chapters
  for (const ch of chapters) {
    doc.addPage();
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text(`CHAPTER ${ch.chapter}`, pageWidth / 2, margin + 0.5, { align: 'center' });
    doc.setFontSize(18);
    const titleLines = doc.splitTextToSize(ch.title, writableWidth);
    doc.text(titleLines, pageWidth / 2, margin + 0.9, { align: 'center' });
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

      // Headers (###)
      if (line.startsWith('#')) {
        doc.setFont('times', 'bold');
        doc.setFontSize(13);
        yPos += 0.2;
        const text = line.replace(/#+\s*/, '');
        const split = doc.splitTextToSize(text, writableWidth);
        doc.text(split, margin, yPos);
        yPos += (split.length * 0.22) + 0.1;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        continue;
      }

      // Images (![alt](url))
      const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch && imgMatch[1]) {
        try {
          if (yPos + 3 > pageHeight - margin) {
            doc.addPage();
            yPos = margin + 0.5;
          }
          const img = await loadImage(imgMatch[1]);
          if (img.width > 0) {
            const aspect = img.width / img.height;
            const w = Math.min(4, writableWidth);
            const h = w / aspect;
            doc.addImage(img, 'JPEG', (pageWidth - w) / 2, yPos, w, h);
            yPos += h + 0.3;
          }
        } catch (e) {}
        continue;
      }

      // Plain Text
      const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '');
      const splitText = doc.splitTextToSize(cleanLine, writableWidth);
      doc.text(splitText, margin, yPos);
      yPos += (splitText.length * 0.22);
    }
  }

  if (returnBlob) return doc.output('blob');
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
};
