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
const KEY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Hard page break element
const PAGE_BREAK = `<div style="page-break-after: always; height: 0; display: block; clear: both;"></div>`;

// 2. ROBUST IMAGE LOADER (Fetch -> Proxy -> Placeholder)
const convertImageToDataUrl = async (url: string): Promise<string> => {
  if (!url) return TRANSPARENT_PIXEL;
  
  // Try 1: Direct Fetch
  try {
    const response = await fetch(url, { cache: 'no-cache', mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
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

  // Try 2: Supabase Edge Function Proxy (Bypasses CORS)
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

// 3. HTML PARSER - ALL INLINE STYLES
const parseMarkdownToHtml = (text: string) => {
  if (!text) return '';
  
  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3 style="font-size: 14pt; font-weight: 700; margin-top: 20px; margin-bottom: 10px; color: #000;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size: 18pt; font-weight: 700; margin-top: 30px; margin-bottom: 15px; color: #000;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h2 style="font-size: 18pt; font-weight: 700; margin-top: 30px; margin-bottom: 15px; color: #000;">$1</h2>')
    // Formatting
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Images - INLINE STYLES
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (_match, alt, url) => {
      return `<div style="text-align: center; margin: 20px 0;"><img alt="${alt}" data-original-src="${url}" style="max-width: 100%; height: auto; border: 1px solid #ddd;" /></div>`;
    })
    // Lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul style="padding-left: 25px; list-style: disc; margin-bottom: 15px;"><li style="margin-bottom: 5px;">$1</li></ul>')
    .replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips - ALL INLINE
  html = html.replace(/^> (.*$)/gim, (_match, content) => {
    const cleanContent = content.replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div style="background: #fff; border-left: 4px solid #000; padding: 15px; margin: 25px 0; display: flex; gap: 15px;">
        <div>${KEY_ICON_SVG}</div>
        <div>
          <span style="font-size: 10pt; font-weight: 700; letter-spacing: 2px; display: block; margin-bottom: 5px; text-transform: uppercase;">PRO TIP</span>
          <p style="font-style: italic; font-size: 11pt; color: #444; margin: 0;">${cleanContent}</p>
        </div>
      </div>
    `;
  });

  return html.split('\n').map(line => {
    if (line.trim() === '') return '<div style="height: 15px;"></div>';
    if (line.startsWith('<')) return line;
    return `<p style="font-size: 12pt; margin-bottom: 12px; text-align: justify; line-height: 1.6;">${line}</p>`;
  }).join('\n');
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
  // Container base styles - INLINE
  container.style.cssText = `
    width: 816px;
    margin: 0 auto;
    background: white;
    color: #000;
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 14px;
    line-height: 1.6;
  `;
  
  // Inject Google Font
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);
  
  document.body.appendChild(container);

  // C. BUILD CONTENT - ALL INLINE STYLES
  let html = '';

  // ============ TITLE PAGE ============
  html += `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 900px;
      text-align: center;
      padding: 60px 80px;
      box-sizing: border-box;
    ">
      <div>
        <h1 style="font-size: 28pt; font-weight: 700; margin-bottom: 20px; line-height: 1.2;">${bookData.displayTitle || topic}</h1>
        ${bookData.subtitle ? `<p style="font-size: 14pt; font-style: italic; color: #555; margin-bottom: 20px;">${bookData.subtitle}</p>` : ''}
      </div>
      <p style="margin-top: auto; font-size: 10pt; letter-spacing: 3px; color: #888;">LOOM & PAGE</p>
    </div>
  `;
  html += PAGE_BREAK;

  // ============ COPYRIGHT PAGE ============
  html += `
    <div style="
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      height: 900px;
      padding: 60px 80px;
      box-sizing: border-box;
    ">
      <p style="font-size: 10pt; color: #666; margin-bottom: 8px;">Copyright © ${new Date().getFullYear()}</p>
      <p style="font-size: 10pt; color: #666; margin-bottom: 8px;">All rights reserved.</p>
      <p style="font-size: 10pt; color: #666; margin-bottom: 8px;">Generated by Loom & Page</p>
    </div>
  `;
  html += PAGE_BREAK;

  // ============ TABLE OF CONTENTS ============
  html += `
    <div style="padding: 60px 80px; box-sizing: border-box;">
      <h1 style="font-size: 24pt; font-weight: 700; text-align: center; margin-bottom: 40px;">Table of Contents</h1>
      ${((bookData.tableOfContents || []) as Array<{ chapter: number; title: string }>).map(ch => `
        <p style="margin-bottom: 12px; font-size: 12pt;">
          <strong>Chapter ${ch.chapter}</strong> — ${ch.title}
        </p>
      `).join('')}
    </div>
  `;
  html += PAGE_BREAK;

  // ============ CHAPTERS ============
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as Array<{ chapter: number; title: string }>) || chapterKeys.map((_k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  chapters.forEach((ch, index) => {
    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    
    // Inject Images
    let processedContent = parseMarkdownToHtml(rawContent);
    urls.forEach(url => {
      if (imageMap.has(url)) {
        processedContent = processedContent.replace(`data-original-src="${url}"`, `src="${imageMap.get(url)}"`);
      }
    });
    // Clean broken images
    processedContent = processedContent.replace(/data-original-src=".*?"/g, 'src="" style="display:none"');

    html += `
      <div style="padding: 60px 80px; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #eee;">
          <p style="font-size: 10pt; text-transform: uppercase; letter-spacing: 3px; color: #888; margin-bottom: 10px;">Chapter ${ch.chapter}</p>
          <h1 style="font-size: 24pt; font-weight: 700; margin: 0;">${ch.title}</h1>
        </div>
        ${processedContent}
      </div>
    `;
    
    // Add page break after every chapter EXCEPT the last one
    if (index < chapters.length - 1) {
      html += PAGE_BREAK;
    }
  });

  container.innerHTML = html;

  // D. GENERATE PDF
  window.scrollTo(0, 0);
  
  // Wait for fonts and layout to settle
  await new Promise(resolve => setTimeout(resolve, 1500));

  const opt = {
    margin: 0, // We handle margins via inline padding
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true, 
      letterRendering: true,
      scrollY: 0,
      backgroundColor: '#ffffff',
    },
    jsPDF: { unit: 'in', format: 'letter' as const, orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'], before: [], after: [], avoid: [] }
  };

  try {
    console.log('[PDF] Starting generation...');
    if (returnBlob) {
      const pdf = await html2pdf().set(opt).from(container).outputPdf('blob');
      return pdf;
    } else {
      await html2pdf().set(opt).from(container).save();
    }
    console.log('[PDF] Generation complete.');
  } catch (err) {
    console.error("[PDF] Generation failed:", err);
  } finally {
    // Cleanup
    document.body.removeChild(container);
    document.head.removeChild(fontLink);
    if (appRoot) (appRoot as HTMLElement).style.display = '';
  }
};
