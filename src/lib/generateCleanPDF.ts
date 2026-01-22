import { BookData } from './bookTypes';
import * as pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import { supabase } from '@/integrations/supabase/client';

// Register fonts
// @ts-ignore
pdfMake.vfs = pdfFonts.pdfMake.vfs;

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  includeCoverPage?: boolean;
}

// 1. ASSETS
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 2. HELPER: Image Fetcher
const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url) return TRANSPARENT_PIXEL;
  try {
    const { data, error } = await supabase.functions.invoke('fetch-image-data-url', {
      body: { url },
    });
    if (!error && data?.dataUrl) return data.dataUrl;
  } catch (e) {
    console.warn('Image fetch failed:', e);
  }
  return TRANSPARENT_PIXEL;
};

// 3. HELPER: Robust Markdown Parser
// Parses **bold** and *italics* properly without leaving artifacts
const parseParagraphText = (text: string): any[] => {
  // Regex to capture **bold** and *italics*
  // Group 1: **bold**
  // Group 2: *italics*
  // Group 3: Normal text
  const parts = [];
  const regex = /(\*\*(.*?)\*\*)|(\*(.*?)\*)|([^*]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      // Bold match (**text**)
      parts.push({ text: match[2], bold: true });
    } else if (match[3]) {
      // Italic match (*text*)
      parts.push({ text: match[4], italics: true });
    } else if (match[0]) {
      // Normal text
      parts.push({ text: match[0] });
    }
  }
  return parts.length > 0 ? parts : [{ text: text }];
};

const parseMarkdownToPdfMake = (text: string, imageMap: Map<string, string>) => {
  const content: any[] = [];
  const lines = text.split('\n');

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    // --- Headers ---
    if (line.startsWith('### ')) {
      content.push({ text: line.replace('### ', ''), style: 'h3' });
    } else if (line.startsWith('## ')) {
      content.push({ text: line.replace('## ', ''), style: 'h2' });
    } else if (line.startsWith('# ')) {
      content.push({ text: line.replace('# ', ''), style: 'h1' });
    } 
    // --- Images ---
    else if (line.match(/!\[.*?\]\((.*?)\)/)) {
      const match = line.match(/!\[.*?\]\((.*?)\)/);
      if (match && match[1]) {
        const url = match[1];
        const base64 = imageMap.get(url) || TRANSPARENT_PIXEL;
        content.push({
          image: base64,
          width: 300, // Constrain width
          alignment: 'center',
          style: 'imageWrapper'
        });
      }
    }
    // --- Bullets ---
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      const cleanLine = line.replace(/^[-*] /, '').replace(/\*\*/g, '');
      content.push({
        ul: [cleanLine],
        style: 'bullet'
      });
    }
    // --- Pro-Tips ---
    else if (line.startsWith('>')) {
      const cleanText = line.replace(/^>\s*/, '').replace(/PRO-TIP:?/i, '').replace(/\*\*/g, '').trim();
      content.push({
        stack: [
          { text: 'PRO TIP', style: 'proTipLabel' },
          { text: cleanText, style: 'proTipBody' }
        ],
        style: 'proTipBox'
      });
    }
    // --- Paragraphs ---
    else {
      content.push({ 
        text: parseParagraphText(line), 
        style: 'body' 
      });
    }
  });

  return content;
};

export const generateCleanPDF = async ({ topic, bookData }: GeneratePDFOptions): Promise<void> => {
  console.log('Starting PDF Generation...');

  // A. Pre-fetch Images
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = bookData.tableOfContents || chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));
  
  const allContent = chapters.map((ch: any) => bookData[`chapter${ch.chapter}Content`] || '').join('\n');
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(allContent)) !== null) {
    if (match[1]) urls.push(match[1]);
  }

  const imageMap = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    const b64 = await fetchImageAsBase64(url);
    imageMap.set(url, b64);
  }));

  // B. Build Document Definition
  const docDefinition: any = {
    info: {
      title: bookData.displayTitle || topic,
      author: 'Loom & Page',
    },
    
    // 6x9 Inches = 432x648 points
    pageSize: { width: 432, height: 648 }, 
    pageMargins: [54, 54, 54, 54], // 0.75in margins
    
    defaultStyle: {
      fontSize: 11,
      font: 'Roboto' // Safe default, styled to look serify if possible via italics
    },

    footer: function(currentPage: number, pageCount: number) {
      if (currentPage <= 2) return null; // Skip Title (1) and Copyright (2)
      return { 
        text: `${currentPage}`, 
        alignment: 'center', 
        fontSize: 10, 
        color: '#666',
        margin: [0, 10, 0, 0] 
      };
    },

    content: [],

    styles: {
      h1: { fontSize: 22, bold: true, alignment: 'center', margin: [0, 20, 0, 10], fontFeatures: ['smcp'] }, // Small caps effect
      h2: { fontSize: 16, bold: true, margin: [0, 15, 0, 8] },
      h3: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
      // FIX: Left alignment prevents 'rivers' of white space
      body: { fontSize: 11, lineHeight: 1.4, margin: [0, 0, 0, 8], alignment: 'left' },
      bullet: { fontSize: 11, margin: [0, 2, 0, 2] },
      imageWrapper: { margin: [0, 15, 0, 15] },
      
      titlePageTitle: { fontSize: 28, bold: true, alignment: 'center', margin: [0, 100, 0, 20] },
      titlePageSubtitle: { fontSize: 14, italics: true, alignment: 'center', margin: [0, 0, 0, 60] },
      branding: { fontSize: 9, letterSpacing: 2, alignment: 'center', color: '#888' },
      
      proTipBox: {
        fillColor: '#f5f5f5',
        margin: [0, 15, 0, 15],
        padding: 8
      },
      proTipLabel: { fontSize: 9, bold: true, color: '#000', margin: [5, 5, 0, 2] },
      proTipBody: { fontSize: 10, italics: true, color: '#444', margin: [5, 0, 5, 5] },
      
      copyrightText: { fontSize: 9, color: '#666', margin: [0, 2, 0, 2] }
    }
  };

  // --- 1. TITLE PAGE ---
  docDefinition.content.push(
    { text: (bookData.displayTitle || topic).toUpperCase(), style: 'titlePageTitle' },
    { text: bookData.subtitle || '', style: 'titlePageSubtitle' },
    { text: 'LOOM & PAGE', style: 'branding', pageBreak: 'after' }
  );

  // --- 2. COPYRIGHT PAGE ---
  // FIX: Using absolutePosition to pin text to bottom-left of Page 2
  // This guarantees it never splits across pages.
  // 648 (height) - 54 (margin) - 150 (content height estimate) = ~450 y-position
  docDefinition.content.push({
    stack: [
      { text: `Copyright © ${new Date().getFullYear()}`, style: 'copyrightText' },
      { text: 'All rights reserved.', style: 'copyrightText' },
      { text: 'No part of this publication may be reproduced without permission.', style: 'copyrightText' },
      { text: 'Published by Loom & Page', style: 'copyrightText' },
      { text: `First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`, style: 'copyrightText' }
    ],
    absolutePosition: { x: 54, y: 500 }, // Pinned to bottom of page 2
    pageBreak: 'after' // Ensure next content starts on Page 3
  });

  // --- 3. TOC ---
  docDefinition.content.push({ text: 'Table of Contents', style: 'h1', margin: [0, 0, 0, 20] });
  bookData.tableOfContents?.forEach((ch: any) => {
    docDefinition.content.push({
      columns: [
        { text: `Chapter ${ch.chapter}`, width: 80, fontSize: 11 },
        { text: ch.title, width: '*', fontSize: 11, bold: true }
      ],
      margin: [0, 5, 0, 5]
    });
  });
  docDefinition.content.push({ text: '', pageBreak: 'after' });

  // --- 4. CHAPTERS ---
  chapters.forEach((ch: any) => {
    docDefinition.content.push(
      { text: `Chapter ${ch.chapter}`, fontSize: 10, alignment: 'center', color: '#888', margin: [0, 40, 0, 10] },
      { text: ch.title, style: 'h1', margin: [0, 0, 0, 30] }
    );

    const rawContent = (bookData[`chapter${ch.chapter}Content`] as string) || '';
    const parsedContent = parseMarkdownToPdfMake(rawContent, imageMap);
    
    docDefinition.content.push(...parsedContent);
    docDefinition.content.push({ text: '', pageBreak: 'after' });
  });

  // Generate
  pdfMake.createPdf(docDefinition).download(`${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`);
};
