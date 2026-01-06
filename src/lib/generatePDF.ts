import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Isolated PDF Library
 * This version uses 'any' and internal logic to break
 * circular dependencies causing the Stack Overflow.
 */

const waitForImages = async (container: HTMLElement): Promise<void> => {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if ((img as HTMLImageElement).complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }),
  );
};

export const generateGuidePDF = async (options: {
  title: string;
  topic: string;
  bookData: any; // Using any to break circular reference
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}) => {
  const { title, topic, previewElement, isAdmin = false } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  if (!previewElement) {
    doc.setFont("times", "bold");
    doc.text(title || "Artisan Guide", pageWidth / 2, 40, { align: "center" });
    doc.save(`${topic || "guide"}.pdf`);
    return;
  }

  await waitForImages(previewElement);

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (cloned) => {
      const ui = cloned.querySelectorAll("button, .no-pdf-capture");
      ui.forEach((el) => ((el as HTMLElement).style.display = "none"));

      if (isAdmin) {
        const blurred = cloned.querySelectorAll('[class*="blur"]');
        blurred.forEach((el) => {
          (el as HTMLElement).style.filter = "none";
          (el as HTMLElement).style.backdropFilter = "none";
        });
      }
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, pageWidth, (canvas.height * pageWidth) / canvas.width);
  doc.save(`${topic?.replace(/\s+/g, "-") || "artisan"}-guide.pdf`);
};

export const generatePixelPerfectPDF = async (
  element: HTMLElement,
  filename: string,
  isAdmin = false,
): Promise<void> => {
  await waitForImages(element);
  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(filename);
};
