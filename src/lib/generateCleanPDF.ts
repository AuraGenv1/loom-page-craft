import { BookData } from './bookTypes';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  includeCoverPage?: boolean;
  returnBlob?: boolean;
}

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url || typeof url !== 'string' || url.includes('placeholder')) return TRANSPARENT_PIXEL;
  try {
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', { body: { url } });
    if (!error && data?.dataUrl) return data.dataUrl;
  } catch (e) { console.warn('[PDF] Image proxy failed:', url); }
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
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as any[]) || chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));
  const styles = {
    h1: { fontSize: 22, bold: true, alignment: 'center', margin: [0, 20, 0, 10] },
    h2: { fontSize: 16, bold: true, margin: [0, 15, 0, 8] },
    body: { fontSize: 11, lineHeight: 1.5, margin: [0, 0, 0, 8] },
    titlePageTitle: { fontSize: 28, bold: true, alignment: 'center' },
    branding: { fontSize: 9, alignment: 'center', color: '#888' }
  };

  const contentArray: any[] = [
    { text: '', margin: [0, 120, 0, 0] },
    { text: (bookData.displayTitle || topic).toUpperCase(), style: 'titlePageTitle' },
    { text: 'LOOM & PAGE', style: 'branding', pageBreak: 'after' }
  ];

  chapters.forEach((ch, index) => {
    contentArray.push({ text: ch.title, style: 'h1' });
    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    contentArray.push(...parseMarkdownToPdfMake(rawContent, new Map()));
    if (index < chapters.length - 1) contentArray.push({ text: '', pageBreak: 'after' });
  });

  const docDefinition: any = {
    pageSize: { width: 432, height: 648 },
    pageMargins: [63, 54, 45, 54],
    content: contentArray,
    styles
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);

  if (returnBlob) {
    return new Promise((resolve) => pdfDoc.getBlob((blob) => resolve(blob)));
  } else {
    pdfDoc.download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
  }
};
