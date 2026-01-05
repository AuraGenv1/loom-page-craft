import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { BookData } from "@/lib/bookTypes";

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement: HTMLElement; // The DOM element to capture
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
 */
export const generateGuidePDF = async ({
  title,
  topic,
  bookData,
  previewElement,
  isAdmin = false,
}: GeneratePDFOptions) => {
  if (!previewElement) {
    console.error("Target element for PDF capture not found.");
    return;
  }

  // 1. Wait for high-res photography to load
  await waitForImages(previewElement);

  // 2. Configure html2canvas for "Pixel-Perfect" output
  const canvas = await html2canvas(previewElement, {
    scale: 3, // High-DPI output for professional print quality
    useCORS: true, // Allows capture of AI images from external URLs
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      // ADMIN OVERRIDE: Remove blurs and expand content in the PDF only
      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });

        const restrictedContainers = clonedDoc.querySelectorAll('[class*="max-h-"], [class*="overflow-hidden"]');
        restrictedContainers.forEach((el) => {
          (el as HTMLElement).style.maxHeight = "none";
          (el as HTMLElement).style.overflow = "visible";
        });
      }
    },
  });

  // 3. Initialize jsPDF (A4 Portrait)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 4. Calculate dimensions to maintain aspect ratio
  const imgData = canvas.toDataURL("image/jpeg", 0.98); // High quality JPEG
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // 5. Build the PDF pages
  // Page 1: Cover & Start of content
  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  // Subsequent pages
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  // 6. Download the file
  const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};
