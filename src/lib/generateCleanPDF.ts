/**
 * Clean PDF Generator - Dedicated template that ignores website UI
 * Page flow:
 * - Page 1: Cover (image + title)
 * - Page 2: Table of Contents
 * - Page 3+: Chapters (each starts on a new page)
 * 
 * ROBUST MARKDOWN PARSER:
 * - Handles headers (h1, h2, h3, h4)
 * - Handles lists (ul/li, numbered)
 * - Handles images (![alt](url) and [IMAGE: prompt])
 * - Handles paragraphs (fallback for unrecognized lines)
 * - Page breaks between chapters
 */

import { supabase } from "@/integrations/supabase/client";
import { BookData, ChapterInfo } from "@/lib/bookTypes";

// @ts-ignore - html2pdf.js doesn't have TypeScript types
import html2pdf from "html2pdf.js";

interface CleanPDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
  isKdpManuscript?: boolean;
  returnBlob?: boolean;
}

/**
 * Clean markdown of special formatting markers
 * Preserves essential content while removing UI-specific elements
 * FIXED: Now strips stray code block markers that Gemini may leave
 */
const cleanMarkdown = (text: string): string => {
  return text
    // SANITIZATION: Strip stray code block markers (```markdown, ```json, ```)
    .replace(/^```(?:markdown|json)?\s*$/gim, "")
    .replace(/```$/gim, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold -> plain (preserve content)
    .replace(/\*([^*]+)\*/g, "$1") // Italic -> plain (preserve content)
    .replace(/---+/g, "") // Horizontal rules
    .replace(/\[PRO-TIP:\s*([^\]]+)\]/gi, "\n**Pro Tip:** $1\n") // Convert PRO-TIP to styled text
    .replace(/^\s*[-*]\s*$/gm, "") // Empty list items
    .trim();
};

/**
 * ROBUST Markdown to HTML converter
 * - Handles headers (h1-h4)
 * - Handles lists (ul/li, ol/li)
 * - Handles images: ![alt](url) AND [IMAGE: url] patterns
 * - Falls back to <p> for unrecognized lines (never drops content)
 */
const markdownToHTML = (content: string): string => {
  const lines = cleanMarkdown(content).split("\n");
  let html = "";
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines but close any open list
    if (!trimmed) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      continue;
    }

    // Check for Markdown image syntax: ![alt](url) - SUPPORTS Base64 DATA URLs
    const markdownImageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (markdownImageMatch) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      const alt = markdownImageMatch[1] || "Image";
      const url = markdownImageMatch[2];
      // CRITICAL: Handle both regular URLs and Base64 data URLs
      const isBase64 = url.startsWith('data:');
      console.log(`[CleanPDF] Rendering image (${isBase64 ? 'Base64' : 'URL'}): ${url.substring(0, 50)}...`);
      html += `<div style="margin: 20px 0; text-align: center;">
        <img src="${url}" alt="${alt}" style="width: 100%; max-width: 500px; height: auto; object-fit: contain; border-radius: 4px;" ${!isBase64 ? 'crossorigin="anonymous"' : ''} />
      </div>`;
      continue;
    }

    // Check for [IMAGE: url] pattern (custom image marker)
    const imageMarkerMatch = trimmed.match(/^\[IMAGE:\s*([^\]]+)\]$/i);
    if (imageMarkerMatch) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      // This is a prompt, not a URL - skip it for PDF (or show placeholder text)
      // Images should be pre-converted to data URLs before reaching here
      continue;
    }

    // Check for inline images in the middle of text - SUPPORTS Base64 DATA URLs
    const inlineImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    if (inlineImagePattern.test(trimmed) && !trimmed.match(/^!\[/)) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      const processedLine = trimmed.replace(
        inlineImagePattern,
        (_, alt, url) => {
          const isBase64 = url.startsWith('data:');
          return `<img src="${url}" alt="${alt || 'Image'}" style="max-width: 100%; height: auto; vertical-align: middle; margin: 8px 0;" ${!isBase64 ? 'crossorigin="anonymous"' : ''} />`;
        }
      );
      html += `<p style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.7; margin: 0 0 12px 0; color: #333; text-align: justify;">${processedLine}</p>`;
      continue;
    }

    // Headers
    if (trimmed.startsWith("#### ")) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      html += `<h5 style="font-family: Georgia, serif; font-size: 12pt; font-weight: 600; margin: 16px 0 8px 0; color: #1a1a1a;">${trimmed.slice(5)}</h5>`;
    } else if (trimmed.startsWith("### ")) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      html += `<h4 style="font-family: Georgia, serif; font-size: 14pt; font-weight: 600; margin: 20px 0 10px 0; color: #1a1a1a;">${trimmed.slice(4)}</h4>`;
    } else if (trimmed.startsWith("## ")) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      html += `<h3 style="font-family: Georgia, serif; font-size: 16pt; font-weight: 600; margin: 24px 0 12px 0; color: #1a1a1a;">${trimmed.slice(3)}</h3>`;
    } else if (trimmed.startsWith("# ")) {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      html += `<h2 style="font-family: Georgia, serif; font-size: 18pt; font-weight: 600; margin: 28px 0 14px 0; color: #1a1a1a;">${trimmed.slice(2)}</h2>`;
    }
    // Unordered list items
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList || listType !== "ul") {
        if (inList) html += listType === "ol" ? "</ol>" : "</ul>";
        html += '<ul style="margin: 12px 0; padding-left: 24px; list-style-type: disc;">';
        inList = true;
        listType = "ul";
      }
      html += `<li style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; margin-bottom: 6px; color: #333;">${trimmed.slice(2)}</li>`;
    }
    // Ordered list items (1. 2. 3. etc.)
    else if (/^\d+\.\s/.test(trimmed)) {
      if (!inList || listType !== "ol") {
        if (inList) html += listType === "ol" ? "</ol>" : "</ul>";
        html += '<ol style="margin: 12px 0; padding-left: 24px; list-style-type: decimal;">';
        inList = true;
        listType = "ol";
      }
      const content = trimmed.replace(/^\d+\.\s/, "");
      html += `<li style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; margin-bottom: 6px; color: #333;">${content}</li>`;
    }
    // Default: treat as paragraph (NEVER drop content)
    else {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = null;
      }
      // Handle bold text within paragraphs
      const processedText = trimmed
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html += `<p style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.7; margin: 0 0 12px 0; color: #333; text-align: justify;">${processedText}</p>`;
    }
  }

  // Close any remaining open list
  if (inList) {
    html += listType === "ol" ? "</ol>" : "</ul>";
  }

  return html;
};

// Simple fallback placeholder - a solid color encoded as Base64
const FALLBACK_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIj48cmVjdCBmaWxsPSIjZjBmMGYwIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhLCBzZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIFVuYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==";

/**
 * Load an image with CORS and timeout handling
 * Returns Base64 data URL or fallback on failure
 */
const loadImageAsBase64 = (url: string, timeoutMs: number = 3000): Promise<string> => {
  return new Promise((resolve) => {
    // If already a data URL, return immediately
    if (url.startsWith("data:")) {
      resolve(url);
      return;
    }

    const img = new Image();
    let resolved = false;

    // CRITICAL: Set crossOrigin IMMEDIATELY after creating the Image object
    // This MUST be done BEFORE setting the src attribute to avoid CORS issues
    img.crossOrigin = 'anonymous';

    // Set timeout - if image doesn't load in time, use fallback
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn(`[CleanPDF] Image load timeout (${timeoutMs}ms): ${url.substring(0, 50)}...`);
        resolve(FALLBACK_PLACEHOLDER);
      }
    }, timeoutMs);

    img.onload = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);

      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          console.log(`[CleanPDF] Image converted to Base64: ${dataUrl.substring(0, 50)}...`);
          resolve(dataUrl);
        } else {
          console.warn('[CleanPDF] Canvas context unavailable, using fallback');
          resolve(FALLBACK_PLACEHOLDER);
        }
      } catch (e) {
        console.warn('[CleanPDF] Canvas conversion failed (likely CORS):', e);
        resolve(FALLBACK_PLACEHOLDER);
      }
    };

    img.onerror = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      console.warn(`[CleanPDF] Image failed to load: ${url.substring(0, 50)}...`);
      resolve(FALLBACK_PLACEHOLDER);
    };

    // Set the src AFTER setting crossOrigin and event handlers
    img.src = url;
  });
};

/**
 * Resolve cover image to a safe format for html2pdf
 * If the URL is already a data URL, return it as-is
 * Otherwise, attempt to convert via edge function, then client-side fallback
 * RESILIENT: Returns fallback placeholder on any failure
 */
const resolveCoverImageForPDF = async (url: string): Promise<string> => {
  // If it's already a data URL, it's safe for html2canvas
  if (url.startsWith("data:")) return url;

  try {
    console.log("[CleanPDF] Converting external URL to Base64...");
    
    // First, try edge function for better CORS handling
    const { data, error } = await supabase.functions.invoke("fetch-image-data-url", {
      body: { url },
    });

    if (!error && data?.dataUrl && typeof data.dataUrl === "string" && data.dataUrl.startsWith("data:")) {
      console.log("[CleanPDF] Successfully converted to Base64 via edge function");
      return data.dataUrl;
    }

    // Fallback: try client-side loading with crossOrigin
    console.log("[CleanPDF] Edge function failed, trying client-side conversion...");
    return await loadImageAsBase64(url, 4000);
  } catch (e) {
    console.warn("[CleanPDF] resolveCoverImageForPDF exception:", e);
    // Final fallback: try client-side loading
    try {
      return await loadImageAsBase64(url, 4000);
    } catch {
      return FALLBACK_PLACEHOLDER;
    }
  }
};

export const generateCleanPDF = async ({ topic, bookData, coverImageUrl, isKdpManuscript = false, returnBlob = false }: CleanPDFOptions): Promise<Blob | void> => {
  const displayTitle = bookData.displayTitle || bookData.title || `${topic} Guide`;
  const subtitle = bookData.subtitle || "A Comprehensive Guide";
  const editionYear = bookData.editionYear || new Date().getFullYear();

  console.log("[CleanPDF] Starting PDF generation...");
  console.log("[CleanPDF] Title:", displayTitle);
  console.log("[CleanPDF] Subtitle:", subtitle);
  console.log("[CleanPDF] KDP Manuscript mode:", isKdpManuscript);
  console.log("[CleanPDF] Cover image provided:", !!coverImageUrl);

  // Build chapter content array
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

  console.log("[CleanPDF] Total chapters with content:", chapters.length);

  // DEBUG: Log content lengths
  chapters.forEach((ch, idx) => {
    console.log(`[CleanPDF] Chapter ${ch.number} content length: ${ch.content.length} chars`);
  });

  // Make cover image safe for html2pdf/html2canvas (prevents blank PDFs)
  // The coverImageUrl should already be Base64 from ProgressDownloadButton
  // But we double-check and convert if needed
  // RESILIENT: Always use fallback if conversion fails
  let safeCoverSrc: string = FALLBACK_PLACEHOLDER;
  
  try {
    if (coverImageUrl) {
      if (coverImageUrl.startsWith("data:")) {
        safeCoverSrc = coverImageUrl;
      } else {
        console.log("[CleanPDF] Cover URL is not Base64, attempting conversion...");
        safeCoverSrc = await resolveCoverImageForPDF(coverImageUrl);
      }
    }
  } catch (coverError) {
    console.warn("[CleanPDF] Cover image processing failed, using fallback:", coverError);
    safeCoverSrc = FALLBACK_PLACEHOLDER;
  }

  // Create hidden container for PDF content (must be "visible" to renderer)
  const container = document.createElement("div");
  container.id = "pdf-clean-container";
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm"; // A4 width
  container.style.backgroundColor = "#ffffff";

  // PAGE 1: Cover OR Title Page (depends on isKdpManuscript)
  let coverPage: string;
  
  if (isKdpManuscript) {
    // KDP MANUSCRIPT: Clean title page (no cover image)
    coverPage = `
      <div style="page-break-after: always; min-height: 277mm; position: relative; background: #ffffff; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 60px 40px;">
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <h1 style="font-family: Georgia, serif; font-size: 36pt; font-weight: 700; color: #1a1a1a; margin: 0 0 24px 0; line-height: 1.2; text-transform: uppercase; letter-spacing: 2px;">
            ${displayTitle}
          </h1>
          <p style="font-family: Georgia, serif; font-size: 16pt; font-style: italic; color: #444; margin: 0 0 40px 0;">
            ${subtitle}
          </p>
          <div style="display: inline-block; border: 2px solid #1a1a1a; padding: 8px 24px; margin: 20px 0;">
            <span style="font-family: Georgia, serif; font-size: 12pt; font-weight: 600; color: #1a1a1a; letter-spacing: 1px;">
              ${editionYear} EDITION
            </span>
          </div>
        </div>
        <div style="margin-top: auto; padding-top: 60px;">
          <p style="font-family: Georgia, serif; font-size: 11pt; color: #666; margin: 0;">
            A Loom Publication
          </p>
        </div>
      </div>
    `;
  } else {
    // REGULAR DOWNLOAD: Cover page with image
    coverPage = `
      <div style="page-break-after: always; min-height: 277mm; position: relative; background: #ffffff; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 40px;">
        <div style="width: 100%; max-height: 180mm; overflow: hidden; margin-bottom: 30px; border-radius: 4px;">
          <img src="${safeCoverSrc}" style="width: 100%; height: auto; object-fit: cover;" onerror="this.style.display='none'" />
        </div>
        <h1 style="font-family: Georgia, serif; font-size: 32pt; font-weight: 700; color: #1a1a1a; margin: 0 0 16px 0; line-height: 1.2;">
          ${displayTitle}
        </h1>
        <p style="font-family: Georgia, serif; font-size: 14pt; font-style: italic; color: #666; margin: 0;">
          ${subtitle}
        </p>
        <p style="font-family: Arial, sans-serif; font-size: 10pt; color: #999; position: absolute; bottom: 30px; left: 0; right: 0; text-align: center;">
          Generated by Loom • ${new Date().getFullYear()}
        </p>
      </div>
    `;
  }

  // PAGE 2: Table of Contents (page numbers adjust based on mode)
  const tocStartPage = isKdpManuscript ? 2 : 3; // KDP: Title(1) + TOC(2) + Chapters; Regular: Cover(1) + TOC(2) + Chapters
  const tocItems = chapters
    .map(
      (ch, idx) => `
      <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px dotted #ddd;">
        <span style="font-family: Georgia, serif; font-size: 12pt; color: #333;">
          Chapter ${ch.number}: ${ch.title}
        </span>
        <span style="font-family: Georgia, serif; font-size: 11pt; color: #666;">
          ${idx + tocStartPage}
        </span>
      </div>
    `
    )
    .join("");

  const tocPage = `
    <div style="page-break-after: always; min-height: 277mm; padding: 50px 40px; background: #ffffff;">
      <h2 style="font-family: Georgia, serif; font-size: 24pt; font-weight: 600; color: #1a1a1a; margin: 0 0 40px 0; text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px;">
        Table of Contents
      </h2>
      <div style="max-width: 500px; margin: 0 auto;">
        ${tocItems}
      </div>
    </div>
  `;

  // PAGES 3+: Chapters (each starts on a new page with html2pdf page breaks)
  const chapterPages = chapters
    .map(
      (ch) => {
        const htmlContent = markdownToHTML(ch.content);
        console.log(`[CleanPDF] Chapter ${ch.number} HTML length: ${htmlContent.length} chars`);
        
        return `
          <div class="html2pdf__page-break"></div>
          <div style="min-height: 277mm; padding: 50px 40px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 40px;">
              <p style="font-family: Arial, sans-serif; font-size: 10pt; text-transform: uppercase; letter-spacing: 3px; color: #999; margin: 0 0 12px 0;">
                Chapter ${ch.number}
              </p>
              <h2 style="font-family: Georgia, serif; font-size: 22pt; font-weight: 600; color: #1a1a1a; margin: 0 0 16px 0;">
                ${ch.title}
              </h2>
              <div style="width: 60px; height: 2px; background: #1a1a1a; margin: 0 auto;"></div>
            </div>
            <div style="columns: 1; column-gap: 30px;">
              ${htmlContent}
            </div>
          </div>
        `;
      }
    )
    .join("");

  container.innerHTML = coverPage + tocPage + chapterPages;
  document.body.appendChild(container);

  // DEBUG: Log final HTML length
  console.log("[CleanPDF] Total HTML content length:", container.innerHTML.length, "chars");

  // Wait for rendering to complete (fonts, images, layout)
  console.log("[CleanPDF] Waiting for rendering...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const opt = {
    margin: [10, 10, 10, 10] as [number, number, number, number],
    filename: `${topic.toLowerCase().replace(/\s+/g, "-")}${isKdpManuscript ? '-kdp-manuscript' : '-guide'}.pdf`,
    image: { type: "jpeg" as const, quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: true, // Enable logging for debugging
    },
    jsPDF: {
      unit: "mm" as const,
      format: "a4" as const,
      orientation: "portrait" as const,
    },
    pagebreak: { mode: ['css', 'legacy'] },
  };

  try {
    console.log("[CleanPDF] Generating PDF with html2pdf...");
    
    if (returnBlob) {
      const blob = await html2pdf().set(opt).from(container).output('blob');
      console.log("[CleanPDF] PDF blob generated successfully");
      return blob;
    } else {
      await html2pdf().set(opt).from(container).save();
      console.log("[CleanPDF] PDF saved successfully");
    }
  } finally {
    document.body.removeChild(container);
  }
};

export default generateCleanPDF;
