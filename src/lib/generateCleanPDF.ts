import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

// --- Helper: Fetch Image with Fallback ---
// This attempts to fetch the image. If it fails (CORS/Security),
// it returns null so the PDF can continue without crashing.
const fetchImageSafe = async (url: string): Promise<string | null> => {
  if (!url) return null;
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

export const generateCleanPDF = async (title: string, subtitle: string, chapters: any[], coverImage: string | null) => {
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
  if (coverImage) {
    const base64Cover = await fetchImageSafe(coverImage);
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
  doc.text(title.toUpperCase(), pageWidth / 2, 4, { align: "center", maxWidth: contentWidth });

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle || "A Curated Guide", pageWidth / 2, 4.5, { align: "center" });

  // --- CHAPTERS ---
  for (const [index, chapter] of chapters.entries()) {
    doc.addPage();

    // Chapter Title
    doc.setTextColor(0, 0, 0);
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.text(`Chapter ${index + 1}: ${chapter.title}`, margin, margin + 0.5);

    let yPosition = margin + 1;

    // Chapter Image
    if (chapter.imageUrl) {
      const chapterImg = await fetchImageSafe(chapter.imageUrl);
      if (chapterImg) {
        try {
          // Keep image aspect ratio reasonable (3 inches high)
          doc.addImage(chapterImg, "JPEG", margin, yPosition, contentWidth, 3);
          yPosition += 3.2;
        } catch (e) {
          console.warn("Could not draw chapter image, skipping.");
        }
      }
    }

    // Chapter Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    // Split text to fit page
    const splitText = doc.splitTextToSize(chapter.content, contentWidth);
    doc.text(splitText, margin, yPosition);
  }

  // Save File
  doc.save(`${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`);
};
