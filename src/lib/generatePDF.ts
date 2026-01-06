import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Generates a multi-page PDF from the provided HTML element.
 * Optimized for high-fidelity images and long-form text content.
 */
export const generateGuidePDF = async ({ title, topic, bookData, previewElement }: any) => {
  if (!previewElement) {
    console.error("PDF Generation Failed: No preview element found.");
    return;
  }

  try {
    // 1. Capture the HTML as a high-resolution Canvas
    const canvas = await html2canvas(previewElement, {
      scale: 2, // 2x scale ensures text remains sharp in PDF
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    // 2. Initialize PDF (A4 size)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 3. Calculate Dimensions
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // 4. Multi-page Processing
    // Add the first page
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // While content remains, add new pages and shift the image up
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      doc.addPage();
      doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // 5. Save the file with a clean name
    const safeTitle = topic.toLowerCase().replace(/\s+/g, "-");
    doc.save(`${safeTitle}-artisan-guide.pdf`);

    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

// Ensures compatibility with older component references
export const generatePixelPerfectPDF = generateGuidePDF;
