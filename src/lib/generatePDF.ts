import html2canvas from "html2canvas";
import jsPDF from "jsPDF";
import { BookData } from "@/lib/bookTypes";

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement?: HTMLElement;
}

// HELPER: Wait for Fal.ai images to load before snapping the "photo"
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

// FIX FOR ERROR 2, 3, 4: Exporting generateGuidePDF
export const generateGuidePDF = async ({ title, topic, bookData, previewElement }: GeneratePDFOptions) => {
  if (!previewElement) {
    console.error("No preview element provided for PDF generation");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  await waitForImages(previewElement);

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      const el = clonedDoc.body.querySelectorAll("*");
      el.forEach((node) => {
        const htmlNode = node as HTMLElement;
        htmlNode.style.display = "block";
        htmlNode.style.overflow = "visible";
      });
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // Page 1
  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  // Additional Pages
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};

// FIX FOR ERROR 1: Exporting generatePixelPerfectPDF (Alias for compatibility)
export const generatePixelPerfectPDF = generateGuidePDF;
