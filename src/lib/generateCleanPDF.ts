import jsPDF from 'jspdf';
import { BookData } from './bookTypes';
import { registerPlayfairFont } from './pdfFonts';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

// --- HELPER: VECTOR DRAWING ---
// Draw a vector "Key" icon for Pro-Tips (Corrected to 1-2 o'clock)
const drawKeyIcon = (doc: jsPDF, x: number, y: number, size: number = 0.2) => {
  doc.setDrawColor(0, 0, 0); // Black
  doc.setLineWidth(0.015);
  
  const cx = x + size * 0.4;
  const cy = y + size * 0.6;
  const r = size * 0.25; // Smaller head

  // 1. Key Head (Circle)
  doc.circle(cx, cy, r);
  
  // 2. Key Shaft (Line pointing Top-Right / 1:30 position)
  // Angle: -45 degrees (up/right)
  const angle = -Math.PI / 4;
  
  const startX = cx + (r * Math.cos(angle));
  const startY = cy + (r * Math.sin(angle));
  
  const shaftLen = size * 0.6;
  const endX = startX + (shaftLen * Math.cos(angle));
  const endY = startY + (shaftLen * Math.sin(angle));
  
  doc.line(startX, startY, endX, endY);
  
  // 3. Teeth (Perpendicular to shaft)
  // Perpendicular angle = angle + 90deg
  const teethAngle = angle + (Math.PI / 2);
  const toothLen = size * 0.15;
  
  // Tooth 1 (At the end)
  const t1x = endX + (toothLen * Math.cos(teethAngle));
  const t1y = endY + (toothLen * Math.sin(teethAngle));
  doc.line(endX, endY, t1x, t1y);

  // Tooth 2 (Slightly back)
  const backStep = size * 0.12;
  const midX = endX - (backStep * Math.cos(angle));
  const midY = endY - (backStep * Math.sin(angle));
  
  const t2x = midX + (toothLen * Math.cos(teethAngle));
  const t2y = midY + (toothLen * Math.sin(teethAngle));
  doc.line(midX, midY, t2x, t2y);
};

// --- HELPER: TEXT RENDERING ---
// "Fake Bold" - Renders text multiple times with slight offset to simulate weight
const textBold = (doc: jsPDF, text: string | string[], x: number, y: number, options: any = {}) => {
  // Draw text twice with tiny offset to create faux-bold effect
  doc.text(text, x, y, options);
  doc.text(text, x + 0.003, y, options); // Slight horizontal offset
};

// Robust Image Loader
const loadImage = async (url: string): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Failed to load PDF image:", url);
    return null;
  }
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  coverImageUrl, 
  isKdpManuscript = false,
  returnBlob = false,
  includeCoverPage = false
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // 1. Setup Standard KDP 6x9 Format
  const format = isKdpManuscript ? [6, 9] : 'letter';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format });
  
  // Register Font
  await registerPlayfairFont(doc);

  const title = bookData.displayTitle || topic;
  const pageWidth = isKdpManuscript ? 6 : 8.5;
  const pageHeight = isKdpManuscript ? 9 : 11;
  const margin = 0.75; 
  const writableWidth = pageWidth - (margin * 2);

  let yPos = margin;
  
  // Pagination Check
  const checkPageBreak = (heightNeeded: number) => {
    // Less aggressive buffer (0.25") to prevent empty half-pages
    if (yPos + heightNeeded > pageHeight - 0.5) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // --- 1. TITLE PAGE ---
  doc.setFont('PlayfairDisplay', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  
  yPos = pageHeight * 0.35;
  const splitTitle = doc.splitTextToSize(title.toUpperCase(), writableWidth);
  textBold(doc, splitTitle, pageWidth / 2, yPos, { align: 'center' }); // Fake Bold
  
  yPos += (splitTitle.length * 0.4) + 0.2;
  if (bookData.subtitle) {
    doc.setFont('PlayfairDisplay', 'italic');
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(bookData.subtitle, writableWidth), pageWidth / 2, yPos, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setFont('PlayfairDisplay', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text("LOOM & PAGE", pageWidth / 2, pageHeight - margin, { align: 'center' });

  // --- 2. COPYRIGHT PAGE ---
  doc.addPage();
  doc.setFont('PlayfairDisplay', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  const copyrightText = `Copyright © ${new Date().getFullYear()}

All rights reserved.

Published by Loom & Page
www.LoomandPage.com

No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the publisher.

Book generated by Loom & Page AI Engine.

First Edition: ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`;

  const splitCopyright = doc.splitTextToSize(copyrightText.trim(), writableWidth);
  const copyrightHeight = splitCopyright.length * 0.15;
  doc.text(splitCopyright, margin, pageHeight - margin - copyrightHeight);

  // --- 3. TABLE OF CONTENTS ---
  doc.addPage();
  yPos = margin + 0.5;
  
  doc.setFont('PlayfairDisplay', 'bold');
  doc.setFontSize(16);
  textBold(doc, "Table of Contents", pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 0.5;
  doc.setFont('PlayfairDisplay', 'normal');
  doc.setFontSize(11.5); // Slightly larger
  
  const chapters = bookData.tableOfContents || [];
  chapters.forEach((ch: any) => {
    checkPageBreak(0.35);
    doc.text(`Chapter ${ch.chapter}: ${ch.title}`, margin, yPos);
    yPos += 0.35;
  });

  // --- 4. CHAPTER CONTENT LOOP ---
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const loopSource = chapters.length > 0 ? chapters : chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  for (const ch of loopSource) {
    const chapterNum = ch.chapter;
    const contentKey = `chapter${chapterNum}Content` as keyof BookData;
    const rawContent = (bookData[contentKey] as string) || "";
    
    if (!rawContent) continue;

    // Start Chapter on NEW PAGE
    doc.addPage();
    yPos = margin + 0.5;

    // Header
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont('PlayfairDisplay', 'normal');
    doc.text(`CHAPTER ${chapterNum}`, pageWidth / 2, yPos, { align: 'center', charSpace: 0.1 });
    
    yPos += 0.4;
    
    // Title
    doc.setFont('PlayfairDisplay', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    const chapterTitleLines = doc.splitTextToSize(ch.title, writableWidth);
    textBold(doc, chapterTitleLines, pageWidth / 2, yPos, { align: 'center' });
    
    yPos += (chapterTitleLines.length * 0.35) + 0.3;

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.01);
    const lineW = 0.5;
    doc.line((pageWidth - lineW)/2, yPos, (pageWidth + lineW)/2, yPos);
    
    yPos += 0.5;

    // Content Processing
    const lines = rawContent.replace(/\r\n/g, '\n').split('\n');
    doc.setFont('PlayfairDisplay', 'normal');
    doc.setFontSize(11.5); // 11.5pt Body

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
        yPos += 0.15; // Paragraph spacing
        continue;
      }

      // --- A. IMAGES ---
      const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch && imgMatch[1]) {
        const imgUrl = imgMatch[1];
        const imgSpace = 4.5; 
        
        // Only break if it REALLY doesn't fit
        if (yPos + imgSpace > pageHeight - margin) {
           doc.addPage();
           yPos = margin;
        }
        
        const imgBase64 = await loadImage(imgUrl);
        if (imgBase64) {
          try {
            const w = Math.min(writableWidth, 4.5);
            const h = w * 0.66; // approx landscape
            
            const imgX = (pageWidth - w) / 2;
            doc.addImage(imgBase64, 'JPEG', imgX, yPos, w, h);
            yPos += h + 0.3; 
          } catch (e) {
            console.warn("Error drawing image", e);
          }
        }
        continue;
      }

      // --- B. HEADERS ---
      if (line.startsWith('#')) {
        const level = line.match(/^#+/)?.[0].length || 1;
        const text = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
        
        const requiredSpace = 0.5 + (0.22 * 3); 
        checkPageBreak(requiredSpace);

        doc.setFont('PlayfairDisplay', 'bold');
        const fontSize = level === 1 ? 16 : level === 2 ? 14 : 12;
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        
        yPos += 0.3; 
        const split = doc.splitTextToSize(text, writableWidth);
        textBold(doc, split, margin, yPos); // Fake Bold
        yPos += (split.length * (fontSize/72) * 1.5) + 0.1;
        
        doc.setFont('PlayfairDisplay', 'normal');
        doc.setFontSize(11.5);
        continue;
      }

      // --- C. PRO-TIPS (Corrected Onyx Style) ---
      if (line.startsWith('>')) {
        let proTipContent = line.replace(/^>\s*/, '');
        let lookAheadIndex = i + 1;
        while(lookAheadIndex < lines.length && lines[lookAheadIndex].trim().startsWith('>')) {
          proTipContent += ' ' + lines[lookAheadIndex].trim().replace(/^>\s*/, '');
          i++; 
          lookAheadIndex++;
        }

        const text = proTipContent.replace(/\*\*/g, '').replace(/PRO[- ]?TIP:?/i, '').trim();
        
        const boxPadding = 0.2;
        const indent = boxPadding + 0.1; 
        const textWidth = writableWidth - indent;
        
        doc.setFont('PlayfairDisplay', 'italic'); // Forced Italic
        doc.setFontSize(11);
        const split = doc.splitTextToSize(text, textWidth);
        
        const headerHeight = 0.35; 
        const contentHeight = split.length * 0.22; 
        const totalBoxHeight = headerHeight + contentHeight + (boxPadding * 2);

        checkPageBreak(totalBoxHeight + 0.1);

        // 1. Draw "Onyx" Box (White Background + Black Left Border)
        doc.setFillColor(255, 255, 255); // Explicit White
        doc.rect(margin, yPos, writableWidth, totalBoxHeight, 'F');
        
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.04); 
        doc.line(margin, yPos, margin, yPos + totalBoxHeight);

        // 2. Draw Vector Key Icon
        drawKeyIcon(doc, margin + 0.1, yPos + boxPadding, 0.15);

        // 3. "PRO TIP" Label
        doc.setFont('PlayfairDisplay', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        textBold(doc, "PRO TIP", margin + 0.35, yPos + boxPadding + 0.12);

        // 4. Content
        doc.setFont('PlayfairDisplay', 'italic');
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60); 
        doc.text(split, margin + 0.35, yPos + boxPadding + headerHeight);

        yPos += totalBoxHeight + 0.3; 
        
        doc.setTextColor(0, 0, 0);
        doc.setFont('PlayfairDisplay', 'normal');
        doc.setFontSize(11.5);
        continue;
      }

      // --- D. BULLET POINTS ---
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const cleanLine = line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
        const bulletIndent = 0.25;
        
        const splitText = doc.splitTextToSize(cleanLine, writableWidth - bulletIndent);
        checkPageBreak(splitText.length * 0.22);

        doc.setDrawColor(0,0,0);
        doc.setFillColor(0,0,0);
        doc.circle(margin + 0.1, yPos - 0.05, 0.02, 'F');
        
        doc.text(splitText, margin + bulletIndent, yPos);
        yPos += (splitText.length * 0.22) + 0.05;
        continue;
      }

      // --- E. STANDARD PARAGRAPH ---
      const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, ''); 
      const splitText = doc.splitTextToSize(cleanLine, writableWidth);
      const lineHeight = 0.22; // 1.5x spacing
      
      // Widow Check
      if (yPos + (splitText.length * lineHeight) > pageHeight - 0.5) {
        if (splitText.length < 4) {
           doc.addPage();
           yPos = margin;
        }
      }
      
      checkPageBreak(splitText.length * lineHeight); 
      
      doc.text(splitText, margin, yPos);
      yPos += (splitText.length * lineHeight);
    }
  }

  if (returnBlob) return doc.output('blob');
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};
