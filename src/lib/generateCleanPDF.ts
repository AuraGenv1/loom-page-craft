import html2pdf from 'html2pdf.js';
import { BookData, ChapterInfo } from "@/lib/bookTypes";

interface CleanPDFOptions {
  topic: string;
  bookData: BookData;
  coverImageUrl?: string | null;
  isPreview?: boolean; // If true: Cover + TOC + Chapter 1 only
}

interface ChapterData {
  title: string;
  content: string;
  image?: string;
}

export const generateCleanPDF = async ({ topic, bookData, coverImageUrl, isPreview = false }: CleanPDFOptions) => {
  const title = bookData.displayTitle || bookData.title || `${topic} Guide`;
  const coverImage = coverImageUrl || '';
  
  // Build chapters array from bookData
  const allChapters: ChapterData[] = [];
  const chapterContents = [
    bookData.chapter1Content,
    bookData.chapter2Content,
    bookData.chapter3Content,
    bookData.chapter4Content,
    bookData.chapter5Content,
    bookData.chapter6Content,
    bookData.chapter7Content,
    bookData.chapter8Content,
    bookData.chapter9Content,
    bookData.chapter10Content,
  ];

  chapterContents.forEach((content, idx) => {
    if (!content) return;
    const tocEntry = bookData.tableOfContents?.find((ch: ChapterInfo) => ch.chapter === idx + 1);
    allChapters.push({
      title: tocEntry?.title || `Chapter ${idx + 1}`,
      content,
    });
  });

  // 1. FILTER CONTENT FOR GUESTS
  // If preview, we grab ONLY the first chapter, but we KEEP the cover and TOC.
  const chaptersToUse = isPreview ? [allChapters[0]] : allChapters;
  const titleSuffix = isPreview ? " (Preview)" : "";

  // 2. BUILD THE HTML STRUCTURE
  // We build a single long HTML string that the engine will cut into pages.
  const element = document.createElement('div');
  element.innerHTML = `
    <div style="text-align: center; page-break-after: always; padding-top: 1in;">
      <h1 style="font-size: 32pt; font-family: serif; margin-bottom: 20px;">${title}${titleSuffix}</h1>
      <p style="font-size: 14pt; color: #666;">A Curated Guide</p>
      ${coverImage ? `<img src="${coverImage}" style="width: 100%; max-height: 4in; object-fit: contain; margin-top: 40px;" />` : ''}
    </div>
    <div style="page-break-after: always; font-family: serif;">
      <h2 style="text-align: center; margin-bottom: 30px;">Table of Contents</h2>
      <ul style="list-style: none; padding: 0;">
        ${allChapters.map((chap, index) => `
          <li style="margin-bottom: 10px; border-bottom: 1px dotted #ccc; display: flex; justify-content: space-between;">
            <span>Chapter ${index + 1}: ${chap.title}</span>
          </li>
        `).join('')}
      </ul>
    </div>
    ${chaptersToUse.map((chapter, index) => `
      <div style="page-break-before: always; font-family: serif; font-size: 12pt; line-height: 1.6;">
        <h2 style="margin-top: 0; margin-bottom: 20px;">Chapter ${index + 1}: ${chapter.title}</h2>
        ${chapter.image ? `<img src="${chapter.image}" style="width: 100%; height: auto; margin-bottom: 20px;" />` : ''}
        <div style="text-align: justify;">
          ${chapter.content.replace(/\n/g, '<br/><br/>')}
        </div>
      </div>
    `).join('')}
  `;

  // 3. CONFIGURE FOR AMAZON KDP (6x9 inches)
  const opt = {
    margin:       0.75,   // Safe margin for binding
    filename:     `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`,
    image:        { type: 'jpeg' as const, quality: 0.98 },
    html2canvas:  { scale: 2 }, // High resolution (300 DPI equivalent)
    jsPDF:        { unit: 'in' as const, format: [6, 9] as [number, number], orientation: 'portrait' as const } // FORCE 6x9 SIZE
  };

  // 4. GENERATE
  await html2pdf().set(opt).from(element).save();
};
