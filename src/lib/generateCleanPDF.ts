import { BookData } from './bookTypes';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

// Robust Font Registration
const pdfMakeAny = pdfMake as any;
if (pdfMakeAny && pdfFonts) {
  // Handle different bundler structures for vfs_fonts
  const vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs || pdfFonts;
  if (vfs) pdfMakeAny.vfs = vfs;
}

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  includeCoverPage?: boolean;
  returnBlob?: boolean;
}

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Helper: Fetch with Timeout
const fetchWithTimeout = (url: string, options: RequestInit = {}, timeout = 5000) => {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    )
  ]);
};

const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url || typeof url !== 'string' || url.includes('placeholder')) return TRANSPARENT_PIXEL;
  
  try {
    const response = await fetchWithTimeout(url, { mode: 'cors' }, 5000);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return TRANSPARENT_PIXEL;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(TRANSPARENT_PIXEL);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    // Fallback proxy
    try {
      const { data, error } = await supabase.functions.invoke('fetch-image-data-url', { body: { url } });
      if (!error && data?.dataUrl) return data.dataUrl;
    } catch (proxyErr) {
      console.warn('[PDF] Image load failed:', url);
    }
  }
  return TRANSPARENT_PIXEL;
};

const parseMarkdownToPdfMake = (text: string, imageMap: Map<string, string>): any[] => {
  const content: any[] = [];
  const lines = text.split('\n');
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    const headerMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      content.push({ text: headerMatch[2].trim(), style: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3' });
      return;
    }
    const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
    if (imgMatch && imgMatch[1]) {
      const base64 = imageMap.get(imgMatch[1]) || TRANSPARENT_PIXEL;
      if (base64 !== TRANSPARENT_PIXEL) {
        content.push({ image: base64, width: 300, alignment: 'center', margin: [0, 10, 0, 10] });
      }
      return;
    }
    const parts = line.split('**');
    if (parts.length > 1) {
      const richText = parts.map((part, i) => i % 2 === 0 ? { text: part } : { text: part, bold: true });
      content.push({ text: richText, style: 'body' });
    } else {
      content.push({ text: line, style: 'body' });
    }
  });
  return content;
};

export const generateCleanPDF = async ({ topic, bookData, returnBlob = false }: GeneratePDFOptions): Promise<Blob | void> => {
  console.log('[PDF] Starting generation...');
  
  // 1. Pre-fetch images (Parallel with timeouts)
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as any[]) || chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));
  
  const allContent = chapters.map((ch) => (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '').join('\n');
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(allContent)) !== null) { if (match[1]) urls.push(match[1]); }

  const imageMap = new Map<string, string>();
  await Promise.all(urls.slice(0, 10).map(async (url) => {
    const b64 = await fetchImageAsBase64(url);
    imageMap.set(url, b64);
  }));

  // 2. Build Content
  const contentArray: any[] = [
    { text: '', margin: [0, 100, 0, 0] },
    { text: (bookData.displayTitle || topic).toUpperCase(), style: 'titlePageTitle' },
    { text: 'LOOM & PAGE', style: 'branding', pageBreak: 'after' }
  ];

  chapters.forEach((ch, index) => {
    contentArray.push({ text: ch.title, style: 'h1' });
    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    contentArray.push(...parseMarkdownToPdfMake(rawContent, imageMap));
    if (index < chapters.length - 1) contentArray.push({ text: '', pageBreak: 'after' });
  });

  const docDefinition: any = {
    pageSize: { width: 432, height: 648 }, // 6x9 inches
    pageMargins: [50, 50, 50, 50],
    content: contentArray,
    styles: {
      h1: { fontSize: 22, bold: true, alignment: 'center', margin: [0, 20, 0, 10] },
      h2: { fontSize: 16, bold: true, margin: [0, 15, 0, 8] },
      body: { fontSize: 11, lineHeight: 1.4, margin: [0, 0, 0, 8] },
      titlePageTitle: { fontSize: 24, bold: true, alignment: 'center' },
      branding: { fontSize: 10, alignment: 'center', color: '#888' }
    }
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);

  if (returnBlob) {
    return new Promise((resolve, reject) => {
      // Safety timeout
      const t = setTimeout(() => reject(new Error('PDF Blob generation timed out')), 10000);
      try {
        pdfDoc.getBlob((blob) => {
          clearTimeout(t);
          resolve(blob);
        });
      } catch (e) {
        clearTimeout(t);
        reject(e);
      }
    });
  } else {
    pdfDoc.download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
  }
};
