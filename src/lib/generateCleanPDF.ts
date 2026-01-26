import { BookData } from './bookTypes';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

// Register fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  includeCoverPage?: boolean;
  returnBlob?: boolean;
}

// 1. ASSETS
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 2. HELPER: Image Fetcher (with robust error handling)
const fetchImageAsBase64 = async (url: string): Promise<string> => {
  // Skip invalid URLs entirely
  if (!url || typeof url !== 'string') return TRANSPARENT_PIXEL;
  if (url.startsWith('data:')) return url;
  
  // Validate URL format
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn('[PDF] Invalid URL protocol:', url);
      return TRANSPARENT_PIXEL;
    }
  } catch {
    console.warn('[PDF] Malformed URL, skipping:', url);
    return TRANSPARENT_PIXEL;
  }
  
  // Try direct fetch first
  try {
    const response = await fetch(url, { mode: 'cors' });
    // If we got an actual HTTP response (even a 404), don't fall back to the proxy.
    // The proxy will return a 400 for non-OK upstream responses, which creates noisy errors.
    if (!response.ok) {
      console.warn('[PDF] Image URL returned non-OK status, skipping:', response.status, url);
      return TRANSPARENT_PIXEL;
    }

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      console.warn('[PDF] URL did not return an image blob, skipping:', blob.type, url);
      return TRANSPARENT_PIXEL;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(TRANSPARENT_PIXEL);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[PDF] Direct fetch failed, trying proxy:', url);
  }
  
  // Fallback to edge function proxy
  try {
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });
    if (!error && data?.dataUrl) return data.dataUrl;
    // Log but don't throw - just use transparent pixel
    if (error) console.warn('[PDF] Edge function error for:', url, error);
  } catch (e) {
    console.warn('[PDF] Image proxy failed:', url, e);
  }
  
  return TRANSPARENT_PIXEL;
};

// 3. HELPER: Markdown Parser -> PDFMake Object Stack
const parseMarkdownToPdfMake = (text: string, imageMap: Map<string, string>): any[] => {
  const content: any[] = [];
  const lines = text.split('\n');

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    // --- Headers (handle with or without space after #) ---
    const headerMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();
      const style = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      content.push({ text: headerText, style });
      return;
    }

    // --- Images (Luxury Full-Width) ---
    const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
    if (imgMatch && imgMatch[1]) {
      const url = imgMatch[1];
      // Check our image map for the base64 data
      const base64 = imageMap.get(url) || TRANSPARENT_PIXEL;
      
      if (base64 !== TRANSPARENT_PIXEL) {
        content.push({
          image: base64,
          // Calculate: 432 (Page Width) - 63 (Left) - 45 (Right) = 324 width
          // This forces the image to fill the text column exactly.
          width: 324, 
          alignment: 'center',
          margin: [0, 20, 0, 20]
        });
      }
      return;
    }

    // --- Bullets ---
    if (line.match(/^[-*]\s+/)) {
      const cleanLine = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
      content.push({
        ul: [cleanLine],
        margin: [0, 2, 0, 2]
      });
      return;
    }

    // --- Pro-Tips (Non-Splitting Onyx Box) ---
    if (line.startsWith('>')) {
      const cleanText = line.replace(/^>\s*/, '').replace(/PRO-TIP:?\s*/i, '').replace(/\*\*/g, '').trim();
      content.push({
        table: {
          widths: [20, '*'],
          // CRITICAL FIX: This prevents the box from splitting across pages
          dontBreakRows: true,
          body: [[
            {
              // EXACT SVG PATH for the Key Icon
              svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
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
          // Thick Left Border (4px), No other borders
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

    // --- Standard Paragraphs with inline formatting ---
    const parts = line.split('**');
    if (parts.length > 1) {
      const richText = parts.map((part, i) => {
        return i % 2 === 0 ? { text: part } : { text: part, bold: true };
      });
      content.push({ text: richText, style: 'body' });
    } else {
      content.push({ text: line, style: 'body' });
    }
  });

  return content;
};

export const generateCleanPDF = async ({ topic, bookData, coverImageUrl, includeCoverPage, returnBlob }: GeneratePDFOptions): Promise<void | Blob> => {
  console.log('[PDF] Starting pdfmake generation...');

  // A. Pre-fetch Images
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = (bookData.tableOfContents as Array<{chapter: number; title: string}>) || 
    chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));
  
  const allContent = chapters.map((ch) => (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '').join('\n');
  
  // Extract URLs
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(allContent)) !== null) {
    if (match[1]) urls.push(match[1]);
  }

  console.log(`[PDF] Pre-fetching ${urls.length} images...`);
  const imageMap = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    const b64 = await fetchImageAsBase64(url);
    imageMap.set(url, b64);
  }));

  // B. Define styles
  const styles: Record<string, any> = {
    h1: { fontSize: 22, bold: true, alignment: 'center', margin: [0, 20, 0, 10] },
    h2: { fontSize: 16, bold: true, margin: [0, 15, 0, 8] },
    h3: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
    body: { fontSize: 11, lineHeight: 1.5, margin: [0, 0, 0, 8], alignment: 'left' },
    titlePageTitle: { fontSize: 28, bold: true, alignment: 'center' },
    titlePageSubtitle: { fontSize: 14, italics: true, alignment: 'center', color: '#555' },
    branding: { fontSize: 9, alignment: 'center', color: '#888' },
    chapterNum: { fontSize: 10, alignment: 'center', color: '#666' },
    chapterTitle: { fontSize: 20, bold: true, alignment: 'center' },
    proTipLabel: { fontSize: 9, bold: true, characterSpacing: 1.5, margin: [0, 0, 0, 4] },
    proTipBody: { fontSize: 10, italics: true, color: '#333', lineHeight: 1.4 }
  };

  // C. Build content array
  const contentArray: any[] = [];

  // --- 1. TITLE PAGE ---
  contentArray.push(
    { text: '', margin: [0, 120, 0, 0] },
    { text: (bookData.displayTitle || topic).toUpperCase(), style: 'titlePageTitle' },
    { text: '', margin: [0, 15, 0, 0] },
    { text: bookData.subtitle || '', style: 'titlePageSubtitle' },
    { text: '', margin: [0, 200, 0, 0] },
    { text: 'LOOM & PAGE', style: 'branding', pageBreak: 'after' }
  );

  // --- 2. COPYRIGHT PAGE ---
  
  // A. The "Sticker" (Pinned to Bottom of Page 2)
  contentArray.push({
    stack: [
      { text: 'Copyright © 2026 by Larvotto Ventures LLC', fontSize: 10, bold: true, color: '#333' },
      { text: 'DBA Loom & Page', fontSize: 10, color: '#555', margin: [0, 0, 0, 10] },
      
      { text: 'All rights reserved.', fontSize: 9, color: '#555' },
      { text: 'No part of this book may be reproduced in any form or by any electronic or mechanical means, including information storage and retrieval systems, without written permission from the author, except for the use of brief quotations in a book review.', fontSize: 9, color: '#666', margin: [0, 5, 0, 10] },
      
      { text: 'Disclaimer', fontSize: 9, bold: true, color: '#444' },
      { text: 'AI-generated content for creative inspiration only.', fontSize: 8, color: '#666', margin: [0, 2, 0, 10] },
      
      { text: 'Visit us online at:', fontSize: 9, bold: true, color: '#444' },
      { text: 'www.LoomandPage.com', fontSize: 9, color: '#555', decoration: 'underline', margin: [0, 0, 0, 10] },
      
      { text: 'First Edition: January 2026', fontSize: 9, color: '#777' }
    ],
    // Pinned to bottom (Y=420 gives enough room for the longer text block)
    absolutePosition: { x: 63, y: 420 }
  });
  // B. The "Eject Button"
  // Forces the PDF to jump to Page 3 for the Table of Contents
  contentArray.push({ text: ' ', fontSize: 1, pageBreak: 'after' });

  // --- 3. TOC ---
  contentArray.push({ text: 'Table of Contents', style: 'h1', margin: [0, 30, 0, 30] });
  
  chapters.forEach((ch) => {
    contentArray.push({
      columns: [
        { text: `Chapter ${ch.chapter}:`, width: 80, fontSize: 11 },
        { text: ch.title, width: '*', fontSize: 11, bold: true }
      ],
      margin: [0, 5, 0, 5]
    });
  });
  
  contentArray.push({ text: '', pageBreak: 'after' });

  // --- 4. CHAPTERS ---
  chapters.forEach((ch, index) => {
    // Chapter header
    contentArray.push(
      { text: '', margin: [0, 40, 0, 0] },
      { text: `Chapter ${ch.chapter}`, style: 'chapterNum', margin: [0, 0, 0, 10] },
      { text: ch.title, style: 'chapterTitle', margin: [0, 0, 0, 5] },
      { 
        canvas: [{ type: 'line', x1: 180, y1: 0, x2: 252, y2: 0, lineWidth: 1, lineColor: '#ccc' }],
        margin: [0, 10, 0, 25]
      }
    );

    const rawContent = (bookData[`chapter${ch.chapter}Content` as keyof BookData] as string) || '';
    const parsedContent = parseMarkdownToPdfMake(rawContent, imageMap);
    
    contentArray.push(...parsedContent);
    
    // Page break after chapter (except last)
    if (index < chapters.length - 1) {
      contentArray.push({ text: '', pageBreak: 'after' });
    }
  });

  // D. Build document definition
  const docDefinition: any = {
    info: {
      title: bookData.displayTitle || topic,
      author: 'Loom & Page',
    },
    pageSize: { width: 432, height: 648 }, // 6x9 inches in points (72 per inch)
    pageMargins: [63, 54, 45, 54], // 0.875" gutter for binding
    
    footer: (currentPage: number, pageCount: number) => {
      if (currentPage <= 2) return null; // Skip title & copyright
      return { 
        text: `${currentPage}`, 
        alignment: 'center', 
        fontSize: 9, 
        color: '#888',
        margin: [0, 15, 0, 0] 
      };
    },

    content: contentArray,
    styles
  };

  // E. Generate and download (or return blob)
  console.log('[PDF] Creating document...');
  const t0 = Date.now();
  const pdfDoc = pdfMake.createPdf(docDefinition);
  console.log('[PDF] Document object created in', Date.now() - t0, 'ms');
  
  if (returnBlob) {
    // NOTE: In some browsers/environments pdfMake's getBlob callback can fail to fire.
    // getBuffer is more reliable; we then wrap it into a Blob for JSZip.
    return new Promise<Blob>((resolve, reject) => {
      const timeoutMs = 120_000;
      const timeout = setTimeout(() => {
        console.error(`[PDF] getBuffer timed out after ${timeoutMs}ms`);
        reject(new Error('PDF generation timed out'));
      }, timeoutMs);

      try {
        console.log('[PDF] Requesting PDF buffer...');
        // pdfMake types don't include getBuffer in some builds; treat as any.
        (pdfDoc as any).getBuffer((buffer: Uint8Array) => {
          clearTimeout(timeout);

          const size = (buffer as any)?.byteLength ?? (buffer as any)?.length ?? 0;
          console.log('[PDF] Buffer generated:', size, 'bytes');

          // Ensure we don't pass a SharedArrayBuffer-backed view into BlobParts (TS + some browsers)
          const safeBytes = new Uint8Array(buffer);
          const blob = new Blob([safeBytes], { type: 'application/pdf' });
          resolve(blob);
        });
      } catch (err) {
        clearTimeout(timeout);
        console.error('[PDF] getBuffer error:', err);
        reject(err);
      }
    });
  }
  
  pdfDoc.download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
  console.log('[PDF] Download initiated.');
};
