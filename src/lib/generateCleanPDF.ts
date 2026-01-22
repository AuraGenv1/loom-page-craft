import { BookData } from './bookTypes';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

// 1. ASSETS: Inline SVG for the Key Icon
const KEY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;

// 2. HTML PARSER
const parseMarkdownToHtml = (text: string) => {
  if (!text) return '';
  
  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>')
    // Formatting
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Images (Standard tag for now to test layout stability)
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (_match, alt, url) => {
      return `<div class="img-wrapper"><img src="${url}" alt="${alt}" crossorigin="anonymous" /></div>`;
    })
    // Lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul class="bullet-list"><li>$1</li></ul>')
    .replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips
  html = html.replace(/^> (.*$)/gim, (_match, content) => {
    const cleanContent = String(content).replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div class="pro-tip-box">
        <div>${KEY_ICON_SVG}</div>
        <div>
          <span class="pro-tip-label">PRO TIP</span>
          <p class="pro-tip-body">${cleanContent}</p>
        </div>
      </div>
    `;
  });

  // Paragraphs
  return html.split('\n').map(line => {
    if (line.trim() === '') return '<div class="spacer"></div>';
    if (line.startsWith('<')) return line;
    return `<p>${line}</p>`;
  }).join('\n');
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  returnBlob = false,
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // Cleanup
  const existing = document.getElementById('pdf-generator');
  if (existing) existing.remove();

  // 1. CONTAINER SETUP
  const container = document.createElement('div');
  container.id = 'pdf-generator';
  // Absolute position ensures the container can grow to 10,000px+ height without being clipped by the viewport
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '816px'; // 8.5in width standard
  container.style.zIndex = '99999'; // Visible on top
  container.style.background = 'white';
  
  // 2. CSS STYLING (High-Res Print Settings)
  const style = document.createElement('style');
  style.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
    
    #pdf-generator {
      font-family: 'Playfair Display', serif;
      color: #000;
      line-height: 1.6;
      font-size: 14px; /* Base font size */
    }
    
    /* Page Container */
    .pdf-page {
      width: 100%;
      min-height: 1056px; /* 11in height */
      padding: 60px 80px; /* Safe Margins */
      box-sizing: border-box;
      page-break-after: always;
      position: relative;
    }

    /* Chapter Spacing - Fixes "Hugging Top" */
    .chapter-start {
      padding-top: 60px; 
    }
    
    /* Typography */
    h1 { font-size: 28pt; font-weight: 700; margin-bottom: 30px; text-align: center; }
    h2 { font-size: 20pt; font-weight: 700; margin-top: 40px; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    h3 { font-size: 16pt; font-weight: 700; margin-top: 30px; margin-bottom: 15px; }
    p { font-size: 12pt; margin-bottom: 15px; text-align: justify; }
    
    /* Components */
    .img-wrapper { text-align: center; margin: 30px 0; }
    .img-wrapper img { max-width: 100%; height: auto; border: 1px solid #eee; }
    
    .pro-tip-box {
      background: #fff;
      border-left: 5px solid #000;
      padding: 20px;
      margin: 30px 0;
      display: flex;
      gap: 15px;
      page-break-inside: avoid;
    }
    .pro-tip-label { font-size: 10pt; font-weight: 700; letter-spacing: 2px; display: block; margin-bottom: 5px; text-transform: uppercase; }
    .pro-tip-body { font-style: italic; font-size: 11pt; color: #444; }
    
    .bullet-list { padding-left: 30px; list-style: disc; margin-bottom: 20px; }
    .spacer { height: 15px; }
    
    .title-page { text-align: center; display: flex; flex-direction: column; justify-content: center; height: 900px; }
    .copyright-page { display: flex; flex-direction: column; justify-content: flex-end; height: 900px; }
  `;
  container.appendChild(style);
  document.body.appendChild(container);

  // 3. BUILD CONTENT
  let html = '';

  // Title Page
  html += `
    <div class="pdf-page title-page">
      <h1>${bookData.displayTitle || topic}</h1>
      ${bookData.subtitle ? `<p style="font-size: 16pt; font-style: italic; color: #555;">${bookData.subtitle}</p>` : ''}
      <p style="margin-top: auto; font-size: 10pt; letter-spacing: 3px; color: #888;">LOOM & PAGE</p>
    </div>
  `;

  // Copyright
  html += `
    <div class="pdf-page copyright-page">
      <p style="font-size: 10pt; color: #666;">Copyright © ${new Date().getFullYear()}</p>
      <p style="font-size: 10pt; color: #666;">All rights reserved.</p>
      <p style="font-size: 10pt; color: #666;">Generated by Loom & Page</p>
    </div>
  `;

  // TOC
  html += `
    <div class="pdf-page">
      <h1>Table of Contents</h1>
      ${(bookData.tableOfContents || []).map((ch: { chapter: number; title: string }) => `
        <p style="margin-bottom: 10px;">
          <strong>Chapter ${ch.chapter}</strong> — ${ch.title}
        </p>
      `).join('')}
    </div>
  `;

  // Chapters
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters: Array<{ chapter: number; title: string }> = 
    (bookData.tableOfContents as Array<{ chapter: number; title: string }>) || 
    chapterKeys.map((_, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  chapters.forEach((ch) => {
    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    html += `
      <div class="pdf-page chapter-start">
        <p style="font-size: 10pt; text-transform: uppercase; letter-spacing: 3px; color: #888; text-align: center;">Chapter ${ch.chapter}</p>
        <h1>${ch.title}</h1>
        ${parseMarkdownToHtml(rawContent)}
      </div>
    `;
  });

  container.innerHTML += html;

  // 4. GENERATE PDF (High Quality Settings)
  // Wait a moment for rendering
  await new Promise(resolve => setTimeout(resolve, 1000));

  const opt = {
    margin: 0, // We handle margins via CSS padding
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 4, // 4x Scale = 300 DPI (High Quality)
      useCORS: true, 
      letterRendering: true,
      scrollY: 0,
    },
    jsPDF: { unit: 'in', format: 'letter' as const, orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] } // Simplified page breaking
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
    if (document.body.contains(container)) document.body.removeChild(container);
  }
};
