import JSZip from 'jszip';
import { BookData } from '@/lib/bookTypes';

interface GenerateEPUBOptions {
  title: string;
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
  returnBlob?: boolean;
}

export const generateGuideEPUB = async ({ 
  title, topic, bookData, coverImageUrl, returnBlob = false 
}: GenerateEPUBOptions): Promise<Blob | void> => {
  const zip = new JSZip();
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
  const uid = crypto.randomUUID();

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  let coverMeta = '';
  if (coverImageUrl) {
     try {
       const resp = await fetch(coverImageUrl);
       const blob = await resp.blob();
       zip.file('OEBPS/cover.jpg', blob);
       coverMeta = '<meta name="cover" content="cover-image"/>';
       zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="text-align:center;"><img src="cover.jpg" alt="Cover" style="max-width:100%;max-height:100%;"/></body></html>`);
     } catch (e) {}
  }

  const chapters = bookData.tableOfContents || [];
  let manifest = `${coverImageUrl ? '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover-image" href="cover.jpg" media-type="image/jpeg"/>' : ''}  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="styles.css" media-type="text/css"/>`;
  let spine = coverImageUrl ? '<itemref idref="cover" linear="no"/>' : '';
  
  chapters.forEach((ch: any, i: number) => {
    const cleanContent = (bookData[`chapter${ch.chapter}Content`] || "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/\n\n/g, "<br/><br/>");
    zip.file(`OEBPS/chapter${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${ch.title}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><h2>Chapter ${ch.chapter}: ${ch.title}</h2><p>${cleanContent}</p></body></html>`);
    manifest += `<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`;
    spine += `<itemref idref="chapter${i + 1}"/>`;
  });

  zip.file('OEBPS/styles.css', `body { margin: 5%; font-family: serif; } h2 { text-align: center; }`);

  let navPoints = chapters.map((ch: any, i: number) => `<navPoint id="navpoint-${i + 1}" playOrder="${i + 1}"><navLabel><text>${ch.title}</text></navLabel><content src="chapter${i + 1}.xhtml"/></navPoint>`).join('');
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd"><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${title}</text></docTitle><navMap>${navPoints}</navMap></ncx>`);

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:identifier id="bookid">${uid}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language>${coverMeta}</metadata><manifest>${manifest}</manifest><spine toc="ncx">${spine}</spine></package>`);

  if (returnBlob) return await zip.generateAsync({ type: 'blob' });
  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `${safeTitle}.epub`;
  a.click();
};
