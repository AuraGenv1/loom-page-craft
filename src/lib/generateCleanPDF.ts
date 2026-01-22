import { BookData } from './bookTypes';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

// 1. CONFIGURE STANDARD FONTS (Fixes "Roboto" look)
// @ts-ignore
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs || (pdfFonts as any);

// Define font mapping for Standard 14 PDF Fonts (Times, Helvetica)
// This avoids the need to embed custom font files while giving the "Book" look.
const fonts = {
  Times: {
    normal: 'Times-Roman',
    bold: 'Times-Bold',
    italics: 'Times-Italic',
    bolditalics: 'Times-BoldItalic'
  },
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  },
  // Fallback
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
  coverImageUrl?: string;
  includeCoverPage?: boolean;
}

// 2. ASSETS
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 3. IMAGE FETCHER
const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url || url.startsWith('data:')) return url || TRANSPARENT_PIXEL;
  try {
    const response = await fetch(url, { mode: 'cors' });
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
    const { data } = await supabase.functions.invoke('fetch-image-data-url', { body: { url } });
    if (data?.dataUrl) return data.dataUrl;
  }
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

    // Pro-Tips (ONYX REPLICA)
    if (line.startsWith('>')) {
      const cleanText = line.replace(/^>\s*/, '').replace(/PRO-TIP:?\s*/i, '').replace(/\*\*/g, '').trim();
      content.push({
        table: {
          widths: [25, '*'],
          body: [[
            // Vector Key Icon (Lucide Path)
            {
              svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
              width: 14,
              margin: [5, 5, 0, 0]
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
          paddingLeft: () => 12,
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
  console.log('[PDF] Preparing assets...');

  // Pre-load Images
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
    imageMap.set(url, await fetchImageAsBase64(url));
  }));

  // Define Styles
  const styles: any = {
    h1: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 20, 0, 10], font: 'Times' },
    h2: { fontSize: 18, bold: true, margin: [0, 15, 0, 10], font: 'Times' },
    h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5], font: 'Times' },
    body: { fontSize: 11, lineHeight: 1.4, margin: [0, 0, 0, 10], font: 'Times', alignment: 'left' },
    
    tpTitle: { fontSize: 34, bold: true, alignment: 'center', font: 'Times' },
    tpSubtitle: { fontSize: 16, italics: true, alignment: 'center', font: 'Times' },
    branding: { fontSize: 10, letterSpacing: 2, alignment: 'center', color: '#666', font: 'Helvetica' },
    
    proTipLabel: { fontSize: 9, bold: true, color: '#000', margin: [0, 0, 0, 2], font: 'Helvetica', characterSpacing: 1 },
    proTipBody: { fontSize: 10, italics: true, color: '#333', font: 'Times' },
    copyright: { fontSize: 9, color: '#666', font: 'Helvetica' }
  };

  const content: any[] = [];

  // 1. TITLE PAGE
  content.push({
    stack: [
      { text: (bookData.displayTitle || topic).toUpperCase(), style: 'tpTitle', margin: [0, 150, 0, 20] },
      { text: bookData.subtitle || '', style: 'tpSubtitle' },
      { text: 'LOOM & PAGE', style: 'branding', margin: [0, 250, 0, 0] }
    ],
    pageBreak: 'after',
    alignment: 'center'
  });

  // 2. COPYRIGHT PAGE (ABSOLUTE POSITIONING)
  // We use absolutePosition to pin this block to the bottom of the page.
  // This guarantees it will NEVER split across pages.
  const copyrightBlock = {
    stack: [
      { text: `Copyright © ${new Date().getFullYear()}`, style: 'copyright' },
      { text: 'All rights reserved.', style: 'copyright' },
      { text: 'Published by Loom & Page', style: 'copyright', margin: [0, 10, 0, 0] },
      { text: `First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`, style: 'copyright' }
    ],
    absolutePosition: { x: 54, y: 550 }, // Bottom of page (648 - margins)
    pageBreak: 'after'
  };
  
  // Create a blank page 2, and add the floating copyright block to it
  content.push(
    { text: ' ', fontSize: 1 }, // invisible spacer for Page 2
    copyrightBlock
  );

  // 3. TOC
  content.push({ text: 'Table of Contents', style: 'h1', margin: [0, 0, 0, 30] });
  chapters.forEach(ch => {
    content.push({
      columns: [
        { text: `Chapter ${ch.chapter}`, width: 80, fontSize: 11, font: 'Helvetica' },
        { text: ch.title, width: '*', fontSize: 11, bold: true, font: 'Times' }
      ],
      margin: [0, 5, 0, 5]
    });
  });
  content.push({ text: '', pageBreak: 'after' });

  // 4. CHAPTERS
  chapters.forEach((ch, index) => {
    content.push(
      { text: `Chapter ${ch.chapter}`, fontSize: 10, alignment: 'center', color: '#888', font: 'Helvetica' },
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
  const docDefinition = {
    info: { title: topic, author: 'Loom & Page' },
    pageSize: { width: 432, height: 648 }, // 6x9 inches
    pageMargins: [54, 54, 54, 54], // 0.75in margins
    content: content,
    styles: styles,
    // Inject the font configuration here
    defaultStyle: { font: 'Times' }, 
    footer: (currentPage: number) => {
      if (currentPage <= 2) return null;
      return { text: currentPage.toString(), alignment: 'center', fontSize: 9, color: '#888', margin: [0, 20, 0, 0], font: 'Helvetica' };
    }
  };

  // @ts-ignore - Pass the fonts object
  pdfMake.createPdf(docDefinition, null, fonts).download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
};
