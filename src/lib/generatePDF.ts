import html2canvas from "html2canvas";
import jsPDF from "jsPDF";
import { BookData } from "@/lib/bookTypes";

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement?: HTMLElement;
}

/**
 * HELPER: Ensures all images (especially Fal.ai high-res photos) 
 * are fully loaded into the browser's memory before we take the PDF "snapshot."
 */
const waitForImages = async (container: HTMLElement): Promise<void> => {
  const images = Array.from(container.querySelectorAll("img"));
  const promises = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // Continue even if one image fails to load
    });
  });
  await Promise.all(promises);
};

/**
 * The main function used by Dashboard.tsx
 */
export const generateGuidePDF = async ({
  title,
  topic,
  bookData,
  previewElement,
}: GeneratePDFOptions) => {
  if (!previewElement) {
    console.error("No preview element provided for PDF generation");
    return;
  }

  // A4 Page dimensions in mm
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // 1. Wait for images to be ready
  await waitForImages(previewElement);

  // 2. Convert the HTML "Hidden Container" into a high-quality canvas
  const canvas = await html2canvas(previewElement, {
    scale: 2, // Keeps file size manageable but text sharp
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      // Force elements to be visible in the "snapshot"
      const el = clonedDoc.body.querySelectorAll('*');
      el.forEach((node) => {
        const htmlNode = node as HTMLElement;
        htmlNode.style.display = 'block';
        htmlNode.style.overflow = 'visible';
      });
    },
  });

  // 3. Convert Canvas to JPEG Data
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;