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
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
  const uid = crypto.randomUUID();

  // 1. Mimetype (Must be first, no compression)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. Container
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // 3. Styles
  zip.file('OEBPS/styles.css', `body { font-family: serif; margin: 1em; } h1, h2 { text-align: center; } p { line-height: 1.5; }`);

  // 4. Content Generation
  const chapters = bookData.tableOfContents || [];
  let manifest = '';
  let spine = '';
  
  // Cover Page
  zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${title}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${bookData.subtitle || ''}</p>
    <p>Loom & Page</p>
  </body>
</html>`);
  manifest += '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>';
  spine += '<itemref idref="cover"/>';
  manifest += '<item id="styles" href="styles.css" media-type="text/css"/>';

  // Chapter Pages
  chapters.forEach((ch: any, i: number) => {
    const content = bookData[`chapter${ch.chapter}Content`] || "";
    // Simple markdown cleanup
    const cleanContent = content
      .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
      .replace(/[#*>`]/g, "") // Remove md syntax
      .replace(/\n\n/g, "</p><p>"); // Paragraphs

    zip.file(`OEBPS/chapter${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Chapter ${ch.chapter}: ${ch.title}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
    <h2>Chapter ${ch.chapter}: ${ch.title}</h2>
    <p>${cleanContent}</p>
  </body>
</html>`);

    manifest += `<item id="ch${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`;
    spine += `<itemref idref="ch${i + 1}"/>`;
  });

  // 5. Package Document (OPF)
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`);

  // 6. Return Blob or Trigger Download
  if (returnBlob) {
    return await zip.generateAsync({ type: 'blob' });
  } else {
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `${safeTitle}.epub`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
};
