import { BookData } from '@/lib/bookTypes';

interface GenerateKindleOptions {
  title: string;
  topic: string;
  bookData: BookData;
}

// Convert markdown to clean plain text
const markdownToPlainText = (markdown: string): string => {
  return markdown
    // Remove headers but keep text
    .replace(/^#{1,3}\s+(.+)$/gm, '\n$1\n' + '='.repeat(40) + '\n')
    // Remove bold/italic markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    // Convert blockquotes
    .replace(/^>\s+(.+)$/gm, '\n"$1"\n')
    // Convert lists
    .replace(/^-\s+(.+)$/gm, '  • $1')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const generateKindleHTML = async ({
  title,
  topic,
  bookData,
}: GenerateKindleOptions) => {
  const currentYear = new Date().getFullYear();
  const chapters = bookData.tableOfContents || [];
  
  // Build chapter HTML
  const chapterHtml = chapters.map((chapter, index) => {
    const chapterNum = index + 1;
    const chapterKey = `chapter${chapterNum}Content` as keyof BookData;
    const content = index === 0 
      ? bookData.chapter1Content 
      : (bookData[chapterKey] as string) || `Chapter ${chapterNum} content available in full edition.`;
    
    // Convert markdown to HTML
    const htmlContent = content
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^([^<])/gm, '<p>$1')
      .replace(/([^>])$/gm, '$1</p>');
    
    return `
      <div class="chapter" style="page-break-before: always;">
        <p class="chapter-number">CHAPTER ${chapter.chapter}</p>
        <h2 class="chapter-title">${chapter.title}</h2>
        <div class="chapter-content">
          ${htmlContent}
        </div>
      </div>
    `;
  }).join('\n');

  // Build full HTML document optimized for Kindle
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${bookData.displayTitle || title}</title>
  <style>
    body {
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.8;
      color: #333;
      max-width: 100%;
      margin: 0;
      padding: 1em;
    }
    
    .cover {
      text-align: center;
      padding: 3em 1em;
      page-break-after: always;
    }
    
    .cover-title {
      font-size: 2em;
      font-weight: bold;
      margin-bottom: 0.5em;
    }
    
    .cover-subtitle {
      font-size: 1.2em;
      font-style: italic;
      color: #666;
      margin-bottom: 1em;
    }
    
    .cover-topic {
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #888;
      margin-bottom: 2em;
    }
    
    .cover-brand {
      font-size: 0.8em;
      letter-spacing: 0.3em;
      color: #999;
      margin-top: 3em;
    }
    
    .toc {
      page-break-after: always;
      padding: 1em;
    }
    
    .toc h1 {
      text-align: center;
      margin-bottom: 1.5em;
    }
    
    .toc ol {
      padding-left: 1.5em;
    }
    
    .toc li {
      margin-bottom: 0.8em;
    }
    
    .chapter-number {
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #888;
      text-align: center;
      margin-bottom: 0.5em;
    }
    
    .chapter-title {
      font-size: 1.5em;
      text-align: center;
      margin-bottom: 1.5em;
    }
    
    .chapter-content p {
      text-indent: 1.5em;
      margin-bottom: 0.8em;
    }
    
    .chapter-content h2, .chapter-content h3 {
      margin-top: 1.5em;
      margin-bottom: 0.8em;
    }
    
    blockquote {
      margin: 1em 2em;
      padding: 0.5em 1em;
      border-left: 3px solid #ddd;
      font-style: italic;
    }
    
    ul {
      margin: 1em 0;
      padding-left: 2em;
    }
    
    li {
      margin-bottom: 0.5em;
    }
    
    .copyright {
      page-break-before: always;
      text-align: center;
      padding: 2em;
    }
    
    .copyright-box {
      border: 1px solid #ddd;
      padding: 1.5em;
      margin: 2em 0;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover">
    <h1 class="cover-title">${bookData.displayTitle || title}</h1>
    ${bookData.subtitle ? `<p class="cover-subtitle">${bookData.subtitle}</p>` : ''}
    <p class="cover-topic">${topic}</p>
    <p class="cover-brand">LOOM & PAGE | ${currentYear} Edition</p>
  </div>
  
  <!-- Table of Contents -->
  <div class="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${chapters.map((ch) => `<li>Chapter ${ch.chapter}: ${ch.title}</li>`).join('\n      ')}
    </ol>
  </div>
  
  <!-- Chapters -->
  ${chapterHtml}
  
  <!-- Copyright Page -->
  <div class="copyright">
    <h2>Copyright & Ownership</h2>
    <div class="copyright-box">
      <p><strong>Commercial Rights Grant</strong></p>
      <p>This work was generated via the Loom & Page platform.</p>
      <p>The creator of this work retains 100% ownership of the content, including all commercial, distribution, and resale rights.</p>
      <p><em>No attribution required, though appreciated.</em></p>
      <p>Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    <p class="cover-brand">LOOM & PAGE</p>
  </div>
</body>
</html>`;

  // Download as HTML file (Kindle compatible)
  const blob = new Blob([html], { type: 'text/html' });
  const filename = `${topic.toLowerCase().replace(/\s+/g, '-')}-kindle.html`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const generateKindleTXT = async ({
  title,
  topic,
  bookData,
}: GenerateKindleOptions) => {
  const currentYear = new Date().getFullYear();
  const chapters = bookData.tableOfContents || [];
  const divider = '='.repeat(50);
  
  // Build plain text content
  let text = '';
  
  // Cover
  text += `\n${divider}\n`;
  text += `${(bookData.displayTitle || title).toUpperCase()}\n`;
  text += `${divider}\n\n`;
  if (bookData.subtitle) {
    text += `${bookData.subtitle}\n\n`;
  }
  text += `Topic: ${topic}\n`;
  text += `LOOM & PAGE | ${currentYear} Edition\n`;
  text += `\n${divider}\n\n`;
  
  // Table of Contents
  text += `TABLE OF CONTENTS\n`;
  text += `${'-'.repeat(30)}\n\n`;
  chapters.forEach((ch) => {
    text += `  ${ch.chapter}. ${ch.title}\n`;
  });
  text += `\n${divider}\n\n`;
  
  // Chapters
  chapters.forEach((chapter, index) => {
    const chapterNum = index + 1;
    const chapterKey = `chapter${chapterNum}Content` as keyof BookData;
    const content = index === 0 
      ? bookData.chapter1Content 
      : (bookData[chapterKey] as string) || `Chapter ${chapterNum} content available in full edition.`;
    
    text += `\nCHAPTER ${chapter.chapter}\n`;
    text += `${chapter.title}\n`;
    text += `${'-'.repeat(40)}\n\n`;
    text += markdownToPlainText(content);
    text += `\n\n${divider}\n`;
  });
  
  // Copyright
  text += `\n\nCOPYRIGHT & OWNERSHIP\n`;
  text += `${'-'.repeat(30)}\n\n`;
  text += `This work was generated via the Loom & Page platform.\n`;
  text += `The creator retains 100% ownership and commercial rights.\n\n`;
  text += `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
  text += `\nLOOM & PAGE\n`;

  // Download as TXT file
  const blob = new Blob([text], { type: 'text/plain' });
  const filename = `${topic.toLowerCase().replace(/\s+/g, '-')}-kindle.txt`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
