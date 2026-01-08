import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert markdown to EPUB-compatible XHTML
const markdownToXHTML = (markdown: string): string => {
  // Clean content first
  const cleaned = markdown
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\[DIAGRAM:[^\]]+\]/gi, '');

  return cleaned
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hupbl])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    .replace(/<p><\/p>/g, '');
};

// Kindle-optimized CSS
const kindleCSS = `
/* Kindle-Optimized CSS for EPUB */
@charset "UTF-8";

body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  margin: 0;
  padding: 1em;
  color: #000;
  background: #fff;
}

/* Cover styles */
.cover {
  text-align: center;
  page-break-after: always;
  padding: 2em 1em;
}

.cover-image {
  max-width: 100%;
  height: auto;
  margin-bottom: 2em;
}

.cover-title {
  font-size: 2em;
  font-weight: bold;
  margin-bottom: 0.5em;
  line-height: 1.2;
}

.cover-subtitle {
  font-size: 1.1em;
  font-style: italic;
  color: #555;
  margin-bottom: 1em;
}

.cover-brand {
  font-size: 0.9em;
  letter-spacing: 0.2em;
  color: #888;
  margin-top: 3em;
}

/* Table of Contents */
.toc {
  page-break-after: always;
}

.toc h1 {
  text-align: center;
  margin-bottom: 1.5em;
}

.toc ol {
  list-style-type: decimal;
  padding-left: 1.5em;
}

.toc li {
  margin-bottom: 0.8em;
  line-height: 1.4;
}

.toc a {
  color: #000;
  text-decoration: none;
}

/* Chapters */
.chapter {
  page-break-before: always;
}

.chapter-number {
  font-size: 0.8em;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #666;
  text-align: center;
  margin-bottom: 0.5em;
}

.chapter-title {
  font-size: 1.5em;
  text-align: center;
  margin-bottom: 1.5em;
  line-height: 1.3;
}

/* Content */
h2 {
  font-size: 1.3em;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  page-break-after: avoid;
}

h3 {
  font-size: 1.1em;
  margin-top: 1.2em;
  margin-bottom: 0.6em;
}

p {
  text-indent: 1.5em;
  margin: 0 0 0.8em 0;
  text-align: justify;
}

p:first-of-type {
  text-indent: 0;
}

blockquote {
  margin: 1em 1.5em;
  padding: 0.5em 1em;
  border-left: 3px solid #ddd;
  font-style: italic;
}

ul, ol {
  margin: 1em 0;
  padding-left: 1.5em;
}

li {
  margin-bottom: 0.4em;
}

/* Images */
.chapter-image {
  text-align: center;
  margin: 1.5em 0;
  page-break-inside: avoid;
}

.chapter-image img {
  max-width: 100%;
  height: auto;
}

.image-caption {
  font-size: 0.85em;
  font-style: italic;
  color: #555;
  margin-top: 0.5em;
  text-align: center;
}

/* Copyright */
.copyright {
  page-break-before: always;
  text-align: center;
  padding: 2em 1em;
}

.certificate {
  border: 1px solid #ddd;
  padding: 1.5em;
  margin: 1.5em 0;
}
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, format = 'epub' } = await req.json();

    if (!bookId) {
      return new Response(
        JSON.stringify({ error: 'Book ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch book data from Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: book, error: fetchError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (fetchError || !book) {
      console.error('Failed to fetch book:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Book not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating ${format.toUpperCase()} for book:`, book.title);

    const zip = new JSZip.default();
    
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

    const tableOfContents = book.table_of_contents as Array<{ chapter: number; title: string; imageDescription?: string }> || [];
    const manifestItems: string[] = [];
    const spineItems: string[] = [];
    const navPoints: string[] = [];
    let playOrder = 1;

    // Cover page
    const displayTitle = book.title.includes(':') 
      ? book.title.split(':').slice(1).join(':').trim() 
      : book.title;
    
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${book.title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="cover">
    ${book.cover_image_url ? `<img src="cover.jpg" alt="Cover" class="cover-image"/>` : ''}
    <h1 class="cover-title">${displayTitle}</h1>
    <p class="cover-subtitle">${book.topic}</p>
    <p class="cover-brand">LOOM &amp; PAGE</p>
  </div>
</body>
</html>`;
    zip.file('OEBPS/cover.xhtml', coverXhtml);
    manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spineItems.push('<itemref idref="cover"/>');
    navPoints.push(`<navPoint id="cover" playOrder="${playOrder++}"><navLabel><text>Cover</text></navLabel><content src="cover.xhtml"/></navPoint>`);

    // TOC page (clickable for Kindle navigation)
    const tocXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav class="toc" epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${tableOfContents.map((ch) => `<li><a href="chapter${ch.chapter}.xhtml">Chapter ${ch.chapter}: ${ch.title}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
    zip.file('OEBPS/toc.xhtml', tocXhtml);
    manifestItems.push('<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
    spineItems.push('<itemref idref="toc"/>');
    navPoints.push(`<navPoint id="toc" playOrder="${playOrder++}"><navLabel><text>Table of Contents</text></navLabel><content src="toc.xhtml"/></navPoint>`);

    // Chapter pages
    const chapterWords = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    
    for (let i = 1; i <= 10; i++) {
      const contentKey = `chapter${i}_content`;
      const content = book[contentKey] as string;
      const tocEntry = tableOfContents.find(c => c.chapter === i);
      const chapterTitle = tocEntry?.title || `Chapter ${i}`;

      if (content) {
        const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Chapter ${i}: ${chapterTitle}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="chapter" id="chapter${i}">
    <p class="chapter-number">Chapter ${chapterWords[i - 1] || i}</p>
    <h1 class="chapter-title">${chapterTitle}</h1>
    <div class="chapter-content">
      ${markdownToXHTML(content)}
    </div>
  </div>
</body>
</html>`;
        zip.file(`OEBPS/chapter${i}.xhtml`, chapterXhtml);
        manifestItems.push(`<item id="chapter${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`);
        spineItems.push(`<itemref idref="chapter${i}"/>`);
        navPoints.push(`<navPoint id="chapter${i}" playOrder="${playOrder++}"><navLabel><text>Chapter ${i}: ${chapterTitle}</text></navLabel><content src="chapter${i}.xhtml"/></navPoint>`);
      }
    }

    // Copyright page
    const copyrightXhtml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <p>This work was generated via the Loom &amp; Page platform.</p>
      <p>The creator of this work retains 100% ownership of the content, including all commercial, distribution, and resale rights.</p>
      <h3>You are free to:</h3>
      <ul>
        <li>Use this guide for personal or commercial purposes</li>
        <li>Modify, adapt, and build upon this content</li>
        <li>Distribute and sell copies of this guide</li>
        <li>Use this content in any format or medium</li>
      </ul>
      <p><em>Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
    </div>
    <p class="cover-brand">LOOM &amp; PAGE</p>
  </div>
</body>
</html>`;
    zip.file('OEBPS/copyright.xhtml', copyrightXhtml);
    manifestItems.push('<item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>');
    spineItems.push('<itemref idref="copyright"/>');

    // Kindle-optimized CSS
    zip.file('OEBPS/styles.css', kindleCSS);
    manifestItems.push('<item id="styles" href="styles.css" media-type="text/css"/>');

    // Fetch and include cover image if available
    if (book.cover_image_url) {
      try {
        const imgResponse = await fetch(book.cover_image_url);
        if (imgResponse.ok) {
          const imgBlob = await imgResponse.blob();
          const imgBuffer = await imgBlob.arrayBuffer();
          zip.file('OEBPS/cover.jpg', imgBuffer);
          manifestItems.push('<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
        }
      } catch (e) {
        console.warn('Could not fetch cover image:', e);
      }
    }

    // Generate unique ID
    const bookUuid = crypto.randomUUID();

    // Content OPF (package document)
    const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${book.title}</dc:title>
    <dc:creator>Loom &amp; Page</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">urn:uuid:${bookUuid}</dc:identifier>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <dc:publisher>Loom &amp; Page</dc:publisher>
    <dc:subject>${book.topic}</dc:subject>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
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

    // NCX for older readers (Kindle compatibility)
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookUuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${book.title}</text>
  </docTitle>
  <navMap>
    ${navPoints.join('\n    ')}
  </navMap>
</ncx>`;
    zip.file('OEBPS/toc.ncx', ncx);

    // Generate the EPUB file
    const epubContent = await zip.generateAsync({
      type: 'arraybuffer',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    console.log(`Generated EPUB: ${epubContent.byteLength} bytes`);

    // Return the EPUB file
    const filename = `${book.topic.toLowerCase().replace(/\s+/g, '-')}-guide.epub`;
    
    return new Response(epubContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error generating ebook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to generate ebook' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
