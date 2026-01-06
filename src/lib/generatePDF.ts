import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Isolated PDF Library - Multi-page support
 * Uses 'any' for bookData to break the circular dependency loop.
 */
export const generateGuidePDF = async (options: {
  title: string;
  topic: string;
  bookData: any;
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}) => {
  const { title, topic, previewElement } = options;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;

  if (!previewElement) {
    doc.setFont("times", "bold");
    doc.text(title || "Artisan Guide", 105, 40, { align: "center" });
    doc.save(`${topic || "guide"}.pdf`);
    return;
  }

  // Ensure images are loaded before capture
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

  // Find all page-break sections
  const pageBreakElements = previewElement.querySelectorAll(".pdf-page-break");
  
  if (pageBreakElements.length > 0) {
    // Multi-page rendering - capture each section separately
    let isFirstPage = true;
    
    for (const section of Array.from(pageBreakElements)) {
      const sectionEl = section as HTMLElement;
      
      // Capture this section
      const canvas = await html2canvas(sectionEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc) => {
          const ui = clonedDoc.querySelectorAll("button, .no-pdf-capture");
          ui.forEach((el) => ((el as HTMLElement).style.display = "none"));
        },
      });
      
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;
      
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      
      // If section is taller than page, split across pages
      if (imgHeight > pageHeight) {
        let remainingHeight = imgHeight;
        let yOffset = 0;
        
        while (remainingHeight > 0) {
          if (yOffset > 0) {
            doc.addPage();
          }
          
          const sliceHeight = Math.min(remainingHeight, pageHeight);
          doc.addImage(imgData, "JPEG", 0, -yOffset, imgWidth, imgHeight);
          
          yOffset += pageHeight;
          remainingHeight -= pageHeight;
        }
      } else {
        doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
      }
    }
  } else {
    // Fallback: single capture with auto-pagination
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
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    
    // Split into multiple pages if needed
    let yPosition = 0;
    let pageNumber = 0;
    
    while (yPosition < imgHeight) {
      if (pageNumber > 0) {
        doc.addPage();
      }
      
      doc.addImage(imgData, "JPEG", 0, -yPosition, imgWidth, imgHeight);
      yPosition += pageHeight;
      pageNumber++;
    }
  }
  
  doc.save(`${topic?.replace(/\s+/g, "-") || "artisan"}-preview.pdf`);
};

export const generatePixelPerfectPDF = async (element: HTMLElement, filename: string): Promise<void> => {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if ((img as HTMLImageElement).complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }),
  );

  const canvas = await html2canvas(element, { 
    scale: 2, 
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (clonedDoc) => {
      const ui = clonedDoc.querySelectorAll("button, .no-pdf-capture");
      ui.forEach((el) => ((el as HTMLElement).style.display = "none"));
    },
  });
  
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  
  // Multi-page support
  let yPosition = 0;
  let pageNumber = 0;
  
  while (yPosition < imgHeight) {
    if (pageNumber > 0) {
      doc.addPage();
    }
    doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, -yPosition, imgWidth, imgHeight);
    yPosition += pageHeight;
    pageNumber++;
  }
  
  doc.save(filename);
};
