import { BookData } from './bookTypes';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
  includeCoverPage?: boolean;
}

// Helper: Exact Key Icon SVG to match Lucide
const getKeyIconSvg = () => {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/>
      <path d="m21 2-9.6 9.6"/>
      <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    </svg>
  `;
};

// Helper: Markdown to HTML parser that matches your Preview styling 1:1
const parseMarkdownToHtml = (text: string) => {
  if (!text) return '';
  
  let html = text
    // Header 3
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-6 mb-2">$1</h3>')
    // Header 2
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>')
    // Header 1
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-10 mb-4">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Images
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (match, alt, url) => {
      // Force crossorigin for PDF capture
      return `<div class="my-4 break-inside-avoid"><img src="${url}" alt="${alt}" crossorigin="anonymous" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" /></div>`;
    })
    // Bullet Points
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul class="list-disc pl-5 my-2"><li>$1</li></ul>');

  // Fix adjacent lists (merge <ul> tags)
  html = html.replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips (The Onyx Box)
  // Replaces "> Text" with the exact HTML structure from ChapterContent.tsx
  html = html.replace(/^> (.*$)/gim, (match, content) => {
    const cleanContent = content.replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div class="pro-tip-box break-inside-avoid my-6" style="border-left: 4px solid #000; background: #fff; padding: 1rem;">
        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
          <div style="flex-shrink: 0; margin-top: 2px;">
            ${getKeyIconSvg()}
          </div>
          <div>
            <p style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.25rem;">PRO TIP</p>
            <p style="font-style: italic; color: #333; font-size: 0.9rem; line-height: 1.6;">
              ${cleanContent}
            </p>
          </div>
        </div>
      </div>
    `;
  });

  // Paragraphs (wrap remaining text)
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim() === '') return '<br/>';
    if (line.startsWith('<')) return line; // Already HTML
    return `<p style="margin-bottom: 0.75rem; line-height: 1.7; text-align: justify;">${line}</p>`;
  });

  return processedLines.join('\n');
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  isKdpManuscript = false,
  returnBlob = false,
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // 1. Create a hidden container that mimics the "Print Preview" page exactly
  const container = document.createElement('div');
  container.className = 'print-container';
  
  // Set dimensions for KDP 6x9
  container.style.width = '6in'; 
  container.style.padding = '0.75in'; // Margins
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.zIndex = '-1000'; // Hide behind content
  container.style.backgroundColor = '#fff';
  container.style.color = '#000';
  container.style.fontFamily = "'Playfair Display', Georgia, serif";
  
  // Inject Tailwind-like utility classes manually to ensure styles persist without full CSS build
  const styleBlock = document.createElement('style');
  styleBlock.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
    
    .print-container { font-family: 'Playfair Display', Georgia, serif; }
    .font-serif { font-family: 'Playfair Display', Georgia, serif; }
    .font-bold { font-weight: 700; }
    .text-center { text-align: center; }
    .text-justify { text-align: justify; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mt-8 { margin-top: 2rem; }
    .mt-10 { margin-top: 2.5rem; }
    .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
    .my-4 { margin-top: 1rem; margin-bottom: 1rem; }
    .my-6 { margin-top: 1.5rem; margin-bottom: 1.5rem; }
    .text-xs { font-size: 0.75rem; line-height: 1.5; }
    .text-sm { font-size: 0.875rem; line-height: 1.5; }
    .text-lg { font-size: 1.125rem; }
    .text-xl { font-size: 1.25rem; }
    .text-2xl { font-size: 1.5rem; }
    .text-3xl { font-size: 1.875rem; }
    .text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
    .border-black { border-color: #000; }
    .border-l-4 { border-left-width: 4px; }
    .bg-white { background-color: #fff; }
    .p-4 { padding: 1rem; }
    .flex { display: flex; }
    .gap-3 { gap: 0.75rem; }
    .break-after-always { page-break-after: always; }
    .break-before-always { page-break-before: always; }
    .break-inside-avoid { page-break-inside: avoid; }
    .list-disc { list-style-type: disc; }
    .pl-5 { padding-left: 1.25rem; }
    .tracking-widest { letter-spacing: 0.1em; }
    
    .title-page {
      min-height: 7.5in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .copyright-page {
      min-height: 7.5in;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    
    .toc-page {
      min-height: 7.5in;
    }
    
    .chapter-page {
      min-height: 7.5in;
    }
    
    .chapter-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .divider {
      width: 2rem;
      height: 1px;
      background: #ccc;
      margin: 1rem auto;
    }
    
    h1, h2, h3 { page-break-after: avoid; }
    .pro-tip-box { page-break-inside: avoid; }
    img { page-break-inside: avoid; max-width: 100%; }
  `;
  container.appendChild(styleBlock);
  document.body.appendChild(container);

  // 2. Build HTML Content
  let htmlContent = '';
  const displayTitle = bookData.displayTitle || topic;

  // --- TITLE PAGE ---
  htmlContent += `
    <div class="title-page break-after-always">
      <div>
        <p class="text-xs uppercase tracking-widest" style="color: #666; margin-bottom: 1rem;">A Complete Guide</p>
        <h1 class="text-4xl font-bold" style="margin-bottom: 1rem;">${displayTitle}</h1>
        ${bookData.subtitle ? `<p class="text-lg italic" style="color: #555;">${bookData.subtitle}</p>` : ''}
      </div>
      <div style="margin-top: 4rem;">
        <p class="text-sm" style="color: #999;">LOOM & PAGE</p>
      </div>
    </div>
  `;

  // --- COPYRIGHT PAGE ---
  htmlContent += `
    <div class="copyright-page break-after-always">
      <div class="text-xs" style="color: #333; line-height: 1.8;">
        <p style="margin-bottom: 0.5rem;">Copyright © ${new Date().getFullYear()}</p>
        <p style="margin-bottom: 0.5rem;">All rights reserved.</p>
        <p style="margin-bottom: 1rem;">Published by Loom & Page</p>
        <p style="margin-bottom: 1rem;">www.LoomandPage.com</p>
        <p style="margin-bottom: 1rem; font-size: 0.7rem; line-height: 1.6;">
          No part of this publication may be reproduced, distributed, or transmitted 
          in any form or by any means, including photocopying, recording, or other 
          electronic or mechanical methods, without the prior written permission of 
          the publisher.
        </p>
        <p style="margin-bottom: 0.5rem;">Book generated by Loom & Page AI Engine.</p>
        <p>First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  `;

  // --- TABLE OF CONTENTS ---
  const chapters = bookData.tableOfContents || [];
  htmlContent += `
    <div class="toc-page break-after-always">
      <h2 class="text-2xl font-bold text-center" style="margin-bottom: 2rem;">Table of Contents</h2>
      <div style="line-height: 2;">
        ${chapters.map(ch => `
          <p style="margin-bottom: 0.5rem;">
            <span style="font-weight: 600;">Chapter ${ch.chapter}:</span> ${ch.title}
          </p>
        `).join('')}
      </div>
    </div>
  `;

  // --- CHAPTERS ---
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const loopSource = chapters.length > 0 ? chapters : chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  loopSource.forEach((ch, index) => {
    const contentKey = `chapter${ch.chapter}Content` as keyof BookData;
    const rawContent = (bookData[contentKey] as string) || "";
    
    const isLastChapter = index === loopSource.length - 1;
    
    htmlContent += `
      <div class="chapter-page ${isLastChapter ? '' : 'break-after-always'}">
        <div class="chapter-header">
          <p class="text-xs uppercase tracking-widest" style="color: #666; margin-bottom: 0.5rem;">Chapter ${ch.chapter}</p>
          <h2 class="text-2xl font-bold">${ch.title}</h2>
          <div class="divider"></div>
        </div>
        
        <div class="chapter-content" style="font-size: 11.5pt; line-height: 1.7;">
          ${parseMarkdownToHtml(rawContent)}
        </div>
      </div>
    `;
  });

  const contentWrapper = document.createElement('div');
  contentWrapper.innerHTML = htmlContent;
  container.appendChild(contentWrapper);

  // 3. Wait for images to load
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => { 
      img.onload = resolve; 
      img.onerror = resolve; 
    });
  }));

  // Small delay for fonts to load
  await new Promise(resolve => setTimeout(resolve, 500));

  // 4. Configure html2pdf
  // 6x9 inches = 152.4mm x 228.6mm
  const opt = {
    margin: [0, 0, 0, 0] as [number, number, number, number], // Padding is handled in container
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2, // High quality scale
      useCORS: true, 
      letterRendering: true,
      logging: false,
      scrollY: 0,
      windowWidth: 800
    },
    jsPDF: { 
      unit: 'in', 
      format: [6, 9] as [number, number], 
      orientation: 'portrait' as const
    },
    pagebreak: { 
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['.pro-tip-box', 'img', 'h2', 'h3', '.break-inside-avoid']
    }
  };

  try {
    if (returnBlob) {
      const pdf = await html2pdf().set(opt).from(container).outputPdf('blob');
      document.body.removeChild(container);
      return pdf;
    } else {
      await html2pdf().set(opt).from(container).save();
      document.body.removeChild(container);
    }
  } catch (err) {
    console.error("PDF Generation Failed:", err);
    document.body.removeChild(container);
  }
};
