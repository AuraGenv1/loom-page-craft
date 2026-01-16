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

  // XML Escaper
  const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'}[c] || c));

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  // --- RICH CSS (Pro-Tips, Images, Fonts) ---
  const css = `
    body { font-family: serif; margin: 1em; line-height: 1.6; }
    h1, h2, h3 { text-align: center; margin-top: 1.5em; color: #333; page-break-before: always; }
    p { margin-bottom: 1em; text-indent: 0; }
    .pro-tip { background-color: #f5f5f5; border-left: 4px solid #555; padding: 1em; margin: 1.5em 0; font-style: italic; color: #444; border-radius: 4px; }
    img { max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 4px; }
    .cover-img { width: 100%; height: 100%; object-fit: cover; }
  `;
  zip.file('OEBPS/styles.css', css);

  // Cover Setup
  let coverMeta = '';
  let manifest = '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="styles.css" media-type="text/css"/>';
  let spine = '';

  if (coverImageUrl) {
    try {
      const blob = await (await fetch(coverImageUrl)).blob();
      zip.file('OEBPS/cover.jpg', blob);
      coverMeta = '<meta name="cover" content="cover-image"/>';
      zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body style="margin:0;padding:0;"><img class="cover-img" src="cover.jpg" alt="Cover"/></body></html>`);
      manifest += '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover-image" href="cover.jpg" media-type="image/jpeg"/>';
      spine += '<itemref idref="cover"/>';
    } catch (e) {}
  }

  // Chapters with Rich Formatting
  const chapters = bookData.tableOfContents || [];
  
  chapters.forEach((ch: any, i: number) => {
    let content = (bookData[`chapter${ch.chapter}Content`] || "");
    
    // 1. Remove remote images (EPUB constraint) - Or keep if we can fetch them
    content = content.replace(/!\[.*?\]\(.*?\)/g, ""); 

    // 2. Headers to HTML
    content = content.replace(/^### (.*$)/gm, "<h3>$1</h3>").replace(/^## (.*$)/gm, "<h2>$1</h2>");
    
    // 3. Pro-Tips (> text) -> Divs with class
    content = content.replace(/^> (.*$)/gm, '<div class="pro-tip">$1</div>');
    
    // 4. Formatting
    content = content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // 5. Paragraphs
    const paragraphs = content.split(/\n\n+/).map(p => {
      if (p.trim().startsWith('<')) return p; 
      return `<p>${escapeXml(p.trim())}</p>`;
    }).join('\n');

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(ch.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><h1>${escapeXml(ch.title)}</h1>${paragraphs}</body></html>`;
    
    zip.file(`OEBPS/chapter${i + 1}.xhtml`, xhtml);
    manifest += `<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`;
    spine += `<itemref idref="chapter${i + 1}"/>`;
  });

  // Navigation
  let navPoints = chapters.map((ch: any, i: number) => `<navPoint id="navpoint-${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(ch.title)}</text></navLabel><content src="chapter${i + 1}.xhtml"/></navPoint>`).join('');
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${escapeXml(title)}</text></docTitle><navMap>${navPoints}</navMap></ncx>`);
  
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:identifier id="BookId">${uid}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:language>en</dc:language>${coverMeta}</metadata><manifest>${manifest}</manifest><spine toc="ncx">${spine}</spine></package>`);

  if (returnBlob) return await zip.generateAsync({ type: 'blob' });
  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `${safeTitle}.epub`;
  a.click();
};
