import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Isolated PDF Generator
 * Uses 'any' to break the circular dependency loop causing the Stack Overflow.
 */
export const generateGuidePDF = async (options: {
  title: string;
  topic: string;
  bookData: any;
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}) => {
  const { title, topic, previewElement, isAdmin = false } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  if (!previewElement) {
    doc.setFontSize(20);
    doc.text(title || "Guide", 20, 20);
    doc.save(`${topic || "guide"}.pdf`);
    return;
  }

  // Basic image wait logic inside the file
  const images = Array.from(previewElement.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if ((img as HTMLImageElement).complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }),
  );

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (cloned) => {
      const ui = cloned.querySelectorAll("button, .no-pdf-capture");
      ui.forEach((el) => ((el as HTMLElement).style.display = "none"));
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(`${topic?.replace(/\s+/g, "-") || "artisan"}-guide.pdf`);
};

export const generatePixelPerfectPDF = async (element: HTMLElement, filename: string) => {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const doc = new jsPDF();
  doc.addImage(canvas.toDataURL("image/jpeg"), "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(filename);
};
