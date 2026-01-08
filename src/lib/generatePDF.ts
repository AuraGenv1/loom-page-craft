import { BookData } from "@/lib/bookTypes";

// @ts-ignore - html2pdf.js doesn't have TypeScript types
import html2pdf from 'html2pdf.js';

interface GeneratePDFOptions {
  title: string;
  topic: string;
  bookData: BookData;
  previewElement?: HTMLElement;
  isAdmin?: boolean;
}

type ImageType = 'jpeg' | 'png' | 'webp';
type OrientationType = 'portrait' | 'landscape';

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
 * Clean markdown content for PDF rendering
 */
const cleanMarkdownForPDF = (content: string): string => {
  return content
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\[IMAGE:[^\]]+\]/gi, '')
    .replace(/\[PRO-TIP:[^\]]+\]/gi, '')
    .trim();
};

/**
 * Generate PDF using html2pdf.js - captures the book-preview element exactly as displayed
 */
export const generateGuidePDF = async ({
  title,
  topic,
  bookData,
  previewElement,
  isAdmin = false,
}: GeneratePDFOptions) => {
  // Find the book preview container if not provided
  const elementToCapture = previewElement || document.querySelector('.book-preview') as HTMLElement;
  
  if (!elementToCapture) {
    console.error('No preview element found for PDF generation');
    throw new Error('No preview element found');
  }

  // Wait for all images to load
  await waitForImages(elementToCapture);
  
  // Additional wait for rendering
  await new Promise(resolve => setTimeout(resolve, 500));

  // Configure html2pdf.js
  const opt = {
    margin: 10,
    filename: `${topic.toLowerCase().replace(/\s+/g, '-')}-artisan-guide.pdf`,
    image: { type: 'jpeg' as ImageType, quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' as OrientationType
    },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  // Generate PDF
  return html2pdf().set(opt).from(elementToCapture).save();
};

/**
 * Generate PDF from the entire book view (including all chapters)
 */
export const generateFullBookPDF = async (topic: string): Promise<void> => {
  // Find the main book content area
  const bookContent = document.querySelector('[class*="book-view"]') as HTMLElement 
    || document.querySelector('main') as HTMLElement;
  
  if (!bookContent) {
    console.error('No book content found for PDF generation');
    throw new Error('No book content found');
  }

  // Wait for all images to load
  await waitForImages(bookContent);
  
  // Additional wait for rendering
  await new Promise(resolve => setTimeout(resolve, 500));

  // Configure html2pdf.js with optimal settings
  const opt = {
    margin: [15, 10, 15, 10] as [number, number, number, number],
    filename: `${topic.toLowerCase().replace(/\s+/g, '-')}-complete-guide.pdf`,
    image: { type: 'jpeg' as ImageType, quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 1200,
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' as OrientationType
    },
    pagebreak: { 
      mode: ['avoid-all', 'css', 'legacy'],
      before: '.chapter-break',
      after: '.page-break',
      avoid: ['img', 'figure', 'table']
    }
  };

  // Generate PDF
  return html2pdf().set(opt).from(bookContent).save();
};

/**
 * Pixel-perfect PDF from a DOM element
 */
export const generatePixelPerfectPDF = async (
  element: HTMLElement,
  filename: string,
  isAdmin = false
): Promise<void> => {
  await waitForImages(element);
  
  // Additional wait for rendering
  await new Promise(resolve => setTimeout(resolve, 500));

  const opt = {
    margin: 10,
    filename: filename,
    image: { type: 'jpeg' as ImageType, quality: 0.98 },
    html2canvas: { 
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' as OrientationType
    },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  return html2pdf().set(opt).from(element).save();
};

/**
 * Legacy full-fidelity PDF generator (kept for backward compatibility)
 */
export const generateFullFidelityPDF = generateFullBookPDF;
