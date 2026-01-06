import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { BookData } from "@/lib/bookTypes";

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement?: HTMLElement; // Optional - if not provided, generates text-only PDF
  isAdmin?: boolean;
}

/**
 * Ensures all images (like Ferrari photos) are fully loaded before capturing.
 */
const waitForImages = async (container: HTMLElement): Promise<void> => {
  const images = Array.from(container.querySelectorAll("img"));
  const promises = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // Don't block forever if an image fails
    });
  });
  await Promise.all(promises);
};

/**
 * Captures the React component and generates a high-resolution A4 PDF.
 * If previewElement is provided, captures it with html2canvas.
 * Otherwise generates a basic text PDF.
 */
export const generateGuidePDF = async ({
  title,
  topic,
  bookData,
  previewElement,
  isAdmin = false,
}: GeneratePDFOptions) => {
  // Initialize jsPDF (A4 Portrait)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // If no preview element, generate a simple text-based PDF
  if (!previewElement) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`A Complete Guide to ${topic}`, pageWidth / 2, 55, { align: "center" });
    
    // Add chapter content as text
    if (bookData.chapter1Content) {
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(bookData.chapter1Content, pageWidth - 40);
      let y = 80;
      
      for (const line of lines) {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, 20, y);
        y += 5;
      }
    }
    
    const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
    doc.save(`${safeTitle}-artisan-guide.pdf`);
    return;
  }

  // 1. Wait for high-res photography to load
  await waitForImages(previewElement);

  // 2. Configure html2canvas for "Pixel-Perfect" output
  const canvas = await html2canvas(previewElement, {
    scale: 3, // Pro-grade DPI for print quality
    useCORS: true, // Allows capture of AI images from external URLs
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      // Always strip overflow/height restrictions to capture full content
      const allElements = clonedDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const classList = htmlEl.className || '';
        
        // Strip max-h-*, overflow-hidden, overflow-y-auto classes
        if (typeof classList === 'string' && (
          classList.includes('max-h-') || 
          classList.includes('overflow-hidden') || 
          classList.includes('overflow-y-auto') ||
          classList.includes('overflow-x-auto')
        )) {
          htmlEl.style.maxHeight = 'none';
          htmlEl.style.overflow = 'visible';
        }
      });

      // ADMIN OVERRIDE: Remove blurs in the PDF
      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });
      }
    },
  });

  // 3. Calculate dimensions to maintain aspect ratio
  const imgData = canvas.toDataURL("image/jpeg", 0.98); // High quality JPEG
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // 4. Build the PDF pages
  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  // Subsequent pages
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  // 5. Download the file
  const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};

/**
 * Pixel-perfect PDF from a DOM element (used by PrintPreview)
 */
export const generatePixelPerfectPDF = async (
  element: HTMLElement,
  filename: string,
  isAdmin = false
): Promise<void> => {
  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale: 3, // Pro-grade DPI
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      // Strip overflow/height restrictions for full content capture
      const allElements = clonedDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const classList = htmlEl.className || '';
        
        if (typeof classList === 'string' && (
          classList.includes('max-h-') || 
          classList.includes('overflow-hidden') || 
          classList.includes('overflow-y-auto') ||
          classList.includes('overflow-x-auto')
        )) {
          htmlEl.style.maxHeight = 'none';
          htmlEl.style.overflow = 'visible';
        }
      });

      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });
      }
    },
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  doc.save(filename);
};
