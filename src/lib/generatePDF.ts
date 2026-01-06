import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { BookData } from "@/lib/bookTypes";

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}

/**
 * Ensures all images are fully loaded before capturing.
 */
const waitForImages = async (container: HTMLElement): Promise<void> => {
  const images = Array.from(container.querySelectorAll("img"));
  const promises = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });
  await Promise.all(promises);
};

/**
 * Main function used by Index, Admin, and Dashboard.
 */
export const generateGuidePDF = async ({
  title,
  topic,
  bookData,
  previewElement,
  isAdmin = false,
}: GeneratePDFOptions) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  if (!previewElement) {
    // Basic text fallback if no visual element is provided
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    doc.save(`${topic.replace(/\s+/g, "-")}-guide.pdf`);
    return;
  }

  await waitForImages(previewElement);

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (clonedDoc) => {
      // Remove UI elements that shouldn't be in the PDF
      const buttons = clonedDoc.querySelectorAll("button, .no-pdf-capture");
      buttons.forEach((btn) => ((btn as HTMLElement).style.display = "none"));

      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });
      }
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
  doc.save(`${topic.replace(/\s+/g, "-")}-artisan-guide.pdf`);
};

/**
 * Specifically used by PrintPreview.tsx
 */
export const generatePixelPerfectPDF = async (
  element: HTMLElement,
  filename: string,
  isAdmin = false,
): Promise<void> => {
  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (cloned) => {
      if (isAdmin) {
        const blurred = cloned.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => ((el as HTMLElement).style.filter = "none"));
      }
    },
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const imgWidth = 210; // A4 width in mm
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
  doc.save(filename);
};
