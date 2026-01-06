import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// We use 'any' for all arguments here to bypass the
// circular type dependency causing the Stack Overflow.
export const generateGuidePDF = async (options: any) => {
  const { title, topic, previewElement, isAdmin } = options;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (!previewElement) {
    doc.text(title || "Artisan Guide", 20, 20);
    doc.save("guide.pdf");
    return;
  }

  // Ensure images are ready
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
      const el = cloned.querySelectorAll(".no-pdf-capture, button");
      el.forEach((e) => ((e as HTMLElement).style.display = "none"));
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(`${topic || "artisan"}-guide.pdf`);
};

export const generatePixelPerfectPDF = async (element: HTMLElement, filename: string) => {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const doc = new jsPDF();
  doc.addImage(canvas.toDataURL("image/jpeg"), "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
  doc.save(filename);
};
