import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { BookData } from "./bookTypes";

interface GeneratePDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
}

// --- Helper: Fetch Image with Fallback ---
// This attempts to fetch the image. If it fails (CORS/Security),
// it returns null so the PDF can continue without crashing.
const fetchImageSafe = async (url: string): Promise<string | null> => {
  if (!url) return null;
  
  // If already a data URL, return it directly
  if (url.startsWith('data:')) return url;
  
  try {
    // 1. Try fetching via our Proxy (Best for security)
    const { data, error } = await supabase.functions.invoke("fetch-image-data-url", {
      body: { url },
    });
    if (!error && data?.dataUrl) return data.dataUrl;

    // 2. Fallback: Try direct fetch (works for some domains)
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("PDF Image Load Failed (Skipping Image):", err);
    return null;
  }
};

export const generateCleanPDF = async (options: GeneratePDFOptions) => {
  const { topic, bookData, coverImageUrl } = options;
  
  console.log("Starting PDF Generation...");

  // 1. Setup Document (6x9 inch - Amazon Standard)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "in",
    format: [6, 9],
  });

  const pageWidth = 6;
  const pageHeight = 9;
  const margin = 0.75; // Gutter margin
  const contentWidth = pageWidth - margin * 1.5; // Adjust for gutter

  // --- COVER PAGE ---
  if (coverImageUrl) {
    const base64Cover = await fetchImageSafe(coverImageUrl);
    if (base64Cover) {
      try {
        doc.addImage(base64Cover, "JPEG", 0, 0, pageWidth, pageHeight);
      } catch (e) {
        console.error("Error drawing cover:", e);
      }
    }
  }

  // Title Overlay (Black Band)
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 3, pageWidth, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.text(bookData.title.toUpperCase(), pageWidth / 2, 4, { align: "center", maxWidth: contentWidth });

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(bookData.subtitle || "A Curated Guide", pageWidth / 2, 4.5, { align: "center" });

  // --- CHAPTERS ---
  const chapters = [
    { content: bookData.chapter1Content, title: bookData.tableOfContents?.[0]?.title || "Chapter 1" },
    { content: bookData.chapter2Content, title: bookData.tableOfContents?.[1]?.title || "Chapter 2" },
    { content: bookData.chapter3Content, title: bookData.tableOfContents?.[2]?.title || "Chapter 3" },
    { content: bookData.chapter4Content, title: bookData.tableOfContents?.[3]?.title || "Chapter 4" },
    { content: bookData.chapter5Content, title: bookData.tableOfContents?.[4]?.title || "Chapter 5" },
    { content: bookData.chapter6Content, title: bookData.tableOfContents?.[5]?.title || "Chapter 6" },
    { content: bookData.chapter7Content, title: bookData.tableOfContents?.[6]?.title || "Chapter 7" },
    { content: bookData.chapter8Content, title: bookData.tableOfContents?.[7]?.title || "Chapter 8" },
    { content: bookData.chapter9Content, title: bookData.tableOfContents?.[8]?.title || "Chapter 9" },
    { content: bookData.chapter10Content, title: bookData.tableOfContents?.[9]?.title || "Chapter 10" },
  ].filter(ch => ch.content);

  for (const [index, chapter] of chapters.entries()) {
    doc.addPage();

    // Chapter Title
    doc.setTextColor(0, 0, 0);
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.text(`Chapter ${index + 1}: ${chapter.title}`, margin, margin + 0.5);

    let yPosition = margin + 1;

    // Chapter Text - strip markdown and clean up
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    // Clean markdown from content for PDF
    const cleanContent = (chapter.content || '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // Remove markdown images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/#{1,6}\s/g, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/`([^`]+)`/g, '$1') // Remove code
      .replace(/^\s*[-*+]\s/gm, '• ') // Convert list items
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .trim();

    // Split text to fit page
    const splitText = doc.splitTextToSize(cleanContent, contentWidth);
    
    // Handle multi-page content
    const lineHeight = 0.18;
    const maxLinesPerPage = Math.floor((pageHeight - yPosition - margin) / lineHeight);
    
    let currentLine = 0;
    while (currentLine < splitText.length) {
      if (currentLine > 0) {
        doc.addPage();
        yPosition = margin;
      }
      
      const linesToPrint = splitText.slice(currentLine, currentLine + maxLinesPerPage);
      doc.text(linesToPrint, margin, yPosition);
      currentLine += maxLinesPerPage;
    }
  }

  // Save File
  const filename = topic.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`${filename}_guide.pdf`);
};
