import JSZip from 'jszip';
import { BookData } from '@/lib/bookTypes';

interface GenerateEPUBOptions {
  title: string;
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
  diagramImages?: Record<string, string>;
}

// Convert markdown to basic HTML
const markdownToHtml = (markdown: string): string => {
  return markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hupbl])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hupbl])/g, '$1')
    .replace(/(<\/[hupbl][^>]*>)<\/p>/g, '$1');
};

export const generateGuideEPUB = async ({ 
  title, 
  topic, 
  bookData, 
  coverImageUrl,
  diagramImages = {}
}: GenerateEPUBOptions) => {
  const zip = new JSZip();
  
  // EPUB mimetype (must be first and uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  
  // Container XML
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);
  
  // Generate chapter HTML files
  const chapters = bookData.tableOfContents || [];
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const tocItems: string[] = [];
  
  // Cover page
  const coverHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="cover">
    ${coverImageUrl ? `<img src="cover.jpg" alt="Cover" class="cover-image"/>` : ''}
    <h1 class="cover-title">${bookData.displayTitle || title}</h1>
    ${bookData.subtitle ? `<p class="cover-subtitle">${bookData.subtitle}</p>` : ''}
    <p class="cover-topic">${topic}</p>
    <p class="cover-brand">Loom & Page</p>
  </div>
</body>
</html>`;
  zip.file('OEBPS/cover.xhtml', coverHtml);
  manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
  spineItems.push('<itemref idref="cover"/>');
  
  // Table of Contents page
  const tocHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${chapters.map((ch, i) => `<li><a href="chapter${i + 1}.xhtml">Chapter ${ch.chapter}: ${ch.title}</a></li>`).join('\n      ')}
    </ol>
  </div>
</body>
</html>`;
  zip.file('OEBPS/toc.xhtml', tocHtml);
  manifestItems.push('<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>');
  spineItems.push('<itemref idref="toc"/>');
  tocItems.push('<navPoint id="toc" playOrder="1"><navLabel><text>Table of Contents</text></navLabel><content src="toc.xhtml"/></navPoint>');
  
  // Chapter pages
  chapters.forEach((chapter, index) => {
    const chapterNum = index + 1;
    const chapterKey = `chapter${chapterNum}Content`;
    const content = index === 0 
      ? bookData.chapter1Content 
      : (bookData as any)[chapterKey] || `<p>Chapter ${chapterNum} content coming soon...</p>`;
    
    const diagramKey = `${chapterNum}.1`;
    const diagramUrl = diagramImages[diagramKey];
    const imageDescription = (chapter as any).imageDescription || `Instructional diagram for ${chapter.title}`;
    
    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Chapter ${chapter.chapter}: ${chapter.title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="chapter">
    ${diagramUrl ? `
    <div class="chapter-image">
      <img src="diagram_${chapterNum}.jpg" alt="${imageDescription}" class="full-width-image"/>
      <p class="image-caption">${imageDescription}</p>
    </div>
    ` : ''}
    <h1 class="chapter-title">Chapter ${chapter.chapter}</h1>
    <h2 class="chapter-subtitle">${chapter.title}</h2>
    <div class="chapter-content">
      ${markdownToHtml(content)}
    </div>
  </div>
</body>
</html>`;
    zip.file(`OEBPS/chapter${chapterNum}.xhtml`, chapterHtml);
    manifestItems.push(`<item id="chapter${chapterNum}" href="chapter${chapterNum}.xhtml" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="chapter${chapterNum}"/>`);
    tocItems.push(`<navPoint id="chapter${chapterNum}" playOrder="${chapterNum + 1}"><navLabel><text>Chapter ${chapter.chapter}: ${chapter.title}</text></navLabel><content src="chapter${chapterNum}.xhtml"/></navPoint>`);
  });
  
  // Copyright page
  const copyrightHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Copyright &amp; Ownership</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="copyright">
    <h1>Copyright &amp; Ownership</h1>
    <div class="certificate">
      <h2>Commercial Rights Grant</h2>
      <p><strong>Commercial Rights &amp; Ownership</strong></p>
      <p>This work was generated via the Loom &amp; Page platform.</p>
      <p>The creator of this work retains 100% ownership of the content, including all commercial, distribution, and resale rights.</p>
      <h3>You are free to:</h3>
      <ul>
        <li>Use this guide for personal or commercial purposes</li>
        <li>Modify, adapt, and build upon this content</li>
        <li>Distribute and sell copies of this guide</li>
        <li>Use this content in any format or medium</li>
      </ul>
      <p class="note">No attribution required, though appreciated.</p>
      <p class="date">Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    <p class="brand">LOOM &amp; PAGE</p>
  </div>
</body>
</html>`;
  zip.file('OEBPS/copyright.xhtml', copyrightHtml);
  manifestItems.push('<item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>');
  spineItems.push('<itemref idref="copyright"/>');
  
  // CSS Styles
  const styles = `
body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.6;
  margin: 0;
  padding: 1em;
  color: #333;
}

.cover {
  text-align: center;
  padding: 2em;
  page-break-after: always;
}

.cover-image {
  max-width: 100%;
  height: auto;
  margin-bottom: 2em;
}

.cover-title {
  font-size: 2.5em;
  margin-bottom: 0.5em;
  color: #1a1a1a;
}

.cover-subtitle {
  font-size: 1.2em;
  font-style: italic;
  color: #666;
  margin-bottom: 1em;
}

.cover-topic {
  font-size: 1em;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #888;
  margin-bottom: 2em;
}

.cover-brand {
  font-size: 0.9em;
  letter-spacing: 0.3em;
  color: #999;
}

.toc {
  padding: 1em;
}

.toc h1 {
  text-align: center;
  margin-bottom: 1.5em;
}

.toc ol {
  list-style-type: decimal;
  padding-left: 2em;
}

.toc li {
  margin-bottom: 0.8em;
}

.toc a {
  color: #333;
  text-decoration: none;
}

.chapter {
  page-break-before: always;
}

.chapter-image {
  width: 100%;
  margin-bottom: 1.5em;
  text-align: center;
}

.full-width-image {
  width: 100%;
  height: auto;
  object-fit: cover;
}

.image-caption {
  font-size: 0.85em;
  font-style: italic;
  color: #666;
  margin-top: 0.5em;
  padding: 0.5em;
  background: #f5f5f5;
}

.chapter-title {
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #888;
  margin-bottom: 0.5em;
  text-align: center;
}

.chapter-subtitle {
  font-size: 1.8em;
  margin-bottom: 1.5em;
  text-align: center;
  color: #1a1a1a;
}

.chapter-content p {
  text-indent: 1.5em;
  margin-bottom: 0.8em;
}

.chapter-content h2 {
  font-size: 1.3em;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  color: #333;
}

.chapter-content h3 {
  font-size: 1.1em;
  margin-top: 1.2em;
  margin-bottom: 0.6em;
}

blockquote {
  margin: 1em 2em;
  padding: 0.5em 1em;
  border-left: 3px solid #ddd;
  font-style: italic;
  color: #555;
}

ul, ol {
  margin: 1em 0;
  padding-left: 2em;
}

li {
  margin-bottom: 0.5em;
}

.copyright {
  text-align: center;
  padding: 2em;
  page-break-before: always;
}

.certificate {
  border: 1px solid #ddd;
  padding: 2em;
  margin: 2em 0;
  background: #fafafa;
}

.certificate h2 {
  margin-bottom: 1em;
}

.certificate ul {
  text-align: left;
  max-width: 300px;
  margin: 1em auto;
}

.note {
  font-style: italic;
  color: #666;
  margin-top: 1.5em;
}

.date {
  font-size: 0.9em;
  color: #888;
}

.brand {
  letter-spacing: 0.3em;
  color: #999;
  margin-top: 2em;
}
`;
  zip.file('OEBPS/styles.css', styles);
  manifestItems.push('<item id="styles" href="styles.css" media-type="text/css"/>');
  
  // Handle cover image if provided
  if (coverImageUrl) {
    try {
      const response = await fetch(coverImageUrl);
      if (response.ok) {
        const blob = await response.blob();
        zip.file('OEBPS/cover.jpg', blob);
        manifestItems.push('<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
      }
    } catch (e) {
      console.warn('Could not fetch cover image for EPUB:', e);
    }
  }
  
  // Handle diagram images
  for (const [key, url] of Object.entries(diagramImages)) {
    if (url) {
      try {
        const chapterNum = key.split('.')[0];
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          zip.file(`OEBPS/diagram_${chapterNum}.jpg`, blob);
          manifestItems.push(`<item id="diagram${chapterNum}" href="diagram_${chapterNum}.jpg" media-type="image/jpeg"/>`);
        }
      } catch (e) {
        console.warn(`Could not fetch diagram image ${key} for EPUB:`, e);
      }
    }
  }
  
  // Content OPF
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>Loom &amp; Page</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <dc:publisher>Loom &amp; Page</dc:publisher>
    <dc:subject>${topic}</dc:subject>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);
  
  // NCX Table of Contents (for older readers)
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${crypto.randomUUID()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${title}</text>
  </docTitle>
  <navMap>
    ${tocItems.join('\n    ')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', ncx);
  
  // Generate and download the EPUB
  const content = await zip.generateAsync({ 
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  const filename = `${topic.toLowerCase().replace(/\s+/g, '-')}-guide.epub`;
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
