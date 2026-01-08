import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { BookData } from "@/lib/bookTypes";

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}

interface FullFidelityPDFOptions {
  title: string;
  displayTitle: string;
  subtitle?: string;
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
  diagramImages?: Record<string, string>;
  tableOfContents?: Array<{ chapter: number; title: string; imageDescription?: string }>;
}

/**
 * Ensures all images are fully loaded before capturing.
 */
const waitForImages = async (container: HTMLElement): Promise<void> => {
  const images = Array.from(container.querySelectorAll("img"));
  const promises = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });
  await Promise.all(promises);
};

/**
 * Clean markdown content for PDF rendering
 */
const cleanMarkdownForPDF = (content: string): string => {
  return content
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\[DIAGRAM:[^\]]+\]/gi, '')
    .trim();
};

/**
 * Convert markdown to simple HTML for PDF
 */
const markdownToHTML = (markdown: string): string => {
  const cleaned = cleanMarkdownForPDF(markdown);
  return cleaned
    .replace(/^### (.+)$/gm, '<h3 class="print-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="print-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h2 class="print-h2">$1</h2>')
    .replace(/^> (.+)$/gm, '<blockquote class="print-quote">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="print-list">$&</ul>')
    .replace(/\n\n/g, '</p><p class="print-para">')
    .replace(/^(?!<[hupbl])/gm, '<p class="print-para">')
    .replace(/(?<![>])$/gm, '</p>')
    .replace(/<p class="print-para"><\/p>/g, '');
};

/**
 * FULL-FIDELITY PDF GENERATOR
 * Creates a high-resolution PDF using html2canvas with Print to PDF approach
 */
export const generateFullFidelityPDF = async ({
  title,
  displayTitle,
  subtitle,
  topic,
  bookData,
  coverImageUrl,
  diagramImages = {},
  tableOfContents = [],
}: FullFidelityPDFOptions): Promise<void> => {
  // Create hidden print-ready DOM container
  const container = document.createElement('div');
  container.id = 'pdf-print-container';
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 210mm;
    background: white;
    font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
    color: #1a1a1a;
    line-height: 1.6;
  `;

  // Shared styles for Artisan theme
  const artisanStyles = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .page { width: 210mm; min-height: 297mm; padding: 25mm; background: white; position: relative; }
      .page-break { page-break-after: always; }
      
      /* Cover Page */
      .cover-page { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 297mm; padding: 30mm; }
      .cover-image { width: 180px; height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 30px; border: 2px solid #e5e5e5; }
      .cover-category { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4em; color: #888; margin-bottom: 12px; }
      .cover-title { font-size: 36px; font-weight: 600; color: #1a1a1a; margin-bottom: 16px; line-height: 1.2; }
      .cover-subtitle { font-size: 14px; font-style: italic; color: #666; margin-bottom: 40px; }
      .cover-divider { width: 60px; height: 1px; background: #ddd; margin: 0 auto 40px; }
      .cover-brand { font-size: 11px; letter-spacing: 0.3em; color: #999; margin-top: auto; }
      .cover-disclaimer { font-size: 8px; color: #aaa; font-style: italic; margin-top: 16px; max-width: 200px; }
      
      /* TOC Page */
      .toc-page { padding: 40mm 30mm; }
      .toc-title { font-size: 24px; text-align: center; margin-bottom: 40px; color: #1a1a1a; }
      .toc-list { list-style: none; padding: 0; }
      .toc-item { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0; border-bottom: 1px dotted #ddd; }
      .toc-chapter { font-weight: 600; color: #333; }
      .toc-dots { flex: 1; margin: 0 12px; border-bottom: 1px dotted #ccc; }
      .toc-page-num { color: #666; font-size: 12px; }
      
      /* Chapter Pages */
      .chapter-page { padding: 25mm; }
      .chapter-number { font-size: 10px; text-transform: uppercase; letter-spacing: 0.3em; color: #888; text-align: center; margin-bottom: 8px; }
      .chapter-title { font-size: 28px; text-align: center; color: #1a1a1a; margin-bottom: 24px; line-height: 1.3; }
      .chapter-divider { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 32px; }
      .chapter-divider-line { width: 48px; height: 1px; background: #ddd; }
      .chapter-divider-dot { width: 6px; height: 6px; border-radius: 50%; border: 1px solid #ccc; }
      
      /* Content Styles */
      .print-h2 { font-size: 18px; font-weight: 600; color: #333; margin: 28px 0 16px; }
      .print-h3 { font-size: 15px; font-weight: 600; color: #444; margin: 22px 0 12px; }
      .print-para { font-size: 11px; text-indent: 1.5em; margin-bottom: 10px; text-align: justify; line-height: 1.7; color: #333; }
      .print-para:first-of-type { text-indent: 0; }
      .print-quote { margin: 20px 24px; padding: 12px 16px; border-left: 3px solid #ddd; font-style: italic; color: #555; font-size: 11px; }
      .print-list { margin: 16px 0; padding-left: 24px; }
      .print-list li { margin-bottom: 8px; font-size: 11px; color: #333; }
      
      /* Diagram */
      .diagram-container { margin: 28px 0; text-align: center; page-break-inside: avoid; }
      .diagram-image { max-width: 100%; height: auto; border: 1px solid #eee; border-radius: 4px; }
      .diagram-caption { font-size: 10px; font-style: italic; color: #666; margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
      
      /* Footer */
      .page-footer { position: absolute; bottom: 15mm; left: 0; right: 0; text-align: center; }
      .footer-logo { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .footer-brand { font-size: 9px; letter-spacing: 0.25em; color: #999; }
    </style>
  `;

  // Build Cover Page
  const hasColon = displayTitle.includes(':');
  const [category, mainTitle] = hasColon 
    ? [displayTitle.split(':')[0].trim(), displayTitle.split(':').slice(1).join(':').trim()]
    : ['', displayTitle];

  let html = artisanStyles + `
    <div class="page cover-page page-break">
      ${coverImageUrl ? `<img src="${coverImageUrl}" class="cover-image" crossorigin="anonymous" />` : ''}
      ${category ? `<p class="cover-category">${category}</p>` : ''}
      <h1 class="cover-title">${mainTitle || displayTitle}</h1>
      ${subtitle ? `<p class="cover-subtitle">${subtitle}</p>` : ''}
      <div class="cover-divider"></div>
      <p class="cover-brand">LOOM & PAGE</p>
      <p class="cover-disclaimer">AI-generated content for creative inspiration only. Not professional advice.</p>
    </div>
  `;

  // Build TOC Page
  html += `
    <div class="page toc-page page-break">
      <h2 class="toc-title">Table of Contents</h2>
      <ol class="toc-list">
        ${tableOfContents.map((ch, i) => `
          <li class="toc-item">
            <span class="toc-chapter">Chapter ${ch.chapter}: ${ch.title}</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">${i + 3}</span>
          </li>
        `).join('')}
      </ol>
    </div>
  `;

  // Build Chapter Pages
  const chapterWords = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  
  for (let i = 1; i <= 10; i++) {
    const chapterKey = `chapter${i}Content` as keyof BookData;
    const content = bookData[chapterKey] as string | undefined;
    const tocEntry = tableOfContents.find(c => c.chapter === i);
    const chapterTitle = tocEntry?.title || `Chapter ${i}`;
    const diagramUrl = diagramImages[`${i}.1`];
    
    if (content) {
      html += `
        <div class="page chapter-page page-break">
          <p class="chapter-number">Chapter ${chapterWords[i - 1] || i}</p>
          <h1 class="chapter-title">${chapterTitle}</h1>
          <div class="chapter-divider">
            <span class="chapter-divider-line"></span>
            <span class="chapter-divider-dot"></span>
            <span class="chapter-divider-line"></span>
          </div>
          
          ${diagramUrl ? `
            <div class="diagram-container">
              <img src="${diagramUrl}" class="diagram-image" crossorigin="anonymous" alt="Chapter ${i} diagram" />
              <p class="diagram-caption">Plate ${i}.1 — ${tocEntry?.imageDescription || `Illustration for ${chapterTitle}`}</p>
            </div>
          ` : ''}
          
          <div class="chapter-content">
            ${markdownToHTML(content)}
          </div>
          
          <div class="page-footer">
            <div class="footer-logo">
              <span class="footer-brand">LOOM & PAGE</span>
            </div>
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
  document.body.appendChild(container);

  // Wait for all images to load
  await waitForImages(container);
  
  // Additional wait for rendering
  await new Promise(resolve => setTimeout(resolve, 500));

  // Capture with html2canvas at high resolution
  const canvas = await html2canvas(container, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    width: container.scrollWidth,
    height: container.scrollHeight,
  });

  // Create PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
  }

  // Cleanup
  document.body.removeChild(container);

  // Save
  const safeTitle = topic.toLowerCase().replace(/\s+/g, '-');
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};

/**
 * Legacy PDF generator for backward compatibility
 */
export const generateGuidePDF = async ({
  title,
  topic,
  bookData,
  previewElement,
  isAdmin = false,
}: GeneratePDFOptions) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  if (!previewElement) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`A Complete Guide to ${topic}`, pageWidth / 2, 55, { align: "center" });
    
    if (bookData.chapter1Content) {
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(cleanMarkdownForPDF(bookData.chapter1Content), pageWidth - 40);
      let y = 80;
      
      for (const line of lines) {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, 20, y);
        y += 5;
      }
    }
    
    const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
    doc.save(`${safeTitle}-artisan-guide.pdf`);
    return;
  }

  await waitForImages(previewElement);

  const canvas = await html2canvas(previewElement, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      const allElements = clonedDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const classList = htmlEl.className || '';
        
        if (typeof classList === 'string' && (
          classList.includes('max-h-') || 
          classList.includes('overflow-hidden') || 
          classList.includes('overflow-y-auto') ||
          classList.includes('overflow-x-auto')
        )) {
          htmlEl.style.maxHeight = 'none';
          htmlEl.style.overflow = 'visible';
        }
      });

      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });
      }
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};

/**
 * Pixel-perfect PDF from a DOM element (used by PrintPreview)
 */
export const generatePixelPerfectPDF = async (
  element: HTMLElement,
  filename: string,
  isAdmin = false
): Promise<void> => {
  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      const allElements = clonedDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const classList = htmlEl.className || '';
        
        if (typeof classList === 'string' && (
          classList.includes('max-h-') || 
          classList.includes('overflow-hidden') || 
          classList.includes('overflow-y-auto') ||
          classList.includes('overflow-x-auto')
        )) {
          htmlEl.style.maxHeight = 'none';
          htmlEl.style.overflow = 'visible';
        }
      });

      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });
      }
    },
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  doc.save(filename);
};
