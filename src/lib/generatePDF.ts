import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { BookData } from "./bookTypes";

export const generateGuidePDF = async ({ title, topic, bookData, previewElement }: any) => {
  if (!previewElement) return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const canvas = await html2canvas(previewElement, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);

  const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
  doc.save(`${safeTitle}-artisan-guide.pdf`);
};

// This alias stops the "binding not found" error
export const generatePixelPerfectPDF = generateGuidePDF;
