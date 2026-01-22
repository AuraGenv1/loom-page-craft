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
    .replace(/^### (.*$)/gim, '<h3 class="chapter-h3">$1</h3>')
    // Header 2
    .replace(/^## (.*$)/gim, '<h2 class="chapter-h2">$1</h2>')
    // Header 1
    .replace(/^# (.*$)/gim, '<h1 class="chapter-h2">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Images
    .replace(/!\[(.*?)\]\((.*?)\)/gim, (match, alt, url) => {
      return `<div class="image-container break-inside-avoid"><img src="${url}" alt="${alt}" crossorigin="anonymous" /></div>`;
    })
    // Bullet Points
    .replace(/^\s*[-*]\s+(.*)$/gim, '<ul class="bullet-list"><li>$1</li></ul>');

  // Fix adjacent lists (merge <ul> tags)
  html = html.replace(/<\/ul>\s*<ul[^>]*>/gim, '');

  // Pro-Tips (The Onyx Box)
  html = html.replace(/^> (.*$)/gim, (match, content) => {
    const cleanContent = content.replace(/^PRO-TIP:?\s*/i, '').trim();
    return `
      <div class="pro-tip-box break-inside-avoid">
        <div class="pro-tip-flex">
          <div class="pro-tip-icon">
            ${getKeyIconSvg()}
          </div>
          <div>
            <p class="pro-tip-label">PRO TIP</p>
            <p class="pro-tip-content">
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
    if (line.trim() === '') return '<div class="spacer"></div>';
    if (line.startsWith('<')) return line; // Already HTML
    return `<p class="body-text">${line}</p>`;
  });

  return processedLines.join('\n');
};

export const generateCleanPDF = async ({ 
  topic, 
  bookData, 
  isKdpManuscript = false,
  returnBlob = false,
}: GeneratePDFOptions): Promise<Blob | void> => {
  
  // Clean up any previous (stuck) container to avoid capturing an empty/old node
  const existing = document.getElementById('pdf-generation-container');
  if (existing?.parentElement) existing.parentElement.removeChild(existing);

  // 1. Create the container
  // FIX: Use 'absolute' + 'z-index: 99999' to ensure it sits ON TOP of the app and is rendered.
  // Using 'fixed' or negative z-index causes blank pages in many browsers.
  const container = document.createElement('div');
  container.id = 'pdf-generation-container';
  container.style.width = '6in'; 
  container.style.padding = '0.75in'; // Margins
  // Keep it visibly rendered at the viewport origin during capture.
  // This avoids browser “offscreen paint” optimizations that can yield a blank first page.
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '99999'; // Visible on top
  container.style.background = 'white';
  container.style.color = 'black';
  container.style.visibility = 'visible';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  
  // 2. Inject Comprehensive CSS
  const styleBlock = document.createElement('style');
  styleBlock.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap');
    
    #pdf-generation-container {
      font-family: 'Playfair Display', Georgia, serif;
      box-sizing: border-box;
    }
    
    #pdf-generation-container * {
      box-sizing: border-box;
    }
    
    .break-after-always { page-break-after: always; }
    .break-before-always { page-break-before: always; }
    .break-inside-avoid { page-break-inside: avoid; }
    
    /* Typography */
    .text-center { text-align: center; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .font-bold { font-weight: 700; }
    
    /* Title Page */
    .title-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 8.5in; 
      text-align: center;
    }
    .main-title {
      font-size: 32pt;
      font-weight: 700;
      margin-bottom: 1rem;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .subtitle {
      font-size: 14pt;
      font-style: italic;
      color: #555;
      margin-bottom: 2rem;
    }
    .branding {
      font-size: 10pt;
      letter-spacing: 0.2em;
      color: #999;
      margin-top: auto;
    }

    /* Copyright Page */
    .copyright-page {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 8.5in;
      text-align: left;
      font-size: 9pt;
      color: #666;
      line-height: 1.6;
    }

    /* Table of Contents */
    .toc-title {
      font-size: 18pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 2rem;
    }
    .toc-item {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #eee;
      padding-bottom: 4px;
      margin-bottom: 8px;
      font-size: 11pt;
    }

    /* Chapters */
    .chapter-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .chapter-label {
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #888;
      margin-bottom: 0.5rem;
    }
    .chapter-title {
      font-size: 24pt;
      font-weight: 700;
      margin-bottom: 1rem;
      line-height: 1.2;
    }
    .divider {
      width: 50px;
      height: 2px;
      background-color: #ddd;
      margin: 0 auto 2rem auto;
    }

    /* Content Styling */
    .body-text {
      font-size: 11.5pt;
      line-height: 1.6;
      margin-bottom: 1rem;
      text-align: justify;
      color: #1a1a1a;
    }
    .chapter-h2 {
      font-size: 16pt;
      font-weight: 700;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: #000;
    }
    .chapter-h3 {
      font-size: 13pt;
      font-weight: 600;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      color: #333;
    }
    
    /* Bullet Points */
    .bullet-list {
      list-style-type: disc;
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }
    .bullet-list li {
      font-size: 11.5pt;
      margin-bottom: 0.25rem;
    }

    /* Images */
    .image-container {
      margin: 1.5rem 0;
      display: flex;
      justify-content: center;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      border: 1px solid #eee;
    }

    /* Onyx Pro-Tip Box */
    .pro-tip-box {
      margin: 1.5rem 0;
      padding: 1rem;
      background-color: white;
      border-left: 4px solid black;
    }
    .pro-tip-flex {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
    }
    .pro-tip-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .pro-tip-label {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
      color: black;
    }
    .pro-tip-content {
      font-size: 11pt;
      font-style: italic;
      color: #444;
      line-height: 1.5;
    }
    .spacer { height: 1rem; }
  `;
  container.appendChild(styleBlock);
  document.body.appendChild(container);

  // 3. Build Content
  let htmlContent = '';

  // Title Page
  htmlContent += `
    <div class="title-page break-after-always">
      <div>
        <h1 class="main-title">${bookData.displayTitle || topic}</h1>
        ${bookData.subtitle ? `<p class="subtitle">${bookData.subtitle}</p>` : ''}
      </div>
      <div>
        <p class="branding">LOOM & PAGE</p>
      </div>
    </div>
  `;

  // Copyright Page
  htmlContent += `
    <div class="copyright-page break-after-always">
      <div>
        <p>Copyright © ${new Date().getFullYear()}</p>
        <p>All rights reserved.</p>
        <p>Published by Loom & Page</p>
        <p>www.LoomandPage.com</p>
        <p style="margin-top: 1rem;">Book generated by Loom & Page AI Engine.</p>
        <p>First Edition: ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  `;

  // TOC
  htmlContent += `
    <div class="break-after-always">
      <h2 class="toc-title">Table of Contents</h2>
      <div>
        ${(bookData.tableOfContents || []).map(ch => `
          <div class="toc-item">
            <span>Chapter ${ch.chapter}: ${ch.title}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Chapters
  const chapterKeys = Object.keys(bookData).filter(k => k.startsWith('chapter') && k.endsWith('Content'));
  const chapters = bookData.tableOfContents || chapterKeys.map((k, i) => ({ chapter: i + 1, title: `Chapter ${i + 1}` }));

  chapters.forEach((ch, index) => {
    const contentKey = `chapter${ch.chapter}Content` as keyof BookData;
    const rawContent = (bookData[contentKey] as string) || "";
    const isLastChapter = index === chapters.length - 1;
    
    htmlContent += `
      <div class="${isLastChapter ? '' : 'break-after-always'}">
        <div class="chapter-header">
          <p class="chapter-label">Chapter ${ch.chapter}</p>
          <h2 class="chapter-title">${ch.title}</h2>
          <div class="divider"></div>
        </div>
        
        <div>
          ${parseMarkdownToHtml(rawContent)}
        </div>
      </div>
    `;
  });

  const contentWrapper = document.createElement('div');
  contentWrapper.innerHTML = htmlContent;
  container.appendChild(contentWrapper);

  // 4. Wait for images to load
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length > 0) {
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => { 
        img.onload = resolve; 
        img.onerror = resolve; 
      });
    }));
  }

  // FORCE A LAYOUT REFLOW - wait for fonts and layout stability
  await new Promise(resolve => setTimeout(resolve, 500));

  // Measure after layout settles (use element scroll size for reliable capture)
  const captureWidthPx = Math.max(1, Math.ceil(container.scrollWidth));
  const captureHeightPx = Math.max(1, Math.ceil(container.scrollHeight));

  // 5. Configure html2pdf
  const opt = {
    margin: [0.75, 0.6, 0.75, 0.6] as [number, number, number, number], 
    filename: `${topic.replace(/[^a-z0-9]/gi, '_')}_Manuscript.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      useCORS: true, 
      letterRendering: true,
      scrollX: 0,
      scrollY: 0,
      width: captureWidthPx,
      height: captureHeightPx,
      windowWidth: captureWidthPx,
      windowHeight: captureHeightPx,
      backgroundColor: '#ffffff',
      logging: false
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
    // Cleanup if fail
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};
