import { BookData } from './bookTypes';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { supabase } from '@/integrations/supabase/client';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Key icon as a data URL (PNG) - html2canvas has issues rendering inline SVGs
// This is a 16x16 black key icon matching the Lucide design
const KEY_ICON_DATA_URL = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="7.5" cy="15.5" r="5.5"/>
  <path d="m21 2-9.6 9.6"/>
  <path d="m15.5 7.5 3 3L22 7l-3-3"/>
</svg>
`);

// Helper: Markdown to HTML parser that matches your Preview styling 1:1
const parseMarkdownToHtml = (text: string) => {
  if (!text) return '';
  
  let html = text
    // Header 3 - wrap in div for orphan control
    .replace(/^### (.*$)/gim, '<div class="header-block break-inside-avoid"><h3 class="chapter-h3">$1</h3></div>')
    // Header 2 - wrap in div for orphan control
    .replace(/^## (.*$)/gim, '<div class="header-block break-inside-avoid"><h2 class="chapter-h2">$1</h2></div>')
    // Header 1 - wrap in div for orphan control
    .replace(/^# (.*$)/gim, '<div class="header-block break-inside-avoid"><h1 class="chapter-h2">$1</h1></div>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Images - use data URLs that were preprocessed
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (match, alt, url) => {
      return `<div class="image-container break-inside-avoid"><img src="${url}" alt="${alt}" /></div>`;
    })
    // Bullet Points
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul class="bullet-list"><li>$1</li></ul>');

  // Fix adjacent lists (merge <ul> tags)
  html = html.replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips (The Onyx Box) - use IMG tag for key icon instead of inline SVG
  html = html.replace(/^> (.*$)/gim, (match, content) => {
    const cleanContent = content.replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div class="pro-tip-box break-inside-avoid">
        <div class="pro-tip-flex">
          <img src="${KEY_ICON_DATA_URL}" alt="Key" class="pro-tip-icon" />
          <div>
            <p class="pro-tip-label">PRO TIP</p>
            <p class="pro-tip-content">${cleanContent}</p>
          </div>
        </div>
      </div>
    `;
  });

  // Paragraphs (wrap remaining text)
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim() === '') return '<div class="spacer"></div>';
    if (line.startsWith('<')) return line; // Already HTML
    return `<p class="body-text">${line}</p>`;
  });

  return processedLines.join('\n');
};

// Robust Image Converter (Fixes CORS/Taint issues that cause blank images in html2canvas)
const convertImageToDataUrl = async (url: string): Promise<string> => {
  if (!url) return TRANSPARENT_PIXEL;
  if (url.startsWith('data:')) return url;

  console.log('[PDF] Converting image:', url.substring(0, 80) + '...');

  // Try direct fetch first
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const result = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(TRANSPARENT_PIXEL);
        reader.readAsDataURL(blob);
      });
      if (result !== TRANSPARENT_PIXEL) {
        console.log('[PDF] Direct fetch succeeded for:', url.substring(0, 50));
        return result;
      }
    }
  } catch (e) {
    console.warn('[PDF] Direct fetch failed, trying proxy...', e);
  }

  // Fallback to edge function proxy
  try {
    console.log('[PDF] Invoking fetch-image-data-url edge function...');
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });
    if (error) {
      console.error('[PDF] Edge function error:', error);
    } else if (data?.dataUrl) {
      console.log('[PDF] Edge function succeeded, got', data.bytes, 'bytes');
      return data.dataUrl as string;
    }
  } catch (e) {
    console.error('[PDF] Edge function invoke failed:', e);
  }

  console.warn('[PDF] All image fetch methods failed for:', url.substring(0, 50));
  return TRANSPARENT_PIXEL;
};

const extractMarkdownImageUrls = (markdown: string): string[] => {
  const urls: string[] = [];
  if (!markdown) return urls;
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    if (m[1]) urls.push(m[1].trim());
  }
  return urls;
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  isKdpManuscript = false,
  returnBlob = false,
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  console.log('[PDF] Starting manuscript generation...');
  
  // Clean up any previous (stuck) container
  const existing = document.getElementById('pdf-generation-container');
  if (existing?.parentElement) existing.parentElement.removeChild(existing);

  // Create the container - fixed position at viewport origin for reliable capture
  const container = document.createElement('div');
  container.id = 'pdf-generation-container';
  container.style.width = '6in'; 
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '99999';
  container.style.background = 'white';
  container.style.color = 'black';
  container.style.visibility = 'visible';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  
  // Inject Comprehensive CSS with KDP 6x9 specs
  const styleBlock = document.createElement('style');
  styleBlock.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap');
    
    #pdf-generation-container {
      font-family: 'Playfair Display', Georgia, serif;
      box-sizing: border-box;
    }
    
    #pdf-generation-container * {
      box-sizing: border-box;
    }
    
    /* Page wrapper - each major section gets proper KDP margins */
    .pdf-page {
      /* KDP 6x9: 0.75in top, 0.5in outside, 0.75in bottom, 0.75in gutter (inside) */
      padding: 0.75in 0.5in 0.75in 0.75in;
      min-height: 9in;
      box-sizing: border-box;
    }
    
    /* Page breaks */
    .break-after-always { page-break-after: always; break-after: page; }
    .break-before-always { page-break-before: always; break-before: page; }
    .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
    
    /* Header blocks should not be orphaned at page bottom */
    .header-block {
      break-after: avoid;
      page-break-after: avoid;
    }
    
    /* Typography */
    .text-center { text-align: center; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .font-bold { font-weight: 700; }
    
    /* Title Page - centered vertically */
    .title-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 7.5in; /* 9in - 1.5in total vertical padding */
      text-align: center;
      padding: 0.75in 0.5in;
    }
    .main-title {
      font-size: 28pt;
      font-weight: 700;
      margin-bottom: 1rem;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .subtitle {
      font-size: 14pt;
      font-style: italic;
      color: #555;
      margin-bottom: 2rem;
    }
    .branding {
      font-size: 10pt;
      letter-spacing: 0.2em;
      color: #999;
      margin-top: auto;
    }

    /* Copyright Page - content at bottom */
    .copyright-page {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 7.5in;
      padding: 0.75in 0.5in;
      text-align: left;
      font-size: 9pt;
      color: #666;
      line-height: 1.8;
    }

    /* Table of Contents */
    .toc-page {
      padding: 0.75in 0.5in;
    }
    .toc-title {
      font-size: 18pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 2rem;
    }
    .toc-item {
      margin-bottom: 10px;
      font-size: 11pt;
      line-height: 1.5;
    }

    /* Chapter pages */
    .chapter-page {
      padding: 0.75in 0.5in 0.75in 0.75in;
    }
    .chapter-header {
      text-align: center;
      margin-bottom: 2rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .chapter-label {
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #888;
      margin-bottom: 0.5rem;
    }
    .chapter-title {
      font-size: 22pt;
      font-weight: 700;
      margin-bottom: 1rem;
      line-height: 1.2;
    }
    .divider {
      width: 50px;
      height: 2px;
      background-color: #ddd;
      margin: 0 auto 2rem auto;
    }

    /* Body content */
    .body-text {
      font-size: 11pt;
      line-height: 1.7;
      margin-bottom: 0.8rem;
      text-align: justify;
      color: #1a1a1a;
    }
    .chapter-h2 {
      font-size: 15pt;
      font-weight: 700;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
      color: #000;
      break-after: avoid;
      page-break-after: avoid;
    }
    .chapter-h3 {
      font-size: 13pt;
      font-weight: 600;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      color: #333;
      break-after: avoid;
      page-break-after: avoid;
    }
    
    /* Bullet Points */
    .bullet-list {
      list-style-type: disc;
      padding-left: 1.5rem;
      margin-bottom: 0.8rem;
    }
    .bullet-list li {
      font-size: 11pt;
      margin-bottom: 0.25rem;
      line-height: 1.6;
    }

    /* Images */
    .image-container {
      margin: 1.5rem 0;
      display: flex;
      justify-content: center;
    }
    .image-container img {
      max-width: 100%;
      max-height: 4in;
      height: auto;
      border-radius: 4px;
    }

    /* Onyx Pro-Tip Box */
    .pro-tip-box {
      margin: 1.2rem 0;
      padding: 0.8rem 1rem;
      background-color: #ffffff;
      border-left: 4px solid #000000;
    }
    .pro-tip-flex {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
    }
    .pro-tip-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .pro-tip-label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 0.2rem;
      color: #000;
    }
    .pro-tip-content {
      font-size: 10pt;
      font-style: italic;
      color: #444;
      line-height: 1.5;
    }
    
    .spacer { height: 0.6rem; }
  `;
  container.appendChild(styleBlock);
  document.body.appendChild(container);

  // Build Content
  let htmlContent = '';

  // Title Page
  htmlContent += `
    <div class="title-page break-after-always">
      <div>
        <h1 class="main-title">${bookData.displayTitle || topic}</h1>
        ${bookData.subtitle ? `<p class="subtitle">${bookData.subtitle}</p>` : ''}
      </div>
      <div>
        <p class="branding">LOOM & PAGE</p>
      </div>
    </div>
  `;

  // Copyright Page
  htmlContent += `
    <div class="copyright-page break-after-always">
      <div>
        <p>Copyright © ${new Date().getFullYear()}</p>
        <p>All rights reserved.</p>
        <p style="margin-top: 0.5rem;">Published by Loom & Page</p>
        <p>www.LoomandPage.com</p>
        <p style="margin-top: 0.8rem; font-size: 8pt; line-height: 1.6;">
          No part of this publication may be reproduced, distributed, or transmitted 
          in any form or by any means without the prior written permission of the publisher.
        </p>
        <p style="margin-top: 0.8rem;">Book generated by Loom & Page AI Engine.</p>
        <p>First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  `;

  // TOC
  htmlContent += `
    <div class="toc-page break-after-always">
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

  // Preprocess ALL markdown images into embedded data URLs
  console.log('[PDF] Preprocessing chapter images...');
  const allMarkdown = chapters
    .map((ch: any) => (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '')
    .join('\n');
  const uniqueUrls = Array.from(new Set(extractMarkdownImageUrls(allMarkdown)));
  console.log('[PDF] Found', uniqueUrls.length, 'unique image URLs to convert');
  
  const urlToDataUrl = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (u) => {
      const dataUrl = await convertImageToDataUrl(u);
      urlToDataUrl.set(u, dataUrl);
    })
  );

  chapters.forEach((ch, index) => {
    const contentKey = `chapter${ch.chapter}Content` as keyof BookData;
    const rawContentOriginal = (bookData[contentKey] as string) || "";
    // Replace image URLs with data URLs
    const rawContent = rawContentOriginal.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const mapped = urlToDataUrl.get(String(url).trim());
      return `![${alt}](${mapped || url})`;
    });
    const isLastChapter = index === chapters.length - 1;
    
    htmlContent += `
      <div class="chapter-page ${isLastChapter ? '' : 'break-after-always'}">
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

  const contentWrapper = document.createElement('div');
  contentWrapper.innerHTML = htmlContent;
  container.appendChild(contentWrapper);

  // Wait for images to load
  const images = Array.from(container.querySelectorAll('img'));
  console.log('[PDF] Waiting for', images.length, 'images to load...');
  if (images.length > 0) {
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => { 
        img.onload = resolve; 
        img.onerror = () => {
          console.warn('[PDF] Image failed to load:', img.src.substring(0, 50));
          resolve(undefined);
        };
      });
    }));
  }

  // Wait for fonts and layout
  await new Promise(resolve => setTimeout(resolve, 800));

  // Measure container
  const captureWidthPx = Math.max(1, Math.ceil(container.scrollWidth));
  const captureHeightPx = Math.max(1, Math.ceil(container.scrollHeight));
  console.log('[PDF] Container size:', captureWidthPx, 'x', captureHeightPx, 'px');

  // Configure html2pdf
  const opt = {
    margin: [0, 0, 0, 0] as [number, number, number, number],
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.95 },
    html2canvas: { 
      scale: 2, 
      useCORS: true, 
      allowTaint: false,
      letterRendering: true,
      scrollX: 0,
      scrollY: 0,
      width: captureWidthPx,
      height: captureHeightPx,
      windowWidth: captureWidthPx,
      windowHeight: captureHeightPx,
      backgroundColor: '#ffffff',
      logging: false
    },
    jsPDF: { 
      unit: 'in', 
      format: [6, 9] as [number, number], 
      orientation: 'portrait' as const
    },
    pagebreak: { 
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['.pro-tip-box', '.image-container', '.chapter-header', '.header-block', '.break-inside-avoid'] 
    }
  };

  try {
    console.log('[PDF] Generating PDF...');
    if (returnBlob) {
      const pdf = await html2pdf().set(opt).from(container).outputPdf('blob');
      document.body.removeChild(container);
      console.log('[PDF] PDF blob generated successfully');
      return pdf;
    } else {
      await html2pdf().set(opt).from(container).save();
      document.body.removeChild(container);
      console.log('[PDF] PDF saved successfully');
    }
  } catch (err) {
    console.error('[PDF] Generation failed:', err);
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};
