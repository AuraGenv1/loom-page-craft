import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
 * We use 'any' for options to break circular type dependencies.
 */
export const generateGuidePDF = async (options: any) => {
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

  await waitForImages(previewElement);

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (clonedDoc) => {
      const ui = clonedDoc.querySelectorAll("button, .no-pdf-capture");
      ui.forEach((el) => ((el as HTMLElement).style.display = "none"));

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
  doc.addImage(imgData, "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(`${topic?.replace(/\s+/g, "-") || "artisan"}-guide.pdf`);
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
  });
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(filename);
};
