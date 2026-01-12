/**
 * Clean PDF Generator - Browser Print Method for Amazon KDP Compliance
 * 
 * This approach opens a new browser window with formatted book content
 * and triggers the native print dialog for high-quality PDF output.
 * 
 * Page flow:
 * - Page 1: Title Page (cover image + title + subtitle)
 * - Page 2: Table of Contents
 * - Page 3+: Chapters (each starts on a new page)
 * 
 * KDP Specifications:
 * - Page size: 6in x 9in (standard paperback)
 * - Margins: 0.75in all sides
 * - Font: Times New Roman, 12pt
 * - Images preserved with proper scaling
 */

import { BookData, ChapterInfo } from "@/lib/bookTypes";

interface CleanPDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
}

/**
 * Clean markdown of special formatting markers
 * Preserves essential content while removing UI-specific elements
 */
const cleanMarkdown = (text: string): string => {
  return text
    .replace(/^```(?:markdown|json)?\s*$/gim, "")
    .replace(/```$/gim, "")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/---+/g, "")
    .replace(/\[PRO-TIP:\s*([^\]]+)\]/gi, '<div class="pro-tip"><strong>💡 Pro Tip:</strong> $1</div>')
    .replace(/^\s*[-*]\s*$/gm, "")
    .trim();
};

/**
 * Convert markdown to print-ready HTML
 */
const markdownToHTML = (content: string): string => {
  const lines = cleanMarkdown(content).split("\n");
  let html = "";
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      continue;
    }

    // Markdown image: ![alt](url)
    const markdownImageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (markdownImageMatch) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      const alt = markdownImageMatch[1] || "Image";
      const url = markdownImageMatch[2];
      html += `<figure class="book-image"><img src="${url}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
      continue;
    }

    // Skip [IMAGE: prompt] markers (prompts, not actual images)
    if (/^\[IMAGE:\s*[^\]]+\]$/i.test(trimmed)) {
      continue;
    }

    // Headers
    if (trimmed.startsWith("#### ")) {
      if (inList) { html += listType === "ol" ? "</ol>" : "</ul>"; inList = false; listType = null; }
      html += `<h5>${trimmed.slice(5)}</h5>`;
    } else if (trimmed.startsWith("### ")) {
      if (inList) { html += listType === "ol" ? "</ol>" : "</ul>"; inList = false; listType = null; }
      html += `<h4>${trimmed.slice(4)}</h4>`;
    } else if (trimmed.startsWith("## ")) {
      if (inList) { html += listType === "ol" ? "</ol>" : "</ul>"; inList = false; listType = null; }
      html += `<h3>${trimmed.slice(3)}</h3>`;
    } else if (trimmed.startsWith("# ")) {
      if (inList) { html += listType === "ol" ? "</ol>" : "</ul>"; inList = false; listType = null; }
      html += `<h2>${trimmed.slice(2)}</h2>`;
    }
    // Unordered list
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList || listType !== "ul") {
        if (inList) html += listType === "ol" ? "</ol>" : "</ul>";
        html += "<ul>";
        inList = true;
        listType = "ul";
      }
      html += `<li>${trimmed.slice(2)}</li>`;
    }
    // Ordered list
    else if (/^\d+\.\s/.test(trimmed)) {
      if (!inList || listType !== "ol") {
        if (inList) html += listType === "ol" ? "</ol>" : "</ul>";
        html += "<ol>";
        inList = true;
        listType = "ol";
      }
      html += `<li>${trimmed.replace(/^\d+\.\s/, "")}</li>`;
    }
    // Blockquote
    else if (trimmed.startsWith("> ")) {
      if (inList) { html += listType === "ol" ? "</ol>" : "</ul>"; inList = false; listType = null; }
      html += `<blockquote>${trimmed.slice(2)}</blockquote>`;
    }
    // Default: paragraph
    else {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      html += `<p>${trimmed}</p>`;
    }
  }

  if (inList) {
    html += listType === "ol" ? "</ol>" : "</ul>";
  }

  return html;
};

/**
 * Generate print-ready CSS for KDP compliance
 */
const generatePrintStyles = (): string => {
  return `
    @page {
      size: 6in 9in;
      margin: 0.75in;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Times New Roman', Times, Georgia, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: black;
      background: white;
    }

    /* Title Page */
    .title-page {
      page-break-after: always;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 2in 0.5in;
    }

    .title-page .cover-image {
      max-width: 4in;
      max-height: 5in;
      margin-bottom: 1in;
      object-fit: contain;
    }

    .title-page h1 {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 0.5in;
      line-height: 1.2;
    }

    .title-page .subtitle {
      font-size: 14pt;
      font-style: italic;
      color: #444;
      margin-bottom: 1in;
    }

    .title-page .footer {
      font-size: 10pt;
      color: #666;
      position: absolute;
      bottom: 1in;
    }

    /* Table of Contents */
    .toc-page {
      page-break-after: always;
      padding-top: 1in;
    }

    .toc-page h2 {
      font-size: 20pt;
      text-align: center;
      margin-bottom: 0.75in;
      border-bottom: 2px solid black;
      padding-bottom: 0.25in;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 0.15in 0;
      border-bottom: 1px dotted #999;
      font-size: 12pt;
    }

    .toc-item .chapter-title {
      flex: 1;
    }

    .toc-item .page-num {
      color: #666;
      margin-left: 0.25in;
    }

    /* Chapter Pages */
    .chapter {
      page-break-before: always;
    }

    .chapter-header {
      text-align: center;
      margin-bottom: 0.5in;
      padding-top: 0.5in;
    }

    .chapter-header .chapter-label {
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.15in;
      color: #666;
      margin-bottom: 0.25in;
    }

    .chapter-header h2 {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 0.25in;
    }

    .chapter-header .divider {
      width: 1in;
      height: 2px;
      background: black;
      margin: 0 auto;
    }

    .chapter-content h2 {
      font-size: 16pt;
      font-weight: bold;
      margin: 0.4in 0 0.2in 0;
    }

    .chapter-content h3 {
      font-size: 14pt;
      font-weight: bold;
      margin: 0.35in 0 0.15in 0;
    }

    .chapter-content h4 {
      font-size: 13pt;
      font-weight: bold;
      margin: 0.3in 0 0.1in 0;
    }

    .chapter-content h5 {
      font-size: 12pt;
      font-weight: bold;
      margin: 0.25in 0 0.1in 0;
    }

    .chapter-content p {
      text-align: justify;
      text-indent: 0.25in;
      margin-bottom: 0.15in;
    }

    .chapter-content p:first-of-type {
      text-indent: 0;
    }

    .chapter-content ul, 
    .chapter-content ol {
      margin: 0.2in 0 0.2in 0.5in;
    }

    .chapter-content li {
      margin-bottom: 0.1in;
    }

    .chapter-content blockquote {
      margin: 0.3in 0.5in;
      padding-left: 0.25in;
      border-left: 3px solid #666;
      font-style: italic;
      color: #444;
    }

    .chapter-content .pro-tip {
      background: #f5f5f5;
      border-left: 4px solid #333;
      padding: 0.2in;
      margin: 0.3in 0;
      font-size: 11pt;
    }

    .chapter-content .book-image {
      text-align: center;
      margin: 0.4in 0;
      page-break-inside: avoid;
    }

    .chapter-content .book-image img {
      max-width: 100%;
      max-height: 4in;
      object-fit: contain;
    }

    .chapter-content .book-image figcaption {
      font-size: 10pt;
      font-style: italic;
      color: #666;
      margin-top: 0.1in;
    }

    /* Print-specific overrides */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .title-page {
        page-break-after: always;
      }

      .toc-page {
        page-break-after: always;
      }

      .chapter {
        page-break-before: always;
      }

      .book-image {
        page-break-inside: avoid;
      }
    }

    /* Screen preview styling */
    @media screen {
      body {
        max-width: 6in;
        margin: 0 auto;
        padding: 0.75in;
        background: #f0f0f0;
      }

      .title-page,
      .toc-page,
      .chapter {
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        margin-bottom: 0.5in;
        padding: 0.75in;
      }
    }
  `;
};

/**
 * Main PDF generation function using browser print
 */
export const generateCleanPDF = async ({ topic, bookData, coverImageUrl }: CleanPDFOptions): Promise<void> => {
  const displayTitle = bookData.displayTitle || bookData.title || `${topic} Guide`;
  const subtitle = bookData.subtitle || "A Comprehensive Guide";

  console.log("[CleanPDF] Starting browser print generation...");
  console.log("[CleanPDF] Title:", displayTitle);

  // Build chapters array
  const chapters: { number: number; title: string; content: string }[] = [];
  const chapterContents = [
    bookData.chapter1Content,
    bookData.chapter2Content,
    bookData.chapter3Content,
    bookData.chapter4Content,
    bookData.chapter5Content,
    bookData.chapter6Content,
    bookData.chapter7Content,
    bookData.chapter8Content,
    bookData.chapter9Content,
    bookData.chapter10Content,
  ];

  chapterContents.forEach((content, idx) => {
    if (!content) return;
    const tocEntry = bookData.tableOfContents?.find((ch: ChapterInfo) => ch.chapter === idx + 1);
    chapters.push({
      number: idx + 1,
      title: tocEntry?.title || `Chapter ${idx + 1}`,
      content,
    });
  });

  console.log("[CleanPDF] Total chapters:", chapters.length);

  // Build HTML content
  const coverImageHtml = coverImageUrl 
    ? `<img src="${coverImageUrl}" alt="Book Cover" class="cover-image" />`
    : '';

  const titlePageHtml = `
    <div class="title-page">
      ${coverImageHtml}
      <h1>${displayTitle}</h1>
      <p class="subtitle">${subtitle}</p>
      <p class="footer">Generated by Loom • ${new Date().getFullYear()}</p>
    </div>
  `;

  const tocItemsHtml = chapters
    .map((ch, idx) => `
      <div class="toc-item">
        <span class="chapter-title">Chapter ${ch.number}: ${ch.title}</span>
        <span class="page-num">${idx + 3}</span>
      </div>
    `)
    .join("");

  const tocPageHtml = `
    <div class="toc-page">
      <h2>Table of Contents</h2>
      ${tocItemsHtml}
    </div>
  `;

  const chaptersHtml = chapters
    .map((ch) => `
      <div class="chapter">
        <div class="chapter-header">
          <p class="chapter-label">Chapter ${ch.number}</p>
          <h2>${ch.title}</h2>
          <div class="divider"></div>
        </div>
        <div class="chapter-content">
          ${markdownToHTML(ch.content)}
        </div>
      </div>
    `)
    .join("");

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${displayTitle} - PDF</title>
      <style>${generatePrintStyles()}</style>
    </head>
    <body>
      ${titlePageHtml}
      ${tocPageHtml}
      ${chaptersHtml}
    </body>
    </html>
  `;

  // Open new window and inject content
  const printWindow = window.open('', '_blank', 'width=816,height=1056');
  
  if (!printWindow) {
    console.error("[CleanPDF] Failed to open print window - popup blocked?");
    alert("Please allow popups to generate the PDF. Then try again.");
    return;
  }

  printWindow.document.write(fullHtml);
  printWindow.document.close();

  // Wait for images to load, then trigger print
  const images = printWindow.document.querySelectorAll('img');
  const imageCount = images.length;
  
  console.log(`[CleanPDF] Waiting for ${imageCount} images to load...`);

  if (imageCount === 0) {
    // No images, print immediately after a short delay for rendering
    setTimeout(() => {
      console.log("[CleanPDF] No images, triggering print...");
      printWindow.focus();
      printWindow.print();
    }, 500);
  } else {
    // Wait for all images to load (with timeout fallback)
    let loadedCount = 0;
    let printTriggered = false;

    const triggerPrint = () => {
      if (printTriggered) return;
      printTriggered = true;
      console.log("[CleanPDF] Images loaded, triggering print...");
      printWindow.focus();
      printWindow.print();
    };

    const handleImageLoad = () => {
      loadedCount++;
      console.log(`[CleanPDF] Image ${loadedCount}/${imageCount} loaded`);
      if (loadedCount >= imageCount) {
        triggerPrint();
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        handleImageLoad();
      } else {
        img.onload = handleImageLoad;
        img.onerror = () => {
          console.warn("[CleanPDF] Image failed to load, continuing...");
          handleImageLoad();
        };
      }
    });

    // Fallback: trigger print after 5 seconds regardless
    setTimeout(() => {
      if (!printTriggered) {
        console.warn("[CleanPDF] Image load timeout, triggering print anyway...");
        triggerPrint();
      }
    }, 5000);
  }
};
