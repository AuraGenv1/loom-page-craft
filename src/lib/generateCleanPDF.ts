import { BookData } from './bookTypes';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

// 1. SETUP VFS
// @ts-ignore
const pdfMakeInstance = pdfMake.default || pdfMake;
// @ts-ignore
const pdfFontsInstance = pdfFonts.default || pdfFonts;
// @ts-ignore
pdfMakeInstance.vfs = pdfFontsInstance.pdfMake?.vfs || pdfFontsInstance.vfs;

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
}

// 2. ASSETS
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 3. HELPERS: Font & Image Loaders
const fetchAsBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Fetch failed:', url);
    return '';
  }
};

// Fetch Image with Proxy Fallback
const fetchImageForPdf = async (url: string): Promise<string> => {
  if (!url || url.startsWith('data:')) return url || TRANSPARENT_PIXEL;
  // Try direct
  let b64 = await fetchAsBase64(url);
  if (b64 && b64 !== 'data:') return b64;
  
  // Try Proxy
  try {
    const { data } = await supabase.functions.invoke('fetch-image-data-url', { body: { url } });
    if (data?.dataUrl) return data.dataUrl;
  } catch (e) { /* ignore */ }
  
  return TRANSPARENT_PIXEL;
};

// 4. MARKDOWN PARSER
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
      content.push({
        image: base64,
        width: 350,
        alignment: 'center',
        margin: [0, 15, 0, 15]
      });
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
          widths: [25, '*'],
          body: [[
            {
              // The Key Icon SVG Path
              svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 2L11.4 11.6" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 7.5L18.5 10.5L22 7L19 4L15.5 7.5Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.5" cy="15.5" r="5.5" stroke="black" stroke-width="2"/></svg>',
              width: 14,
              margin: [5, 3, 0, 0]
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
  console.log('[PDF] 1. Loading Fonts...');
  
  // A. Load "Crimson Text" (Google Font) for a real book look
  // We fetch the base64 string at runtime to avoid bloated file sizes
  const fontRegular = await fetchAsBase64('https://cdn.jsdelivr.net/npm/@canvas-fonts/crimson-text@1.0.4/CrimsonText-Regular.ttf');
  const fontBold = await fetchAsBase64('https://cdn.jsdelivr.net/npm/@canvas-fonts/crimson-text@1.0.4/CrimsonText-Bold.ttf');
  const fontItalic = await fetchAsBase64('https://cdn.jsdelivr.net/npm/@canvas-fonts/crimson-text@1.0.4/CrimsonText-Italic.ttf');

  // Register Custom Font
  const fontConfig = {
    Crimson: {
      normal: 'Crimson-Regular.ttf',
      bold: 'Crimson-Bold.ttf',
      italics: 'Crimson-Italic.ttf',
      bolditalics: 'Crimson-Bold.ttf' // Fallback
    },
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf'
    }
  };

  // Inject into VFS
  if (fontRegular) {
    pdfMakeInstance.vfs['Crimson-Regular.ttf'] = fontRegular.split(',')[1]; // Remove data: prefix
    pdfMakeInstance.vfs['Crimson-Bold.ttf'] = fontBold.split(',')[1];
    pdfMakeInstance.vfs['Crimson-Italic.ttf'] = fontItalic.split(',')[1];
  }

  // B. Pre-load Images
  console.log('[PDF] 2. Loading Images...');
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as Array<{chapter: number; title: string}>) || 
    chapterKeys.map((_, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));
  
  const allContent = chapters.map(ch => (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '').join('\n');
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(allContent)) !== null) if (match[1]) urls.push(match[1]);

  const imageMap = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    imageMap.set(url, await fetchImageForPdf(url));
  }));

  // C. Styles
  const styles: any = {
    h1: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 20, 0, 10], font: 'Crimson' },
    h2: { fontSize: 18, bold: true, margin: [0, 15, 0, 10], font: 'Crimson' },
    h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5], font: 'Crimson' },
    body: { fontSize: 12, lineHeight: 1.4, margin: [0, 0, 0, 10], font: 'Crimson', alignment: 'left' },
    
    tpTitle: { fontSize: 34, bold: true, alignment: 'center', font: 'Crimson' },
    tpSubtitle: { fontSize: 16, italics: true, alignment: 'center', font: 'Crimson' },
    branding: { fontSize: 10, letterSpacing: 2, alignment: 'center', color: '#666', font: 'Roboto' },
    
    proTipLabel: { fontSize: 9, bold: true, color: '#000', margin: [0, 0, 0, 2], font: 'Roboto', characterSpacing: 1 },
    proTipBody: { fontSize: 11, italics: true, color: '#333', font: 'Crimson' },
    copyright: { fontSize: 9, color: '#666', font: 'Roboto' }
  };

  const content: any[] = [];

  // --- 1. TITLE PAGE ---
  content.push({
    stack: [
      { text: (bookData.displayTitle || topic).toUpperCase(), style: 'tpTitle', margin: [0, 150, 0, 20] },
      { text: bookData.subtitle || '', style: 'tpSubtitle' },
      { text: 'LOOM & PAGE', style: 'branding', margin: [0, 250, 0, 0] }
    ],
    pageBreak: 'after',
    alignment: 'center'
  });

  // --- 2. COPYRIGHT PAGE ---
  // Vertical align bottom using spacing
  content.push(
    { text: ' ', margin: [0, 480, 0, 0] }, // Spacer for ~80% page height
    {
      stack: [
        { text: `Copyright © ${new Date().getFullYear()}`, style: 'copyright' },
        { text: 'All rights reserved.', style: 'copyright' },
        { text: 'Published by Loom & Page', style: 'copyright', margin: [0, 10, 0, 0] },
        { text: `First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`, style: 'copyright' }
      ]
    },
    { text: '', pageBreak: 'after' }
  );

  // --- 3. TOC ---
  content.push({ text: 'Table of Contents', style: 'h1', margin: [0, 0, 0, 30] });
  chapters.forEach(ch => {
    content.push({
      columns: [
        { text: `Chapter ${ch.chapter}`, width: 80, fontSize: 12, font: 'Roboto' },
        { text: ch.title, width: '*', fontSize: 12, bold: true, font: 'Crimson' }
      ],
      margin: [0, 5, 0, 5]
    });
  });
  content.push({ text: '', pageBreak: 'after' });

  // --- 4. CHAPTERS ---
  chapters.forEach((ch, index) => {
    content.push(
      { text: `Chapter ${ch.chapter}`, fontSize: 10, alignment: 'center', color: '#888', font: 'Roboto', characterSpacing: 2 },
      { text: ch.title, style: 'h1' },
      { canvas: [{ type: 'line', x1: 200, y1: 0, x2: 260, y2: 0, lineWidth: 1, lineColor: '#ccc' }], alignment: 'center', margin: [0, 10, 0, 30] }
    );

    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    content.push(...parseMarkdownToPdfMake(rawContent, imageMap));

    if (index < chapters.length - 1) {
      content.push({ text: '', pageBreak: 'after' });
    }
  });

  // Generate
  const docDefinition: any = {
    info: { title: topic, author: 'Loom & Page' },
    pageSize: { width: 432, height: 648 }, // 6x9 inches
    // Margins: [Left, Top, Right, Bottom]
    // 0.875" inside gutter (63pt), 0.625" outer (45pt)
    pageMargins: [63, 54, 45, 54], 
    content: content,
    styles: styles,
    defaultStyle: { font: fontRegular ? 'Crimson' : 'Roboto' }, 
    footer: (currentPage: number) => {
      if (currentPage <= 2) return null;
      return { text: currentPage.toString(), alignment: 'center', fontSize: 9, color: '#888', margin: [0, 20, 0, 0] };
    }
  };

  try {
    // @ts-ignore
    pdfMakeInstance.createPdf(docDefinition, null, fontConfig).download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
  } catch (e: any) {
    alert('PDF Generation Failed: ' + e.message);
  }
};
