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

// 3. HTML PARSER
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
    // Images (Data URL placeholder)
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (_match, alt, url) => {
      return `<div class="img-wrapper"><img alt="${alt}" data-original-src="${url}" /></div>`;
    })
    // Lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul class="bullet-list"><li>$1</li></ul>')
    .replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips
  html = html.replace(/^> (.*$)/gim, (_match, content) => {
    const cleanContent = content.replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div class="pro-tip-box avoid-break">
        <div>${KEY_ICON_SVG}</div>
        <div>
          <span class="pro-tip-label">PRO TIP</span>
          <p class="pro-tip-body">${cleanContent}</p>
        </div>
      </div>
    `;
  });

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
  
  // A. PRE-FETCH IMAGES
  console.log('Fetching images...');
  const allContent = Object.values(bookData).filter(v => typeof v === 'string').join('\n');
  const urls = extractImageUrls(allContent);
  const imageMap = new Map<string, string>();
  
  // Fetch in parallel
  await Promise.all(urls.map(async (url) => {
    const b64 = await convertImageToDataUrl(url);
    imageMap.set(url, b64);
  }));

  // B. SETUP EXCLUSIVE CONTAINER
  const appRoot = document.getElementById('root') || document.body.firstElementChild;
  if (appRoot) (appRoot as HTMLElement).style.display = 'none';

  const container = document.createElement('div');
  container.id = 'print-container';
  container.style.width = '816px'; // 8.5in width
  container.style.margin = '0 auto'; 
  container.style.background = 'white';
  document.body.appendChild(container);

  // C. INJECT STYLES
  const style = document.createElement('style');
  style.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
    
    #print-container {
      font-family: 'Playfair Display', serif;
      line-height: 1.6;
      font-size: 14px;
      color: #000;
    }
    
    /* Layout */
    .page-break { page-break-before: always; }
    .avoid-break { page-break-inside: avoid; }
    
    /* Spacing Helpers */
    .chapter-title { 
      text-align: center; 
      margin-top: 0; /* Handled by PDF margin */
      margin-bottom: 30px; 
      padding-bottom: 20px; 
      border-bottom: 2px solid #eee; 
    }
    
    /* Typography */
    h1 { font-size: 24pt; font-weight: 700; margin-bottom: 20px; }
    h2 { font-size: 18pt; font-weight: 700; margin-top: 30px; margin-bottom: 15px; }
    h3 { font-size: 14pt; font-weight: 700; margin-top: 20px; margin-bottom: 10px; }
    p { font-size: 12pt; margin-bottom: 12px; text-align: justify; }
    
    /* Components */
    .img-wrapper { text-align: center; margin: 20px 0; page-break-inside: avoid; }
    .img-wrapper img { max-width: 100%; height: auto; border: 1px solid #ddd; }
    
    .pro-tip-box {
      background: #fff;
      border-left: 4px solid #000;
      padding: 15px;
      margin: 25px 0;
      display: flex;
      gap: 15px;
      page-break-inside: avoid;
    }
    .pro-tip-label { font-size: 10pt; font-weight: 700; letter-spacing: 2px; display: block; margin-bottom: 5px; }
    .pro-tip-body { font-style: italic; font-size: 11pt; color: #444; }
    
    .bullet-list { padding-left: 25px; list-style: disc; margin-bottom: 15px; }
    .spacer { height: 15px; }
    
    /* Special Pages */
    .title-page { text-align: center; height: 900px; display: flex; flex-direction: column; justify-content: center; }
    .copyright-page { height: 900px; display: flex; flex-direction: column; justify-content: flex-end; }
  `;
  container.appendChild(style);

  // D. BUILD CONTENT
  let html = '';

  // Title Page
  html += `
    <div class="title-page">
      <h1>${bookData.displayTitle || topic}</h1>
      ${bookData.subtitle ? `<p style="font-size: 14pt; font-style: italic; color: #555;">${bookData.subtitle}</p>` : ''}
      <p style="margin-top: auto; font-size: 10pt; letter-spacing: 3px; color: #888;">LOOM & PAGE</p>
    </div>
    <div class="page-break"></div>
  `;

  // Copyright Page
  html += `
    <div class="copyright-page">
      <p style="font-size: 10pt; color: #666;">Copyright © ${new Date().getFullYear()}</p>
      <p style="font-size: 10pt; color: #666;">All rights reserved.</p>
      <p style="font-size: 10pt; color: #666;">Generated by Loom & Page</p>
    </div>
    <div class="page-break"></div>
  `;

  // TOC
  html += `
    <div>
      <h1 style="text-align: center;">Table of Contents</h1>
      ${((bookData.tableOfContents || []) as Array<{ chapter: number; title: string }>).map(ch => `
        <p style="margin-bottom: 10px;">
          <strong>Chapter ${ch.chapter}</strong>
          ${ch.title}
        </p>
      `).join('')}
    </div>
    <div class="page-break"></div>
  `;

  // Chapters
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
    // Clean broken
    processedContent = processedContent.replace(/data-original-src=".*?"/g, 'src="" style="display:none"');

    html += `
      <div>
        <div class="chapter-title avoid-break">
          <p style="font-size: 10pt; text-transform: uppercase; letter-spacing: 3px; color: #888;">Chapter ${ch.chapter}</p>
          <h1>${ch.title}</h1>
        </div>
        ${processedContent}
      </div>
    `;
    
    // Add page break after every chapter EXCEPT the last one
    if (index < chapters.length - 1) {
      html += `<div class="page-break"></div>`;
    }
  });

  container.innerHTML += html;

  // E. GENERATE PDF
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1000));

  const opt = {
    margin: [0.75, 0.75, 0.75, 0.75] as [number, number, number, number], // Standard 0.75in margins on all sides
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 3, // 3x = ~288 DPI (Crisp)
      useCORS: true, 
      letterRendering: true,
      scrollY: 0,
    },
    jsPDF: { unit: 'in', format: 'letter' as const, orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  try {
    if (returnBlob) {
      const pdf = await html2pdf().set(opt).from(container).outputPdf('blob');
      return pdf;
    } else {
      await html2pdf().set(opt).from(container).save();
    }
  } catch (err) {
    console.error("PDF Failed:", err);
  } finally {
    document.body.removeChild(container);
    if (appRoot) (appRoot as HTMLElement).style.display = '';
  }
};
