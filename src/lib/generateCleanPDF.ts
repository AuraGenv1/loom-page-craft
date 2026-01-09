/**
 * Clean PDF Generator - Dedicated template that ignores website UI
 * Page flow:
 * - Page 1: Cover (image + title)
 * - Page 2: Table of Contents
 * - Page 3+: Chapters (each starts on a new page)
 */

import { supabase } from "@/integrations/supabase/client";
import { BookData, ChapterInfo } from "@/lib/bookTypes";

// @ts-ignore - html2pdf.js doesn't have TypeScript types
import html2pdf from "html2pdf.js";

interface CleanPDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
}

const cleanMarkdown = (text: string): string => {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/---+/g, "")
    .replace(/\[IMAGE:[^\]]+\]/gi, "")
    .replace(/\[PRO-TIP:[^\]]+\]/gi, "")
    .replace(/^Pro[- ]?Tip:\s*/gim, "")
    .replace(/^Key Takeaway[s]?:\s*/gim, "")
    .replace(/^Expert Tip:\s*/gim, "")
    .replace(/^Insider Tip:\s*/gim, "")
    .replace(/^\s*[-*]\s*$/gm, "")
    .trim();
};

const markdownToHTML = (content: string): string => {
  const lines = cleanMarkdown(content).split("\n");
  let html = "";
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }

    if (trimmed.startsWith("### ")) {
      html += `<h4 style="font-family: Georgia, serif; font-size: 14pt; font-weight: 600; margin: 20px 0 10px 0; color: #1a1a1a;">${trimmed.slice(4)}</h4>`;
    } else if (trimmed.startsWith("## ")) {
      html += `<h3 style="font-family: Georgia, serif; font-size: 16pt; font-weight: 600; margin: 24px 0 12px 0; color: #1a1a1a;">${trimmed.slice(3)}</h3>`;
    } else if (trimmed.startsWith("# ")) {
      html += `<h2 style="font-family: Georgia, serif; font-size: 18pt; font-weight: 600; margin: 28px 0 14px 0; color: #1a1a1a;">${trimmed.slice(2)}</h2>`;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html += '<ul style="margin: 12px 0; padding-left: 24px;">';
        inList = true;
      }
      html += `<li style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; margin-bottom: 6px; color: #333;">${trimmed.slice(2)}</li>`;
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; margin: 8px 0 8px 24px; color: #333;">${trimmed}</p>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p style="font-family: Georgia, serif; font-size: 11pt; line-height: 1.7; margin: 0 0 12px 0; color: #333; text-align: justify;">${trimmed}</p>`;
    }
  }

  if (inList) html += "</ul>";
  return html;
};

const resolveCoverImageForPDF = async (url: string): Promise<string | null> => {
  // If it's already a data URL, it's safe for html2canvas
  if (url.startsWith("data:")) return url;

  try {
    const { data, error } = await supabase.functions.invoke("fetch-image-data-url", {
      body: { url },
    });

    if (error) {
      console.warn("fetch-image-data-url failed:", error);
      return null;
    }

    if (data?.dataUrl && typeof data.dataUrl === "string" && data.dataUrl.startsWith("data:")) {
      return data.dataUrl;
    }

    return null;
  } catch (e) {
    console.warn("resolveCoverImageForPDF exception:", e);
    return null;
  }
};

export const generateCleanPDF = async ({ topic, bookData, coverImageUrl }: CleanPDFOptions): Promise<void> => {
  const displayTitle = bookData.displayTitle || bookData.title || `${topic} Guide`;
  const subtitle = bookData.subtitle || "A Comprehensive Guide";

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

  // Make cover image safe for html2pdf/html2canvas (prevents blank PDFs)
  let safeCoverSrc: string | null = coverImageUrl ?? null;
  if (safeCoverSrc) {
    safeCoverSrc = await resolveCoverImageForPDF(safeCoverSrc);
  }

  // Create hidden container for PDF content (must be "visible" to renderer)
  const container = document.createElement("div");
  container.id = "pdf-clean-container";
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm"; // A4 width
  container.style.backgroundColor = "#ffffff";

  // PAGE 1: Cover
  const coverPage = `
    <div style="page-break-after: always; min-height: 277mm; position: relative; background: #ffffff; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 40px;">
      ${safeCoverSrc ? `
        <div style="width: 100%; max-height: 180mm; overflow: hidden; margin-bottom: 30px; border-radius: 4px;">
          <img src="${safeCoverSrc}" style="width: 100%; height: auto; object-fit: cover;" referrerpolicy="no-referrer" />
        </div>
      ` : ""}
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

  // PAGE 2: Table of Contents
  const tocItems = chapters
    .map(
      (ch, idx) => `
      <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px dotted #ddd;">
        <span style="font-family: Georgia, serif; font-size: 12pt; color: #333;">
          Chapter ${ch.number}: ${ch.title}
        </span>
        <span style="font-family: Georgia, serif; font-size: 11pt; color: #666;">
          ${idx + 3}
        </span>
      </div>
    `
    )
    .join("");

  const tocPage = `
    <div style="min-height: 277mm; padding: 50px 40px; background: #ffffff;">
      <h2 style="font-family: Georgia, serif; font-size: 24pt; font-weight: 600; color: #1a1a1a; margin: 0 0 40px 0; text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px;">
        Table of Contents
      </h2>
      <div style="max-width: 500px; margin: 0 auto;">
        ${tocItems}
      </div>
    </div>
  `;

  // PAGES 3+: Chapters (each starts on a new page)
  const chapterPages = chapters
    .map(
      (ch) => `
      <div style="page-break-before: always; min-height: 277mm; padding: 50px 40px; background: #ffffff;">
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
          ${markdownToHTML(ch.content)}
        </div>
      </div>
    `
    )
    .join("");

  container.innerHTML = coverPage + tocPage + chapterPages;
  document.body.appendChild(container);

  // Wait for images to load before capturing (prevents blank PDFs)
  const images = container.querySelectorAll('img');
  if (images.length > 0) {
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Continue even if image fails
            }
          })
      )
    );
  }

  // Additional delay for fonts/layout to settle (2 seconds for reliable capture)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const opt = {
    margin: [10, 10, 10, 10] as [number, number, number, number],
    filename: `${topic.toLowerCase().replace(/\s+/g, "-")}-guide.pdf`,
    image: { type: "jpeg" as const, quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true, // Allow cross-origin images
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000, // Wait up to 15s for images
    },
    jsPDF: {
      unit: "mm" as const,
      format: "a4" as const,
      orientation: "portrait" as const,
    },
  };

  try {
    await html2pdf().set(opt).from(container).save();
  } finally {
    document.body.removeChild(container);
  }
};

export default generateCleanPDF;
