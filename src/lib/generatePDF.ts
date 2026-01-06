import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Isolated PDF Library
 * Uses 'any' for bookData to break the circular dependency loop.
 */
export const generateGuidePDF = async (options: {
  title: string;
  topic: string;
  bookData: any;
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}) => {
  const { title, topic, previewElement, isAdmin = false } = options;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (!previewElement) {
    doc.setFont("times", "bold");
    doc.text(title || "Artisan Guide", 105, 40, { align: "center" });
    doc.save(`${topic || "guide"}.pdf`);
    return;
  }

  // Ensure images are loaded locally to avoid external dependency checks
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
    onclone: (clonedDoc) => {
      const ui = clonedDoc.querySelectorAll("button, .no-pdf-capture");
      ui.forEach((el) => ((el as HTMLElement).style.display = "none"));
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(`${topic?.replace(/\s+/g, "-") || "artisan"}-guide.pdf`);
};

export const generatePixelPerfectPDF = async (element: HTMLElement, filename: string): Promise<void> => {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(filename);
};
