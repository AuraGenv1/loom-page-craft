import { BookData } from './bookTypes';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

// 1. SETUP VFS (Virtual File System for default fonts)
// @ts-ignore
const pdfMakeInstance = pdfMake.default || pdfMake;
// @ts-ignore
const pdfFontsInstance = pdfFonts.default || pdfFonts;
// @ts-ignore
pdfMakeInstance.vfs = pdfFontsInstance.pdfMake?.vfs || pdfFontsInstance.vfs;

// 2. CONFIGURE STANDARD FONTS
// We map "Times" to the Standard 14 Fonts built into PDF readers.
// This bypasses the need to download font files, preventing crashes.
const fonts = {
  Times: {
    normal: 'Times-Roman',
    bold: 'Times-Bold',
    italics: 'Times-Italic',
    bolditalics: 'Times-BoldItalic'
  },
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
}

// 3. ASSETS
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 4. IMAGE FETCHER (With Timeout to prevent hanging)
const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url || url.startsWith('data:')) return url || TRANSPARENT_PIXEL;
  
  const fetchWithTimeout = (url: string, options: any, timeout = 5000) => {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
    ]);
  };

  try {
    const response = await fetchWithTimeout(url, { mode: 'cors' }) as Response;
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
    // Fallback to proxy
    try {
      const { data } = await supabase.functions.invoke('fetch-image-data-url', { body: { url } });
      if (data?.dataUrl) return data.dataUrl;
    } catch (err) {
      console.warn('Image fetch completely failed:', url);
    }
  }
  return TRANSPARENT_PIXEL;
};

// 5. MARKDOWN PARSER
const parseMarkdownToPdfMake = (text: string, imageMap: Map<string, string>): any[] => {
  const content: any[] = [];
  const lines = text.split('\n');

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      content.push({ 
        text: headerMatch[2].trim(), 
        style: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3',
        margin: [0, 15, 0, 5]
      });
      return;
    }

    // Images
    const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
    if (imgMatch && imgMatch[1]) {
      const base64 = imageMap.get(imgMatch[1]) || TRANSPARENT_PIXEL;
      if (base64 !== TRANSPARENT_PIXEL) {
        content.push({
          image: base64,
          width: 300, // Safe width for 6x9 margins
          alignment: 'center',
          margin: [0, 15, 0, 15]
        });
      }
      return;
    }

    // Bullets
    if (line.match(/^[-*]\s+/)) {
      content.push({
        ul: [line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '')],
        margin: [0, 2, 0, 2]
      });
      return;
    }

    // Pro-Tips (Vector Onyx Box)
    if (line.startsWith('>')) {
      const cleanText = line.replace(/^>\s*/, '').replace(/PRO-TIP:?\s*/i, '').replace(/\*\*/g, '').trim();
      content.push({
        table: {
          widths: [20, '*'],
          body: [[
            {
              svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 2L11.4 11.6" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 7.5L18.5 10.5L22 7L19 4L15.5 7.5Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.5" cy="15.5" r="5.5" stroke="black" stroke-width="2"/></svg>',
              width: 14,
              margin: [3, 4, 0, 0]
            },
            {
              stack: [
                { text: 'PRO TIP', style: 'proTipLabel' },
                { text: cleanText, style: 'proTipBody' }
              ]
            }
          ]]
        },
        layout: {
          vLineWidth: (i: number) => i === 0 ? 4 : 0, 
          hLineWidth: () => 0,
          vLineColor: () => '#000000',
          paddingLeft: () => 10,
          paddingTop: () => 8,
          paddingBottom: () => 8
        },
        fillColor: '#f9f9f9',
        margin: [0, 15, 0, 15]
      });
      return;
    }

    // Paragraphs
    const parts = line.split('**');
    if (parts.length > 1) {
      const richText = parts.map((part, i) => ({ text: part, bold: i % 2 !== 0 }));
      content.push({ text: richText, style: 'body' });
    } else {
      content.push({ text: line, style: 'body' });
    }
  });

  return content;
};

export const generateCleanPDF = async ({ topic, bookData }: GeneratePDFOptions): Promise<void> => {
  console.log('[PDF] 1. Starting Generation...');

  // 1. Prepare Content
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as Array<{chapter: number; title: string}>) || 
    chapterKeys.map((_, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));
  
  const allContent = chapters.map(ch => (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '').join('\n');
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(allContent)) !== null) if (match[1]) urls.push(match[1]);

  console.log(`[PDF] 2. Pre-loading ${urls.length} images...`);
  const imageMap = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    imageMap.set(url, await fetchImageAsBase64(url));
  }));

  // 2. Define Styles (KDP Standard)
  const styles: any = {
    h1: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 20, 0, 10], font: 'Times' },
    h2: { fontSize: 18, bold: true, margin: [0, 15, 0, 10], font: 'Times' },
    h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5], font: 'Times' },
    body: { fontSize: 11, lineHeight: 1.4, margin: [0, 0, 0, 10], font: 'Times', alignment: 'left' },
    
    tpTitle: { fontSize: 32, bold: true, alignment: 'center', font: 'Times' },
    tpSubtitle: { fontSize: 16, italics: true, alignment: 'center', font: 'Times' },
    branding: { fontSize: 10, letterSpacing: 2, alignment: 'center', color: '#666', font: 'Times' },
    
    proTipLabel: { fontSize: 9, bold: true, color: '#000', margin: [0, 0, 0, 2], font: 'Times', characterSpacing: 1 },
    proTipBody: { fontSize: 10, italics: true, color: '#333', font: 'Times' },
    copyright: { fontSize: 9, color: '#666', font: 'Times' }
  };

  const content: any[] = [];

  // --- PAGE 1: TITLE PAGE ---
  content.push({
    stack: [
      { text: (bookData.displayTitle || topic).toUpperCase(), style: 'tpTitle', margin: [0, 150, 0, 20] },
      { text: bookData.subtitle || '', style: 'tpSubtitle' },
      { text: 'LOOM & PAGE', style: 'branding', margin: [0, 250, 0, 0] }
    ],
    pageBreak: 'after',
    alignment: 'center'
  });

  // --- PAGE 2: COPYRIGHT (Pinned Bottom) ---
  const copyrightBlock = {
    stack: [
      { text: `Copyright © ${new Date().getFullYear()}`, style: 'copyright' },
      { text: 'All rights reserved.', style: 'copyright' },
      { text: 'Published by Loom & Page', style: 'copyright', margin: [0, 10, 0, 0] },
      { text: `First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`, style: 'copyright' }
    ],
    absolutePosition: { x: 63, y: 550 }, // x=63 (gutter), y=550 (bottom)
    pageBreak: 'after'
  };
  
  // Dummy content to force Page 2 creation
  content.push(
    { text: ' ', fontSize: 1 }, 
    copyrightBlock
  );

  // --- PAGE 3: TOC ---
  content.push({ text: 'Table of Contents', style: 'h1', margin: [0, 0, 0, 30] });
  chapters.forEach(ch => {
    content.push({
      columns: [
        { text: `Chapter ${ch.chapter}`, width: 80, fontSize: 11, font: 'Times' },
        { text: ch.title, width: '*', fontSize: 11, bold: true, font: 'Times' }
      ],
      margin: [0, 5, 0, 5]
    });
  });
  content.push({ text: '', pageBreak: 'after' });

  // --- 4. CHAPTERS ---
  chapters.forEach((ch, index) => {
    content.push(
      { text: `Chapter ${ch.chapter}`, fontSize: 10, alignment: 'center', color: '#888', font: 'Times', characterSpacing: 2 },
      { text: ch.title, style: 'h1' },
      { canvas: [{ type: 'line', x1: 200, y1: 0, x2: 260, y2: 0, lineWidth: 1, lineColor: '#ccc' }], alignment: 'center', margin: [0, 10, 0, 30] }
    );

    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    content.push(...parseMarkdownToPdfMake(rawContent, imageMap));

    if (index < chapters.length - 1) {
      content.push({ text: '', pageBreak: 'after' });
    }
  });

  // 3. GENERATE
  const docDefinition: any = {
    info: { title: topic, author: 'Loom & Page' },
    pageSize: { width: 432, height: 648 }, // 6x9 inches
    // Margins: [Left/Gutter, Top, Right, Bottom]
    // 0.875" = 63pts, 0.75" = 54pts, 0.625" = 45pts
    pageMargins: [63, 54, 45, 54], 
    content: content,
    styles: styles,
    defaultStyle: { font: 'Times' }, // Enforce Times
    footer: (currentPage: number) => {
      if (currentPage <= 2) return null;
      return { text: currentPage.toString(), alignment: 'center', fontSize: 9, color: '#888', margin: [0, 20, 0, 0] };
    }
  };

  try {
    console.log('[PDF] creating PDF...');
    // @ts-ignore
    pdfMakeInstance.createPdf(docDefinition, null, fonts).download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
  } catch (err: any) {
    console.error("PDF Failed:", err);
    alert('PDF Generation Failed: ' + err.message);
  }
};
