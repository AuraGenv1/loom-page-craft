import jsPDF from 'jspdf';
import { BookData } from './bookTypes';
import { registerPlayfairFont, setSerifFont } from './pdfFonts';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

// ============================================================
// KDP MANUSCRIPT PDF GENERATOR - "ONYX" DESIGN SYSTEM
// ============================================================
// 6x9 inch Trade Paperback | 0.75" margins | Playfair Display
// ============================================================

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  coverImageUrl, 
  isKdpManuscript = false,
  returnBlob = false,
  includeCoverPage = false
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // --- DOCUMENT SETUP ---
  const format = isKdpManuscript ? [6, 9] : 'letter';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format });
  
  // Register Playfair Display font
  const hasPlayfair = await registerPlayfairFont(doc);
  
  const title = bookData.displayTitle || topic;
  const pageWidth = isKdpManuscript ? 6 : 8.5;
  const pageHeight = isKdpManuscript ? 9 : 11;
  const margin = 0.75; // KDP safe zone
  const writableWidth = pageWidth - (margin * 2);
  
  // --- FONT SIZES (in points) ---
  const FONTS = {
    chapterLabel: 10,
    chapterTitle: 18,
    sectionHeader: 13,
    subHeader: 11,
    body: 10.5,
    proTipLabel: 8,
    proTipBody: 10,
    copyright: 9,
    tocTitle: 14,
    tocEntry: 11,
  };
  
  // --- LINE HEIGHTS ---
  const LINE_HEIGHT = {
    body: 0.20,      // ~1.8 line spacing
    header: 0.28,
    proTip: 0.18,
  };

  // --- HELPER: Load Image ---
  const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(new Image()); // Return empty image on error
    img.src = url;
  });

  // --- HELPER: Calculate Text Height ---
  const getTextHeight = (text: string, fontSize: number, maxWidth: number): number => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    return lines.length * (fontSize / 72) * 1.4; // Approx line height in inches
  };

  // --- HELPER: Check Page Space & Add Page if Needed ---
  const ensureSpace = (yPos: number, requiredSpace: number): number => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      return margin + 0.4;
    }
    return yPos;
  };

  // --- HELPER: Draw "Onyx" Pro-Tip Block ---
  const drawProTipBlock = (text: string, yPos: number): number => {
    const cleanText = text.replace(/\*?\*?pro[- ]?tip:?\*?\*?/gi, '').replace(/\*\*/g, '').trim();
    const blockMargin = margin + 0.15;
    const textIndent = 0.3;
    const textWidth = writableWidth - textIndent - 0.1;
    
    // Calculate block height
    setSerifFont(doc, hasPlayfair, 'italic');
    doc.setFontSize(FONTS.proTipBody);
    const lines = doc.splitTextToSize(cleanText, textWidth);
    const labelHeight = 0.25;
    const textHeight = lines.length * LINE_HEIGHT.proTip;
    const totalHeight = labelHeight + textHeight + 0.2;
    
    // Check if we need a new page
    yPos = ensureSpace(yPos, totalHeight + 0.3);
    
    // Draw thick black accent line (3px ≈ 0.04 inches)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.04);
    doc.line(margin, yPos, margin, yPos + totalHeight);
    
    // Draw "PRO TIP" label
    setSerifFont(doc, hasPlayfair, 'bold');
    doc.setFontSize(FONTS.proTipLabel);
    doc.setTextColor(0, 0, 0);
    doc.text('PRO TIP', blockMargin + textIndent, yPos + 0.15);
    
    // Draw italic body text
    setSerifFont(doc, hasPlayfair, 'italic');
    doc.setFontSize(FONTS.proTipBody);
    doc.setTextColor(60, 60, 60);
    
    let textY = yPos + labelHeight + 0.1;
    lines.forEach((line: string) => {
      doc.text(line, blockMargin + textIndent, textY);
      textY += LINE_HEIGHT.proTip;
    });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    return yPos + totalHeight + 0.3;
  };

  // --- HELPER: Draw Section Header with Orphan Control ---
  const drawSectionHeader = (text: string, yPos: number, level: number): number => {
    const fontSize = level === 1 ? FONTS.sectionHeader : FONTS.subHeader;
    const headerHeight = 0.35;
    const minFollowingLines = 3;
    const requiredSpace = headerHeight + (minFollowingLines * LINE_HEIGHT.body);
    
    // Orphan control: ensure header + 3 lines fit
    yPos = ensureSpace(yPos, requiredSpace);
    
    yPos += 0.2; // Pre-header spacing
    
    setSerifFont(doc, hasPlayfair, 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);
    
    const lines = doc.splitTextToSize(text, writableWidth);
    lines.forEach((line: string) => {
      doc.text(line, margin, yPos);
      yPos += LINE_HEIGHT.header;
    });
    
    yPos += 0.1; // Post-header spacing
    
    return yPos;
  };

  // --- HELPER: Draw Paragraph ---
  const drawParagraph = (text: string, yPos: number): number => {
    setSerifFont(doc, hasPlayfair, 'normal');
    doc.setFontSize(FONTS.body);
    doc.setTextColor(30, 30, 30);
    
    const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
    const lines = doc.splitTextToSize(cleanText, writableWidth);
    
    lines.forEach((line: string) => {
      yPos = ensureSpace(yPos, LINE_HEIGHT.body + 0.1);
      doc.text(line, margin, yPos);
      yPos += LINE_HEIGHT.body;
    });
    
    yPos += 0.1; // Paragraph spacing
    return yPos;
  };

  // --- HELPER: Draw Centered Image ---
  const drawImage = async (url: string, yPos: number, alt?: string): Promise<number> => {
    try {
      const img = await loadImage(url);
      if (img.width === 0) return yPos;
      
      const maxImgWidth = 4.0;
      const maxImgHeight = 3.0;
      const aspect = img.width / img.height;
      
      let imgWidth = Math.min(maxImgWidth, writableWidth);
      let imgHeight = imgWidth / aspect;
      
      if (imgHeight > maxImgHeight) {
        imgHeight = maxImgHeight;
        imgWidth = imgHeight * aspect;
      }
      
      // Ensure image fits on page
      yPos = ensureSpace(yPos, imgHeight + 0.5);
      
      const imgX = (pageWidth - imgWidth) / 2;
      doc.addImage(img, 'JPEG', imgX, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 0.15;
      
      // Caption
      if (alt) {
        setSerifFont(doc, hasPlayfair, 'italic');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const captionLines = doc.splitTextToSize(alt, writableWidth * 0.8);
        captionLines.forEach((line: string) => {
          doc.text(line, pageWidth / 2, yPos, { align: 'center' });
          yPos += 0.15;
        });
        doc.setTextColor(0, 0, 0);
      }
      
      yPos += 0.2;
      return yPos;
    } catch (e) {
      console.warn('Image load failed:', e);
      return yPos;
    }
  };

  // =========================================================
  // 1. COVER PAGE (Optional - for Guest Downloads)
  // =========================================================
  if (includeCoverPage) {
    // Dark background
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Cover image (top 60%)
    if (coverImageUrl) {
      try {
        const img = await loadImage(coverImageUrl);
        if (img.width > 0) {
          doc.addImage(img, 'JPEG', 0, 0, pageWidth, pageHeight * 0.6);
        }
      } catch (e) { /* ignore */ }
    }
    
    // White title block (bottom 40%)
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageHeight * 0.6, pageWidth, pageHeight * 0.4, 'F');
    
    // Title
    setSerifFont(doc, hasPlayfair, 'bold');
    doc.setFontSize(26);
    doc.setTextColor(0, 0, 0);
    const coverTitleLines = doc.splitTextToSize(title, writableWidth);
    doc.text(coverTitleLines, pageWidth / 2, pageHeight * 0.7, { align: 'center' });
    
    // Subtitle
    if (bookData.subtitle) {
      setSerifFont(doc, hasPlayfair, 'italic');
      doc.setFontSize(12);
      doc.setTextColor(80, 80, 80);
      const subtitleLines = doc.splitTextToSize(bookData.subtitle, writableWidth);
      doc.text(subtitleLines, pageWidth / 2, pageHeight * 0.82, { align: 'center' });
    }
    
    doc.addPage();
  }

  // =========================================================
  // 2. TITLE PAGE (Recto)
  // =========================================================
  setSerifFont(doc, hasPlayfair, 'bold');
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  
  const titleLines = doc.splitTextToSize(title, writableWidth);
  let yPos = 3.5;
  doc.text(titleLines, pageWidth / 2, yPos, { align: 'center' });
  
  if (bookData.subtitle) {
    yPos += (titleLines.length * 0.35) + 0.5;
    setSerifFont(doc, hasPlayfair, 'italic');
    doc.setFontSize(13);
    doc.setTextColor(60, 60, 60);
    const subtitleLines = doc.splitTextToSize(bookData.subtitle, writableWidth);
    doc.text(subtitleLines, pageWidth / 2, yPos, { align: 'center' });
  }

  // =========================================================
  // 3. COPYRIGHT PAGE (Verso)
  // =========================================================
  doc.addPage();
  setSerifFont(doc, hasPlayfair, 'normal');
  doc.setFontSize(FONTS.copyright);
  doc.setTextColor(0, 0, 0);
  
  const year = new Date().getFullYear();
  const month = new Date().toLocaleString('default', { month: 'long' });
  
  const copyrightText = `Copyright © ${year} [Holding Company Name, LLC]

All rights reserved.

Published by Loom & Page
www.LoomandPage.com

No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the publisher, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.

Limit of Liability/Disclaimer of Warranty: While the publisher and author have used their best efforts in preparing this book, they make no representations or warranties with respect to the accuracy or completeness of the contents of this book and specifically disclaim any implied warranties of merchantability or fitness for a particular purpose.

Book generated by Loom & Page AI Engine.

First Edition: ${month} ${year}`;

  const copyrightLines = doc.splitTextToSize(copyrightText.trim(), writableWidth);
  const copyrightHeight = copyrightLines.length * 0.18;
  doc.text(copyrightLines, margin, pageHeight - margin - copyrightHeight);

  // =========================================================
  // 4. TABLE OF CONTENTS
  // =========================================================
  doc.addPage();
  
  setSerifFont(doc, hasPlayfair, 'bold');
  doc.setFontSize(FONTS.tocTitle);
  doc.setTextColor(0, 0, 0);
  doc.text('Table of Contents', pageWidth / 2, margin + 0.6, { align: 'center' });
  
  // Decorative line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.01);
  doc.line(pageWidth / 2 - 0.8, margin + 0.85, pageWidth / 2 + 0.8, margin + 0.85);
  
  setSerifFont(doc, hasPlayfair, 'normal');
  doc.setFontSize(FONTS.tocEntry);
  
  const chapters = bookData.tableOfContents || [];
  yPos = margin + 1.3;
  
  chapters.forEach((ch: any) => {
    if (yPos > pageHeight - margin - 0.5) {
      doc.addPage();
      yPos = margin + 0.5;
    }
    doc.text(`Chapter ${ch.chapter}: ${ch.title}`, margin, yPos);
    yPos += 0.32;
  });

  // =========================================================
  // 5. CHAPTER CONTENT
  // =========================================================
  for (const ch of chapters) {
    // --- Chapter Opening Page ---
    doc.addPage();
    
    // Chapter label (small, gray, centered)
    setSerifFont(doc, hasPlayfair, 'normal');
    doc.setFontSize(FONTS.chapterLabel);
    doc.setTextColor(100, 100, 100);
    doc.text(`CHAPTER ${ch.chapter}`, pageWidth / 2, margin + 0.6, { align: 'center' });
    
    // Chapter title (large, black, centered)
    setSerifFont(doc, hasPlayfair, 'bold');
    doc.setFontSize(FONTS.chapterTitle);
    doc.setTextColor(0, 0, 0);
    const chapterTitleLines = doc.splitTextToSize(ch.title, writableWidth);
    doc.text(chapterTitleLines, pageWidth / 2, margin + 1.0, { align: 'center' });
    
    // Decorative divider
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.008);
    const dividerY = margin + 1.0 + (chapterTitleLines.length * 0.28) + 0.3;
    doc.line(pageWidth / 2 - 0.5, dividerY, pageWidth / 2 + 0.5, dividerY);
    
    yPos = dividerY + 0.5;
    
    // --- Parse & Render Content ---
    const content = bookData[`chapter${ch.chapter}Content`] || '';
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        yPos += 0.1; // Empty line spacing
        continue;
      }
      
      // --- IMAGE ---
      const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch && imgMatch[2]) {
        yPos = await drawImage(imgMatch[2], yPos, imgMatch[1]);
        continue;
      }
      
      // --- HEADERS ---
      if (line.startsWith('###')) {
        const headerText = line.replace(/^###\s*/, '');
        yPos = drawSectionHeader(headerText, yPos, 2);
        continue;
      }
      if (line.startsWith('##')) {
        const headerText = line.replace(/^##\s*/, '');
        yPos = drawSectionHeader(headerText, yPos, 1);
        continue;
      }
      if (line.startsWith('#')) {
        const headerText = line.replace(/^#\s*/, '');
        yPos = drawSectionHeader(headerText, yPos, 1);
        continue;
      }
      
      // --- PRO-TIP (Onyx Style) ---
      if (line.startsWith('>')) {
        const tipText = line.replace(/^>\s*/, '');
        yPos = drawProTipBlock(tipText, yPos);
        continue;
      }
      
      // --- STANDARD PARAGRAPH ---
      yPos = drawParagraph(line, yPos);
    }
  }

  // =========================================================
  // 6. OUTPUT
  // =========================================================
  if (returnBlob) {
    return doc.output('blob');
  }
  
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
};
