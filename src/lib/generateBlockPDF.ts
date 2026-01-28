import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { PageBlock } from './pageBlockTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Register fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

interface GenerateBlockPDFOptions {
  title: string;
  displayTitle: string;
  subtitle: string;
  tableOfContents: Array<{ chapter: number; title: string }>;
  bookId: string;
  coverAttribution?: string;  // "Photo by X via Unsplash"
  returnBlob?: boolean;       // For ZIP bundling
}

// Transparent pixel for missing images
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Loom & Page logo as SVG (matches the CSS version in Logo.tsx)
const LOOM_LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Vertical loom lines -->
  <rect x="5" y="4" width="2" height="24" rx="1" fill="#333333"/>
  <rect x="15" y="4" width="2" height="24" rx="1" fill="#333333"/>
  <rect x="25" y="4" width="2" height="24" rx="1" fill="#333333"/>
  <!-- Horizontal page fold -->
  <rect x="2" y="15" width="28" height="2" rx="1" fill="#333333"/>
  <!-- Corner fold detail -->
  <path d="M26 4 L30 4 L30 8" stroke="#333333" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/>
</svg>`;

// Fetch image as base64
const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url || typeof url !== 'string') return TRANSPARENT_PIXEL;
  if (url.startsWith('data:')) return url;
  
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return TRANSPARENT_PIXEL;
  } catch {
    return TRANSPARENT_PIXEL;
  }
  
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return TRANSPARENT_PIXEL;
    
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return TRANSPARENT_PIXEL;
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(TRANSPARENT_PIXEL);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Try proxy
    try {
      const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
        body: { url },
      });
      if (!error && data?.dataUrl) return data.dataUrl;
    } catch {
      // Ignore
    }
    return TRANSPARENT_PIXEL;
  }
};

// Convert block to pdfmake content
const blockToPdfContent = async (
  block: PageBlock, 
  imageMap: Map<string, string>
): Promise<any[]> => {
  const content: any[] = [];
  
  switch (block.block_type) {
    case 'chapter_title': {
      const c = block.content as { chapter_number: number; title: string };
      content.push(
        { text: '', margin: [0, 180, 0, 0] },
        { text: `Chapter ${c.chapter_number}`, style: 'chapterNum' },
        { text: c.title, style: 'chapterTitle' },
        { 
          canvas: [{ 
            type: 'line', 
            x1: 140, y1: 0, x2: 220, y2: 0, 
            lineWidth: 1, 
            lineColor: '#cccccc' 
          }],
          margin: [0, 20, 0, 0]
        }
      );
      break;
    }
    
    case 'text': {
      const c = block.content as { text: string };
      // Parse markdown-style headers and render appropriately
      const lines = c.text.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('### ')) {
          // H3 heading
          content.push({ 
            text: trimmedLine.replace('### ', ''), 
            style: 'h3', 
            margin: [0, 15, 0, 8] 
          });
        } else if (trimmedLine.startsWith('## ')) {
          // H2 heading
          content.push({ 
            text: trimmedLine.replace('## ', ''), 
            style: 'h2', 
            margin: [0, 20, 0, 10] 
          });
        } else if (trimmedLine.length > 0) {
          // Regular paragraph
          content.push({ 
            text: trimmedLine, 
            style: 'body', 
            margin: [0, 0, 0, 10] 
          });
        }
      }
      break;
    }
    
    case 'image_full': {
      const c = block.content as { query: string; caption: string };
      const imageUrl = block.image_url;
      
      if (imageUrl) {
        const base64 = imageMap.get(imageUrl) || TRANSPARENT_PIXEL;
        if (base64 !== TRANSPARENT_PIXEL) {
          content.push(
            { text: '', margin: [0, 40, 0, 0] },
            { 
              image: base64, 
              width: 324, // Full text width
              alignment: 'center',
              margin: [0, 0, 0, 15]
            },
            { 
              text: c.caption, 
              style: 'caption',
              alignment: 'center'
            }
          );
        }
      }
      break;
    }
    
    case 'image_half': {
      const c = block.content as { query: string; caption: string };
      const imageUrl = block.image_url;
      
      if (imageUrl) {
        const base64 = imageMap.get(imageUrl) || TRANSPARENT_PIXEL;
        if (base64 !== TRANSPARENT_PIXEL) {
          content.push(
            { 
              image: base64, 
              width: 250,
              alignment: 'center',
              margin: [0, 20, 0, 10]
            },
            { 
              text: c.caption, 
              style: 'caption',
              alignment: 'center'
            }
          );
        }
      }
      break;
    }
    
    case 'pro_tip': {
      const c = block.content as { text: string };
      content.push({
        table: {
          widths: [20, '*'],
          dontBreakRows: true,
          body: [[
            {
              svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
              width: 14,
              margin: [3, 4, 0, 0]
            },
            {
              stack: [
                { text: 'PRO TIP', style: 'proTipLabel' },
                { text: c.text, style: 'proTipBody' }
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
        margin: [0, 30, 0, 30]
      });
      break;
    }
    
    case 'heading': {
      const c = block.content as { level: 2 | 3; text: string };
      const style = c.level === 2 ? 'h2' : 'h3';
      content.push({ text: c.text, style, margin: [0, 20, 0, 10] });
      break;
    }
    
    case 'list': {
      const c = block.content as { items: string[]; ordered?: boolean };
      if (c.ordered) {
        content.push({
          ol: c.items,
          style: 'body',
          margin: [0, 10, 0, 10]
        });
      } else {
        content.push({
          ul: c.items,
          style: 'body',
          margin: [0, 10, 0, 10]
        });
      }
      break;
    }
    
    case 'quote': {
      const c = block.content as { text: string; attribution?: string };
      content.push(
        { text: '', margin: [0, 100, 0, 0] },
        { 
          text: `"${c.text}"`, 
          fontSize: 14, 
          italics: true, 
          alignment: 'center',
          margin: [30, 0, 30, 15]
        }
      );
      if (c.attribution) {
        content.push({
          text: `— ${c.attribution}`,
          fontSize: 10,
          alignment: 'center',
          color: '#666666',
          margin: [0, 0, 0, 0]
        });
      }
      break;
    }
    
    case 'divider': {
      const c = block.content as { style?: 'minimal' | 'ornate' | 'line' };
      content.push(
        { text: '', margin: [0, 80, 0, 0] },
        { 
          text: c.style === 'ornate' ? '❧' : '• • •', 
          fontSize: c.style === 'ornate' ? 24 : 14, 
          alignment: 'center',
          color: '#aaaaaa'
        }
      );
      break;
    }
  }
  
  return content;
};

export const generateBlockBasedPDF = async (options: GenerateBlockPDFOptions): Promise<Blob | void> => {
  const { title, displayTitle, subtitle, tableOfContents, bookId, coverAttribution, returnBlob } = options;
  
  console.log('[BlockPDF] Starting generation for bookId:', bookId);
  
  // Fetch all blocks for this book
  const { data: blocks, error } = await supabase
    .from('book_pages')
    .select('*')
    .eq('book_id', bookId)
    .is('archived_at', null) // Only non-archived blocks
    .order('chapter_number', { ascending: true })
    .order('page_order', { ascending: true });
  
  if (error) {
    console.error('[BlockPDF] Error fetching blocks:', error);
    throw error;
  }
  
  console.log(`[BlockPDF] Fetched ${blocks?.length || 0} blocks`);
  
  if ((blocks?.length || 0) === 0) {
    toast.warning('No content blocks found. The PDF may be empty.');
  }
  
  // Pre-fetch all images
  const imageUrls = (blocks || [])
    .filter(b => b.image_url)
    .map(b => b.image_url as string);
  
  console.log(`[BlockPDF] Pre-fetching ${imageUrls.length} images...`);
  
  const imageMap = new Map<string, string>();
  await Promise.all(imageUrls.map(async (url) => {
    const b64 = await fetchImageAsBase64(url);
    imageMap.set(url, b64);
  }));
  
  // Define styles - using Times-like serif for professional book look
  const styles: Record<string, any> = {
    h1: { fontSize: 22, bold: true, alignment: 'center', margin: [0, 20, 0, 10] },
    h2: { fontSize: 15, bold: true, margin: [0, 15, 0, 8] },
    h3: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
    body: { fontSize: 11, lineHeight: 1.6, margin: [0, 0, 0, 8], alignment: 'justify' },
    titlePageTitle: { fontSize: 26, bold: true, alignment: 'center' },
    titlePageSubtitle: { fontSize: 13, italics: true, alignment: 'center', color: '#555555' },
    branding: { fontSize: 10, alignment: 'center', color: '#888888' },
    chapterNum: { fontSize: 10, alignment: 'center', color: '#666666', characterSpacing: 2 },
    chapterTitle: { fontSize: 20, bold: true, alignment: 'center', margin: [0, 10, 0, 0] },
    caption: { fontSize: 10, italics: true, color: '#666666' },
    proTipLabel: { fontSize: 9, bold: true, characterSpacing: 1.5, margin: [0, 0, 0, 4] },
    proTipBody: { fontSize: 10, italics: true, color: '#333333', lineHeight: 1.4 },
    tocEntry: { fontSize: 11, margin: [0, 4, 0, 4] },
    copyright: { fontSize: 9, color: '#555555', lineHeight: 1.5 }
  };
  
  // Build content array
  const contentArray: any[] = [];
  
  // --- 1. TITLE PAGE ---
  contentArray.push(
    { text: '', margin: [0, 140, 0, 0] },
    { text: (displayTitle || title).toUpperCase(), style: 'titlePageTitle' },
    // Decorative separator line
    { 
      canvas: [{ 
        type: 'line', 
        x1: 145, y1: 0, x2: 215, y2: 0, 
        lineWidth: 0.75, 
        lineColor: '#cccccc' 
      }],
      margin: [0, 20, 0, 20],
      alignment: 'center'
    },
    { text: subtitle || '', style: 'titlePageSubtitle' },
    { text: '', margin: [0, 220, 0, 0] },
    // Logo SVG
    { 
      svg: LOOM_LOGO_SVG, 
      width: 28, 
      alignment: 'center',
      margin: [0, 0, 0, 8]
    },
    { text: 'Loom & Page', style: 'branding' },
    { text: '', pageBreak: 'after' }
  );
  
  // --- 2. COPYRIGHT PAGE ---
  // Push content to bottom of page using margin
  contentArray.push({ text: '', margin: [0, 380, 0, 0] });
  
  // Copyright content stack (no absolutePosition to avoid overlap)
  contentArray.push({
    stack: [
      { text: 'Copyright © 2026 by Larvotto Ventures LLC', style: 'copyright', bold: true },
      { text: 'DBA Loom & Page', style: 'copyright', margin: [0, 0, 0, 12] },
      { text: 'All rights reserved. No part of this book may be reproduced in any form or by any electronic or mechanical means, including information storage and retrieval systems, without written permission from the author, except for the use of brief quotations in a book review.', style: 'copyright', margin: [0, 0, 0, 12] },
      { text: 'Disclaimer', style: 'copyright', bold: true },
      { text: 'AI-generated content for creative inspiration only. Not professional advice.', style: 'copyright', margin: [0, 0, 0, 12] },
      // Cover attribution
      { text: 'Cover design by Loom & Page', style: 'copyright' },
      { text: coverAttribution || '', style: 'copyright', margin: [0, 0, 0, 12] },
      { text: 'Visit us online at: www.LoomandPage.com', style: 'copyright', margin: [0, 0, 0, 12] },
      { text: 'First Edition: January 2026', style: 'copyright', color: '#777777' }
    ]
  });
  
  // Force page break for ToC
  contentArray.push({ text: '', pageBreak: 'after' });
  
  // --- 3. TABLE OF CONTENTS ---
  contentArray.push({ text: 'Table of Contents', style: 'h1', margin: [0, 50, 0, 40] });
  
  tableOfContents.forEach((ch) => {
    contentArray.push({
      columns: [
        { text: `Chapter ${ch.chapter}:`, width: 80, style: 'tocEntry' },
        { text: ch.title, width: '*', style: 'tocEntry', bold: true }
      ],
      margin: [20, 6, 20, 6]
    });
  });
  
  contentArray.push({ text: '', pageBreak: 'after' });
  
  // --- 4. CHAPTER BLOCKS ---
  // Group blocks by chapter
  const blocksByChapter = new Map<number, typeof blocks>();
  (blocks || []).forEach(block => {
    const chapterBlocks = blocksByChapter.get(block.chapter_number) || [];
    chapterBlocks.push(block);
    blocksByChapter.set(block.chapter_number, chapterBlocks);
  });
  
  // Process each chapter
  const chapters = Array.from(blocksByChapter.keys()).sort((a, b) => a - b);
  console.log(`[BlockPDF] Processing ${chapters.length} chapters`);
  
  for (let i = 0; i < chapters.length; i++) {
    const chapterNum = chapters[i];
    const chapterBlocks = blocksByChapter.get(chapterNum) || [];
    
    console.log(`[BlockPDF] Chapter ${chapterNum}: ${chapterBlocks.length} blocks`);
    
    // Process each block
    for (const block of chapterBlocks) {
      const typedBlock: PageBlock = {
        id: block.id,
        book_id: block.book_id,
        chapter_number: block.chapter_number,
        page_order: block.page_order,
        block_type: block.block_type as PageBlock['block_type'],
        content: block.content as any,
        image_url: block.image_url || undefined
      };
      
      const blockContent = await blockToPdfContent(typedBlock, imageMap);
      contentArray.push(...blockContent);
      
      // Add page break after chapter_title for clean layout
      if (block.block_type === 'chapter_title') {
        contentArray.push({ text: '', pageBreak: 'after' });
      }
    }
    
    // Page break between chapters (except last)
    if (i < chapters.length - 1) {
      contentArray.push({ text: '', pageBreak: 'after' });
    }
  }
  
  // Build document definition
  const docDefinition: any = {
    info: {
      title: displayTitle || title,
      author: 'Loom & Page',
      creator: 'Loom & Page - www.LoomandPage.com',
    },
    pageSize: { width: 432, height: 648 }, // 6x9 inches at 72 DPI
    pageMargins: [63, 54, 45, 54], // 0.875" gutter, 0.625" other margins
    
    footer: (currentPage: number) => {
      // No footer on title page or copyright page
      if (currentPage <= 2) return null;
      return { 
        text: `${currentPage}`, 
        alignment: 'center', 
        fontSize: 9, 
        color: '#888888',
        margin: [0, 15, 0, 0] 
      };
    },
    
    content: contentArray,
    styles
  };
  
  // Generate PDF
  console.log('[BlockPDF] Creating document...');
  
  if (returnBlob) {
    // Return as Blob for ZIP bundling
    return new Promise<Blob>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PDF generation timed out after 120 seconds'));
      }, 120000);
      
      try {
        pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => {
          clearTimeout(timeout);
          console.log('[BlockPDF] Blob generated:', blob.size, 'bytes');
          resolve(blob);
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  } else {
    // Download directly
    pdfMake.createPdf(docDefinition).download(`${title.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
    console.log('[BlockPDF] Download initiated.');
  }
};
