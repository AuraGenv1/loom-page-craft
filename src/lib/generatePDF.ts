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
  const pageHeight = doc.internal.pageSize.getHeight();

  // FALLBACK: If the UI ref fails, at least give them a styled text version
  if (!previewElement) {
    doc.setFont("times", "bold"); // More "Artisan" than Helvetica
    doc.setFontSize(28);
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    doc.setFont("times", "italic");
    doc.setFontSize(14);
    doc.text(`A Custom Artisan Guide for ${topic}`, pageWidth / 2, 52, { align: "center" });

    if (bookData.chapter1Content) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(bookData.chapter1Content, pageWidth - 40);
      doc.text(lines, 20, 80);
    }

    const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
    doc.save(`${safeTitle}-artisan-guide.pdf`);
    return;
  }

  // PREPARATION: Capture the high-res UI
  await waitForImages(previewElement);

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      // PDF-ONLY STYLING: Ensure the PDF looks like a clean book
      const el = clonedDoc.querySelector(".animate-fade-in") as HTMLElement;
      if (el) el.style.animation = "none";

      if (isAdmin) {
        const blurred = clonedDoc.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });

        const restricted = clonedDoc.querySelectorAll('[class*="max-h-"], [class*="overflow-hidden"]');
        restricted.forEach((el) => {
          (el as HTMLElement).style.maxHeight = "none";
          (el as HTMLElement).style.overflow = "visible";
        });
      }
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // Add first page
  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  // Add subsequent pages if content is long
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};
