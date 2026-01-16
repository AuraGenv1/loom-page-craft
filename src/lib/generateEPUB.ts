import JSZip from 'jszip';
import { BookData } from '@/lib/bookTypes';

interface GenerateEPUBOptions {
  title: string;
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
  diagramImages?: Record<string, string>;
  returnBlob?: boolean;
}

export const generateGuideEPUB = async ({ 
  title, 
  topic, 
  bookData, 
  coverImageUrl,
  returnBlob = false 
}: GenerateEPUBOptions): Promise<Blob | void> => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  // Cover
  zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`);
  
  // Chapters
  const chapters = bookData.tableOfContents || [];
  let manifest = '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>';
  let spine = '<itemref idref="cover"/>';

  chapters.forEach((ch: any, i: number) => {
    const content = bookData[`chapter${ch.chapter}Content`] || "";
    // Clean markdown
    const cleanContent = content.replace(/!\[.*?\]\(.*?\)/g, ""); 
    zip.file(`OEBPS/chapter${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${ch.title}</title></head><body><h2>${ch.title}</h2><p>${cleanContent}</p></body></html>`);
    manifest += `<item id="ch${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`;
    spine += `<itemref idref="ch${i}"/>`;
  });

  // OPF
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);

  if (returnBlob) {
    return await zip.generateAsync({ type: 'blob' });
  } else {
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `${title}.epub`;
    a.click();
  }
};
