import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * FULL VERSION: Captures everything in the PrintPreview
 */
export const generateGuidePDF = async ({ title, topic, bookData, previewElement }: any) => {
  if (!previewElement) {
    console.error("PDF Generation Failed: No preview element found.");
    return;
  }

  try {
    const canvas = await html2canvas(previewElement, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const doc = new jsPDF("p", "mm", "a4");

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Add the first page
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add subsequent pages if the content is long
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      doc.addPage();
      doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
    doc.save(`${safeTitle}-loom-page.pdf`);
  } catch (err) {
    console.error("PDF Generation Error:", err);
  }
};

export const generatePixelPerfectPDF = generateGuidePDF;
