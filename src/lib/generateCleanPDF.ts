import { BookData } from './bookTypes';
// @ts-ignore
import html2pdf from 'html2pdf.js';

// html2canvas (used internally by html2pdf) can render a *single* giant canvas and then slice it into pages.
// If the canvas height gets too large, browsers can return a blank/white canvas → 1 blank PDF page.
// We defensively cap the effective canvas size by auto-reducing scale for long books.
const MAX_CANVAS_HEIGHT_PX = 30000;

const getSafeCanvasScale = (desiredScale: number, element: HTMLElement) => {
  const h = element.scrollHeight || element.offsetHeight || 1;
  const safe = Math.min(desiredScale, MAX_CANVAS_HEIGHT_PX / h);
  // Avoid NaN/0 which can also yield blank output.
  return Number.isFinite(safe) && safe > 0 ? safe : 1;
};

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

// Helper: Exact Key Icon SVG to match Lucide (Inline SVG)
const getKeyIconHtml = () => {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/>
      <path d="m21 2-9.6 9.6"/>
      <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    </svg>
  `;
};

// Helper: Markdown to HTML parser
const parseMarkdownToHtml = (text: string) => {
  if (!text) return '';
  
  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="chapter-h3 break-inside-avoid">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="chapter-h2 break-inside-avoid">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="chapter-h2 break-inside-avoid">$1</h1>')
    // Formatting
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Images (Simple rendering with crossorigin)
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (match, alt, url) => {
      return `<div class="image-container break-inside-avoid"><img src="${url}" alt="${alt}" crossorigin="anonymous" /></div>`;
    })
    // Bullets
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul class="bullet-list"><li>$1</li></ul>')
    .replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips (The Onyx Box)
  html = html.replace(/^> (.*$)/gim, (match, content) => {
    const cleanContent = content.replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div class="pro-tip-box break-inside-avoid">
        <div class="pro-tip-flex">
          <div class="pro-tip-icon">
            ${getKeyIconHtml()}
          </div>
          <div>
            <p class="pro-tip-label">PRO TIP</p>
            <p class="pro-tip-content">${cleanContent}</p>
          </div>
        </div>
      </div>
    `;
  });

  // Paragraphs
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim() === '') return '<div class="spacer"></div>';
    if (line.startsWith('<')) return line; 
    return `<p class="body-text">${line}</p>`;
  });

  return processedLines.join('\n');
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  isKdpManuscript = false,
  returnBlob = false,
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // Clean up any existing container
  const existing = document.getElementById('pdf-generation-container');
  if (existing?.parentElement) existing.parentElement.removeChild(existing);

  // 1. Create the container
  // FIX: Use 'absolute' (not fixed) so it can grow to full scroll height
  const container = document.createElement('div');
  container.id = 'pdf-generation-container';
  container.style.width = '6in'; 
  container.style.padding = '0.75in'; // Margins
  container.style.position = 'absolute'; 
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '99999'; // On top
  container.style.background = 'white';
  container.style.color = 'black';
  
  // 2. Inject CSS
  const styleBlock = document.createElement('style');
  styleBlock.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap');
    
    #pdf-generation-container {
      font-family: 'Playfair Display', Georgia, serif;
      box-sizing: border-box;
    }
    #pdf-generation-container * { box-sizing: border-box; }
    
    /* Page Break Logic */
    .break-after-always { page-break-after: always; break-after: page; }
    .break-before-always { page-break-before: always; break-before: page; }
    .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
    
    /* Global Styles */
    .text-center { text-align: center; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .font-bold { font-weight: 700; }
    
    /* Title Page */
    .title-page {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 7.5in; text-align: center;
    }
    .main-title { font-size: 28pt; font-weight: 700; margin-bottom: 1rem; line-height: 1.2; text-transform: uppercase; }
    .subtitle { font-size: 14pt; font-style: italic; color: #555; margin-bottom: 2rem; }
    .branding { font-size: 10pt; letter-spacing: 0.2em; color: #999; margin-top: auto; }

    /* Copyright Page */
    .copyright-page {
      display: flex; flex-direction: column; justify-content: flex-end;
      min-height: 7.5in; text-align: left; font-size: 9pt; color: #666; line-height: 1.8;
    }

    /* TOC */
    .toc-title { font-size: 18pt; font-weight: 700; text-align: center; margin-bottom: 2rem; }
    .toc-item { margin-bottom: 10px; font-size: 11pt; }

    /* Chapter Header */
    .chapter-header { text-align: center; margin-bottom: 2rem; break-inside: avoid; }
    .chapter-label { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.2em; color: #888; margin-bottom: 0.5rem; }
    .chapter-title { font-size: 22pt; font-weight: 700; margin-bottom: 1rem; line-height: 1.2; }
    .divider { width: 50px; height: 2px; background-color: #ddd; margin: 0 auto 2rem auto; }

    /* Content */
    .body-text { font-size: 11.5pt; line-height: 1.6; margin-bottom: 0.8rem; text-align: justify; color: #1a1a1a; }
    .chapter-h2 { font-size: 15pt; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #000; break-after: avoid; page-break-after: avoid; }
    .chapter-h3 { font-size: 13pt; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; color: #333; break-after: avoid; page-break-after: avoid; }
    
    /* Bullets */
    .bullet-list { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 0.8rem; }
    .bullet-list li { font-size: 11pt; margin-bottom: 0.25rem; line-height: 1.6; }

    /* Images */
    .image-container { margin: 1.5rem 0; display: flex; justify-content: center; }
    .image-container img { max-width: 100%; max-height: 4in; height: auto; border-radius: 4px; }

    /* Onyx Pro-Tip */
    .pro-tip-box { margin: 1.2rem 0; padding: 0.8rem 1rem; background-color: #ffffff; border-left: 4px solid #000000; }
    .pro-tip-flex { display: flex; gap: 0.6rem; align-items: flex-start; }
    .pro-tip-icon { width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; }
    .pro-tip-icon svg { width: 16px; height: 16px; }
    .pro-tip-label { font-size: 8pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.2rem; color: #000; }
    .pro-tip-content { font-size: 10pt; font-style: italic; color: #444; line-height: 1.5; }
    .spacer { height: 0.6rem; }
  `;
  container.appendChild(styleBlock);
  document.body.appendChild(container);

  // 3. Build HTML Structure
  let htmlContent = '';

  // Title Page
  htmlContent += `
    <div class="title-page break-after-always">
      <div>
        <h1 class="main-title">${bookData.displayTitle || topic}</h1>
        ${bookData.subtitle ? `<p class="subtitle">${bookData.subtitle}</p>` : ''}
      </div>
      <p class="branding">LOOM & PAGE</p>
    </div>
  `;

  // Copyright Page
  htmlContent += `
    <div class="copyright-page break-after-always">
      <div>
        <p>Copyright © ${new Date().getFullYear()} ${bookData.displayTitle || topic}</p>
        <p>All rights reserved.</p>
        <p style="margin-top: 0.5rem;">Published by Loom & Page</p>
        <p>www.LoomandPage.com</p>
        <p style="margin-top: 0.8rem; font-size: 8pt; line-height: 1.6;">
          No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without prior written permission.
        </p>
        <p style="margin-top: 0.8rem;">Book generated by Loom & Page AI Engine.</p>
        <p>First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  `;

  // TOC
  htmlContent += `
    <div class="break-after-always">
      <h2 class="toc-title">Table of Contents</h2>
      <div>
        ${(bookData.tableOfContents || []).map(ch => `
          <div class="toc-item">Chapter ${ch.chapter}: ${ch.title}</div>
        `).join('')}
      </div>
    </div>
  `;

  // Chapters
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = bookData.tableOfContents || chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  chapters.forEach((ch, index) => {
    const contentKey = `chapter${ch.chapter}Content` as keyof BookData;
    const rawContent = (bookData[contentKey] as string) || "";
    const isLastChapter = index === chapters.length - 1;
    
    htmlContent += `
      <div class="${isLastChapter ? '' : 'break-after-always'}">
        <div class="chapter-header">
          <p class="chapter-label">Chapter ${ch.chapter}</p>
          <h2 class="chapter-title">${ch.title}</h2>
          <div class="divider"></div>
        </div>
        <div class="chapter-content">
          ${parseMarkdownToHtml(rawContent)}
        </div>
      </div>
    `;
  });

  // Use innerHTML to set content (appendChild would require DOM nodes)
  const contentWrapper = document.createElement('div');
  contentWrapper.innerHTML = htmlContent;
  container.appendChild(contentWrapper);

  // 4. Wait for Images & Layout
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length > 0) {
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => { 
        img.onload = resolve; 
        img.onerror = resolve; // Continue even if image fails
      });
    }));
  }
  
  // Give layout time to reflow after images load
  await new Promise(resolve => setTimeout(resolve, 800));

  // 4.5 Compute a safe scale to avoid the "single giant canvas" blank-page failure mode
  const desiredScale = 2;
  const safeScale = getSafeCanvasScale(desiredScale, container);
  if (safeScale !== desiredScale) {
    console.info('[generateCleanPDF] Reducing html2canvas scale to avoid blank PDF', {
      desiredScale,
      safeScale,
      scrollHeight: container.scrollHeight,
    });
  }

  // 5. Generate PDF
  const opt = {
    margin: [0.75, 0.6, 0.75, 0.6] as [number, number, number, number],
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: safeScale,
      useCORS: true, 
      allowTaint: false,
      letterRendering: true,
      backgroundColor: '#ffffff',
      scrollY: 0,
      windowWidth: 800, // Consistent width
      windowHeight: container.scrollHeight,
      imageTimeout: 20000,
      logging: false
    },
    jsPDF: { 
      unit: 'in', 
      format: [6, 9] as [number, number], 
      orientation: 'portrait' as const
    },
    pagebreak: { 
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['.pro-tip-box', '.image-container', '.chapter-header', '.break-inside-avoid'] 
    }
  };

  try {
    if (returnBlob) {
      const pdf = await html2pdf().set(opt).from(container).outputPdf('blob');
      document.body.removeChild(container);
      return pdf;
    } else {
      await html2pdf().set(opt).from(container).save();
      document.body.removeChild(container);
    }
  } catch (err) {
    console.error("PDF Generation Failed:", err);
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};
