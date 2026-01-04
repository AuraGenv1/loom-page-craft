import jsPDF from 'jspdf';
import { BookData, LocalResource } from '@/lib/bookTypes';

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
}

export const generateGuidePDF = async ({ title, topic, bookData }: GeneratePDFOptions) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = margin;

  // Helper function to add new page if needed
  const checkNewPage = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Helper to draw the loom logo
  const drawLoomLogo = (x: number, y: number, scale: number = 1) => {
    const barWidth = 1.5 * scale;
    const barHeight = 8 * scale;
    const gap = 2 * scale;
    
    doc.setFillColor(60, 60, 60);
    for (let i = 0; i < 3; i++) {
      doc.rect(x + (i * gap), y, barWidth, barHeight, 'F');
    }
    // Horizontal thread
    doc.rect(x - 2 * scale, y + barHeight / 2, 12 * scale, 0.8 * scale, 'F');
  };

  // ==========================================
  // COVER PAGE
  // ==========================================
  
  // Draw decorative border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(margin - 5, margin - 5, contentWidth + 10, pageHeight - (margin * 2) + 10);
  
  // Top decorative lines
  const centerX = pageWidth / 2;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(centerX - 30, margin + 20, centerX - 8, margin + 20);
  doc.line(centerX + 8, margin + 20, centerX + 30, margin + 20);
  
  // Small decorative dots
  doc.setFillColor(180, 180, 180);
  doc.circle(centerX - 4, margin + 20, 0.8, 'F');
  doc.circle(centerX, margin + 20, 0.8, 'F');
  doc.circle(centerX + 4, margin + 20, 0.8, 'F');
  
  // "A Complete Guide" subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('A COMPLETE GUIDE', centerX, margin + 35, { align: 'center' });
  
  // Main title
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(30, 30, 30);
  const titleLines = doc.splitTextToSize(title, contentWidth - 20);
  doc.text(titleLines, centerX, margin + 55, { align: 'center' });
  
  // Blueprint circle diagram
  const diagramY = margin + 90;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.circle(centerX, diagramY + 25, 30);
  doc.setLineDashPattern([2, 2], 0);
  doc.circle(centerX, diagramY + 25, 25);
  doc.setLineDashPattern([], 0);
  doc.circle(centerX, diagramY + 25, 18);
  
  // Corner marks
  doc.line(centerX - 35, diagramY + 25, centerX - 40, diagramY + 25);
  doc.line(centerX + 35, diagramY + 25, centerX + 40, diagramY + 25);
  doc.line(centerX, diagramY - 10, centerX, diagramY - 15);
  doc.line(centerX, diagramY + 60, centerX, diagramY + 65);
  
  // Topic icon placeholder text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(topic.substring(0, 12).toUpperCase(), centerX, diagramY + 27, { align: 'center' });
  
  // Subtitle
  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text('A Comprehensive Instructional Volume', centerX, diagramY + 75, { align: 'center' });
  
  // Divider line
  doc.setDrawColor(180, 180, 180);
  doc.line(centerX - 15, diagramY + 85, centerX + 15, diagramY + 85);
  
  // Loom & Page branding at bottom
  drawLoomLogo(centerX - 6, pageHeight - margin - 25, 1);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('LOOM & PAGE', centerX, pageHeight - margin - 10, { align: 'center' });

  // ==========================================
  // TABLE OF CONTENTS PAGE
  // ==========================================
  doc.addPage();
  yPosition = margin;
  
  // Header
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(30, 30, 30);
  doc.text('Table of Contents', centerX, yPosition + 10, { align: 'center' });
  
  yPosition += 30;
  
  // Decorative line
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 15;
  
  // Chapter list
  const chapters = bookData.tableOfContents || [];
  doc.setFont('helvetica', 'normal');
  
  chapters.forEach((chapter, index) => {
    checkNewPage(12);
    
    // Chapter number
    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text(String(chapter.chapter).padStart(2, '0'), margin, yPosition);
    
    // Chapter title
    doc.setTextColor(50, 50, 50);
    doc.text(chapter.title, margin + 15, yPosition);
    
    // Dotted line
    const titleWidth = doc.getTextWidth(chapter.title);
    doc.setDrawColor(200, 200, 200);
    doc.setLineDashPattern([1, 2], 0);
    doc.line(margin + 18 + titleWidth, yPosition - 1, pageWidth - margin - 10, yPosition - 1);
    doc.setLineDashPattern([], 0);
    
    // Lock/check indicator
    if (index === 0) {
      doc.setTextColor(100, 150, 100);
      doc.text('✓', pageWidth - margin - 5, yPosition);
    } else {
      doc.setTextColor(180, 180, 180);
      doc.text('○', pageWidth - margin - 5, yPosition);
    }
    
    yPosition += 12;
  });

  // ==========================================
  // CHAPTER 1 CONTENT PAGE
  // ==========================================
  doc.addPage();
  yPosition = margin;
  
  // Chapter header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('CHAPTER ONE', centerX, yPosition, { align: 'center' });
  
  yPosition += 10;
  
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  doc.text(`Introduction to ${topic}`, centerX, yPosition, { align: 'center' });
  
  yPosition += 15;
  
  // Decorative divider
  doc.setDrawColor(200, 200, 200);
  doc.line(centerX - 20, yPosition, centerX - 5, yPosition);
  doc.circle(centerX, yPosition, 1.5);
  doc.line(centerX + 5, yPosition, centerX + 20, yPosition);
  
  yPosition += 15;
  
  // Chapter content
  if (bookData.chapter1Content) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    
    const paragraphs = bookData.chapter1Content.split('\n\n').filter(p => p.trim());
    
    paragraphs.forEach((para) => {
      const trimmed = para.trim();
      
      // Skip markdown headers for cleaner PDF
      if (trimmed.startsWith('#')) {
        checkNewPage(15);
        const headerText = trimmed.replace(/^#+\s*/, '');
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(40, 40, 40);
        yPosition += 5;
        doc.text(headerText, margin, yPosition);
        yPosition += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        return;
      }
      
      // Skip warning emoji lines
      if (trimmed.startsWith('⚠️')) {
        checkNewPage(20);
        doc.setFillColor(255, 250, 240);
        doc.rect(margin, yPosition - 3, contentWidth, 15, 'F');
        doc.setTextColor(180, 120, 50);
        const warnText = trimmed.replace('⚠️ ', '');
        const warnLines = doc.splitTextToSize(warnText, contentWidth - 10);
        doc.text(warnLines, margin + 5, yPosition + 5);
        yPosition += 20;
        doc.setTextColor(60, 60, 60);
        return;
      }
      
      // Regular paragraph
      const cleanText = trimmed.replace(/^[-*]\s*/gm, '• ');
      const lines = doc.splitTextToSize(cleanText, contentWidth);
      
      lines.forEach((line: string) => {
        checkNewPage(8);
        doc.text(line, margin, yPosition);
        yPosition += 6;
      });
      
      yPosition += 4;
    });
  }

  // ==========================================
  // TECHNICAL DIAGRAM PAGE
  // ==========================================
  doc.addPage();
  yPosition = margin;
  
  // Plate header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('TECHNICAL PLATE 1.1', margin, yPosition);
  doc.text('INSTRUCTIONAL DIAGRAM', pageWidth - margin, yPosition, { align: 'right' });
  
  yPosition += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  
  yPosition += 20;
  
  // Blueprint diagram
  const diagramCenterY = yPosition + 50;
  
  // Grid background
  doc.setDrawColor(240, 240, 240);
  doc.setLineWidth(0.1);
  for (let x = margin; x <= pageWidth - margin; x += 10) {
    doc.line(x, yPosition, x, yPosition + 100);
  }
  for (let y = yPosition; y <= yPosition + 100; y += 10) {
    doc.line(margin, y, pageWidth - margin, y);
  }
  
  // Central icon circle
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.circle(centerX, diagramCenterY, 35);
  doc.setLineDashPattern([2, 2], 0);
  doc.circle(centerX, diagramCenterY, 28);
  doc.setLineDashPattern([], 0);
  
  // Measurement lines
  doc.line(centerX, diagramCenterY - 40, centerX, diagramCenterY - 50);
  doc.line(centerX, diagramCenterY + 40, centerX, diagramCenterY + 50);
  doc.line(centerX - 40, diagramCenterY, centerX - 50, diagramCenterY);
  doc.line(centerX + 40, diagramCenterY, centerX + 50, diagramCenterY);
  
  // Topic text in center
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(150, 150, 150);
  doc.text(topic.substring(0, 15).toUpperCase(), centerX, diagramCenterY + 3, { align: 'center' });
  
  yPosition += 110;
  
  // Caption
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;
  doc.setFont('times', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Plate 1.1 — Core concepts of ${topic} visualized`, centerX, yPosition, { align: 'center' });

  // ==========================================
  // LOCAL RESOURCES PAGE
  // ==========================================
  if (bookData.localResources && bookData.localResources.length > 0) {
    doc.addPage();
    yPosition = margin;
    
    // Header
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 120, 80);
    doc.text('LOCAL GROUNDING', margin, yPosition);
    
    yPosition += 10;
    
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text(`Local Resources for ${topic}`, margin, yPosition);
    
    yPosition += 8;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Connect with these trusted local providers to enhance your learning journey.', margin, yPosition);
    
    yPosition += 15;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;
    
    // Resource cards
    bookData.localResources.forEach((resource, index) => {
      checkNewPage(35);
      
      // Card background
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(230, 230, 230);
      doc.roundedRect(margin, yPosition, contentWidth, 28, 2, 2, 'FD');
      
      // Type label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(resource.type.toUpperCase(), margin + 5, yPosition + 6);
      
      // Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(resource.name, margin + 5, yPosition + 14);
      
      // Rating
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(180, 140, 60);
      doc.text('★ 4.' + (7 + index), margin + 5, yPosition + 22);
      
      // Address placeholder
      doc.setTextColor(120, 120, 120);
      doc.text(`${123 + index * 111} Main Street, Your City`, margin + 30, yPosition + 22);
      
      yPosition += 35;
    });
    
    // Google attribution
    yPosition += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Powered by Google', pageWidth - margin, yPosition, { align: 'right' });
  }

  // ==========================================
  // FOOTER ON ALL PAGES
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Loom logo small
    drawLoomLogo(margin, pageHeight - 12, 0.6);
    
    // Page number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    
    // Disclaimer on first page
    if (i === 1) {
      doc.setFontSize(6);
      doc.setTextColor(180, 180, 180);
      doc.text('AI-generated content for creative inspiration only. Not professional advice.', centerX, pageHeight - 5, { align: 'center' });
    }
  }

  // Save the PDF
  const filename = `${topic.toLowerCase().replace(/\s+/g, '-')}-guide.pdf`;
  doc.save(filename);
};
