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
  // 1. Create PDF (Standard 6x9 or Letter)
  const format = isKdpManuscript ? [6, 9] : 'letter';
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: format
  });

  // 2. Setup Dimensions
  const title = bookData.displayTitle || topic;
  const pageWidth = isKdpManuscript ? 6 : 8.5;
  const pageHeight = isKdpManuscript ? 9 : 11;
  const margin = 0.75;
  const writableWidth = pageWidth - (margin * 2);

  // 3. Title Page
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  const splitTitle = doc.splitTextToSize(title, writableWidth);
  doc.text(splitTitle, pageWidth / 2, 3, { align: 'center' });

  if (bookData.subtitle) {
    doc.setFontSize(14);
    doc.setFont('times', 'italic');
    const splitSub = doc.splitTextToSize(bookData.subtitle, writableWidth);
    doc.text(splitSub, pageWidth / 2, 4.5, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  doc.text("Loom & Page", pageWidth / 2, 8, { align: 'center' });

  // 4. Table of Contents
  doc.addPage();
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text("Table of Contents", pageWidth / 2, margin, { align: 'center' });
  
  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const chapters = bookData.tableOfContents || [];
  let yPos = margin + 0.5;
  
  chapters.forEach((ch: any) => {
    if (yPos > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
    }
    doc.text(`Chapter ${ch.chapter}: ${ch.title}`, margin, yPos);
    yPos += 0.3;
  });

  // 5. Chapters
  for (const ch of chapters) {
    doc.addPage();
    
    // Header
    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.text(`Chapter ${ch.chapter}`, pageWidth / 2, margin, { align: 'center' });
    doc.setFontSize(14);
    doc.text(ch.title, pageWidth / 2, margin + 0.4, { align: 'center' });
    
    // Body Content
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    
    const content = bookData[`chapter${ch.chapter}Content`] || "";
    // Clean markdown specifically for PDF print
    const cleanText = content
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
      .replace(/[#*>`]/g, '') // Remove markdown symbols
      .replace(/\n\n/g, '\n'); // Normalize spacing

    const textLines = doc.splitTextToSize(cleanText, writableWidth);
    
    // Handle pagination for long chapters
    let currentY = margin + 1;
    const lineHeight = 0.2;
    
    for (const line of textLines) {
      if (currentY > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }
      doc.text(line, margin, currentY);
      currentY += lineHeight;
    }
  }

  // 6. Output
  if (returnBlob) {
    return doc.output('blob');
  } else {
    doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
  }
};
