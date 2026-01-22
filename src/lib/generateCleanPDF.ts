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

// 1. ASSETS
const KEY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Avoid inserting explicit “page-break-after” divider elements.
// With html2pdf/html2canvas these commonly create phantom/blank pages.

// 2. ROBUST IMAGE LOADER
const convertImageToDataUrl = async (url: string): Promise<string> => {
  if (!url) return TRANSPARENT_PIXEL;
  
  try {
    const response = await fetch(url, { cache: 'no-cache', mode: 'cors' });
    if (response.ok) {
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      // Prevent HTML error pages from being embedded as “images” (this can break layout + add blank pages)
      if (!contentType.startsWith('image/')) {
        throw new Error(`Non-image response: ${contentType || 'unknown content-type'}`);
      }
      const blob = await response.blob();
      if (!blob.type.toLowerCase().startsWith('image/')) {
        throw new Error(`Non-image blob: ${blob.type || 'unknown blob type'}`);
      }
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(TRANSPARENT_PIXEL);
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.warn('Direct image fetch failed, attempting proxy:', url);
  }

  try {
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });
    if (!error && data?.dataUrl) return data.dataUrl;
  } catch (e) {
    console.warn('Proxy image fetch failed:', e);
  }

  return TRANSPARENT_PIXEL;
};

const extractImageUrls = (markdown: string) => {
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
};

// 3. MARKDOWN PARSER
// Fix: remove stray "#" artifacts by supporting headers with OR without space:
// "##Title" and "## Title" both become proper headings.
const parseMarkdownToHtml = (text: string) => {
  if (!text) return '';
  
  // Process line by line to properly handle headers
  const lines = text.split('\n');
  const processedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Skip empty lines - add spacer
    if (line.trim() === '') {
      processedLines.push('<div style="height: 12px;"></div>');
      continue;
    }
    
    // Headers (support optional whitespace after hashes)
    const headerMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      if (title) {
        if (level >= 3) {
          processedLines.push(
            `<h3 style="font-family: 'Playfair Display', Georgia, serif; font-size: 13pt; font-weight: 600; margin: 24px 0 12px 0; color: #000; line-height: 1.4;">${title}</h3>`
          );
        } else {
          processedLines.push(
            `<h2 style="font-family: 'Playfair Display', Georgia, serif; font-size: 16pt; font-weight: 700; margin: 32px 0 16px 0; color: #000; line-height: 1.3;">${title}</h2>`
          );
        }
        continue;
      }
    }
    
    // Handle Pro-Tips (blockquotes)
    if (line.startsWith('>')) {
      const content = line.replace(/^>\s*/, '').replace(/^PRO-TIP:?\s*/i, '').trim();
      processedLines.push(`
        <div style="background: #fafafa; border-left: 3px solid #000; padding: 16px 20px; margin: 20px 0; display: flex; gap: 12px; align-items: flex-start;">
          <div style="flex-shrink: 0; margin-top: 2px;">${KEY_ICON_SVG}</div>
          <div>
            <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9pt; font-weight: 700; letter-spacing: 1.5px; display: block; margin-bottom: 6px; text-transform: uppercase; color: #000;">PRO TIP</span>
            <p style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 11pt; color: #333; margin: 0; line-height: 1.5;">${content}</p>
          </div>
        </div>
      `);
      continue;
    }
    
    // Handle bullet lists
    if (line.match(/^\s*[-*]\s+(.*)$/)) {
      const match = line.match(/^\s*[-*]\s+(.*)$/);
      if (match) {
        processedLines.push(`<li style="font-family: 'Playfair Display', Georgia, serif; font-size: 11pt; margin-bottom: 6px; line-height: 1.6; color: #1a1a1a;">${match[1]}</li>`);
        continue;
      }
    }
    
    // Handle images
    if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
      line = line.replace(/!\[(.*?)\]\((.*?)\)/g, (_match, alt, url) => {
        return `<div style="text-align: center; margin: 24px 0;"><img alt="${alt}" data-original-src="${url}" style="max-width: 90%; height: auto; border: 1px solid #e0e0e0; border-radius: 2px;" /></div>`;
      });
      processedLines.push(line);
      continue;
    }
    
    // Apply inline formatting
    line = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Regular paragraph
    processedLines.push(`<p style="font-family: 'Playfair Display', Georgia, serif; font-size: 11pt; margin-bottom: 14px; text-align: justify; line-height: 1.7; color: #1a1a1a;">${line}</p>`);
  }
  
  // Wrap consecutive list items in ul
  let result = processedLines.join('\n');
  result = result.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, (match) => {
    return `<ul style="padding-left: 24px; list-style: disc; margin: 16px 0;">${match}</ul>`;
  });
  
  return result;
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  returnBlob = false,
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // A. PRE-FETCH IMAGES
  console.log('[PDF] Fetching images...');
  const allContent = Object.values(bookData).filter(v => typeof v === 'string').join('\n');
  const urls = extractImageUrls(allContent);
  const imageMap = new Map<string, string>();
  
  await Promise.all(urls.map(async (url) => {
    const b64 = await convertImageToDataUrl(url);
    imageMap.set(url, b64);
  }));

  // B. SETUP EXCLUSIVE CONTAINER
  const appRoot = document.getElementById('root') || document.body.firstElementChild;
  if (appRoot) (appRoot as HTMLElement).style.display = 'none';

  const container = document.createElement('div');
  container.id = 'print-container';
  container.style.cssText = `
    width: 576px;
    margin: 0 auto;
    background: white;
    color: #000;
    font-family: 'Playfair Display', Georgia, serif;
  `;
  
  // Inject Google Font
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);
  
  document.body.appendChild(container);

  // IMPORTANT: per-section padding does NOT apply to overflow pages when html2pdf splits content.
  // To keep text off the very bottom on *every* page (KDP-safe), we use html2pdf margin.

  // C. BUILD CONTENT
  let html = '';

  // ============ TITLE PAGE ============
  html += `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: calc(9in - 0.5in - 0.75in);
      text-align: center;
      box-sizing: border-box;
    ">
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
        <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 26pt; font-weight: 700; margin-bottom: 16px; line-height: 1.2; color: #000;">${bookData.displayTitle || topic}</h1>
        ${bookData.subtitle ? `<p style="font-family: 'Playfair Display', Georgia, serif; font-size: 13pt; font-style: italic; color: #555; margin: 0;">${bookData.subtitle}</p>` : ''}
      </div>
      <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 9pt; letter-spacing: 3px; color: #888; margin-top: auto;">LOOM & PAGE</p>
    </div>
  `;

  // ============ COPYRIGHT PAGE ============
  html += `
    <div style="page-break-before: always;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      height: calc(9in - 0.5in - 0.75in);
      box-sizing: border-box;
    ">
      <div style="margin-bottom: 48px;">
        <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 10pt; color: #555; margin-bottom: 8px;">Copyright © ${new Date().getFullYear()} ${bookData.displayTitle || topic}</p>
        <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 10pt; color: #555; margin-bottom: 8px;">All rights reserved.</p>
        <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 10pt; color: #555; margin-bottom: 16px;">No part of this publication may be reproduced, distributed, or transmitted in any form without prior written permission.</p>
        <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 10pt; color: #555; margin-bottom: 8px;">Published by Loom & Page</p>
        <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 9pt; color: #777; margin-bottom: 8px; font-style: italic;">This book was generated with AI assistance.</p>
        <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 9pt; color: #777;">First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  `;

  // ============ TABLE OF CONTENTS ============
  html += `
    <div style="page-break-before: always; box-sizing: border-box;">
      <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 20pt; font-weight: 700; text-align: center; margin-bottom: 40px; color: #000;">Table of Contents</h1>
      ${((bookData.tableOfContents || []) as Array<{ chapter: number; title: string }>).map(ch => `
        <p style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 14px; font-size: 11pt; color: #1a1a1a; display: flex; justify-content: space-between; border-bottom: 1px dotted #ccc; padding-bottom: 8px;">
          <span><strong>Chapter ${ch.chapter}:</strong> ${ch.title}</span>
        </p>
      `).join('')}
    </div>
  `;

  // ============ CHAPTERS ============
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as Array<{ chapter: number; title: string }>) || chapterKeys.map((_k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  chapters.forEach((ch, index) => {
    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    
    // Process content
    let processedContent = parseMarkdownToHtml(rawContent);
    urls.forEach(url => {
      if (imageMap.has(url)) {
        processedContent = processedContent.replace(`data-original-src="${url}"`, `src="${imageMap.get(url)}"`);
      }
    });
    processedContent = processedContent.replace(/data-original-src=".*?"/g, 'src="" style="display:none"');

    html += `
      <div style="page-break-before: always; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 36px; padding-bottom: 20px; border-bottom: 1px solid #ddd;">
          <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 10pt; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 8px;">Chapter ${ch.chapter}</p>
          <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 20pt; font-weight: 700; margin: 0; color: #000; line-height: 1.3;">${ch.title}</h1>
        </div>
        <div style="font-family: 'Playfair Display', Georgia, serif;">
          ${processedContent}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // D. GENERATE PDF
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1500));

  const opt = {
    // KDP-safe margins applied to EVERY page, including pages produced by chapter overflow.
    // [top, left, bottom, right] in inches
    margin: [0.5, 0.625, 0.75, 0.5] as [number, number, number, number],
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true, 
      letterRendering: true,
      scrollY: 0,
      backgroundColor: '#ffffff',
    },
    jsPDF: { 
      unit: 'in', 
      format: [6, 9] as [number, number], // KDP 6x9 Trade Paperback
      orientation: 'portrait' as const 
    },
    pagebreak: { mode: ['css'] }
  };

  try {
    console.log('[PDF] Starting generation...');

    // Generate PDF first, then stamp accurate page numbers based on final page count.
    const worker = html2pdf().set(opt).from(container).toPdf();
    const pdf = await worker.get('pdf');

    const totalPages: number = pdf.internal.getNumberOfPages();
    const pageW: number = pdf.internal.pageSize.getWidth();
    const pageH: number = pdf.internal.pageSize.getHeight();

    pdf.setFontSize(10);
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      // Centered footer number; ~0.45" above bottom.
      pdf.text(String(p), pageW / 2, pageH - 0.45, { align: 'center' });
    }

    if (returnBlob) {
      return pdf.output('blob');
    }
    pdf.save(opt.filename);

    console.log('[PDF] Generation complete.');
  } catch (err) {
    console.error("[PDF] Generation failed:", err);
  } finally {
    document.body.removeChild(container);
    document.head.removeChild(fontLink);
    if (appRoot) (appRoot as HTMLElement).style.display = '';
  }
};
