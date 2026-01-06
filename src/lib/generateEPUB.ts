import { BookData } from "./bookTypes";

/**
 * Generate EPUB file from book data
 * Accepts either BookData directly or an options object with bookData
 */
export const generateGuideEPUB = async (options: {
  title: string;
  topic: string;
  bookData: any;
}) => {
  const { title, topic, bookData } = options;
  
  const displayTitle = bookData?.displayTitle || bookData?.title || title;

  console.log("Generating EPUB for:", displayTitle);

  // Build EPUB content
  let content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html>
<head>
  <title>${displayTitle}</title>
</head>
<body>
  <h1>${displayTitle}</h1>
  <p><em>${topic}</em></p>
  
  <h2>Preface</h2>
  <p>${bookData?.preface || ''}</p>
`;

  // Add chapters
  if (bookData?.chapters && Array.isArray(bookData.chapters)) {
    bookData.chapters.forEach((chapter: any, index: number) => {
      content += `
  <h2>Chapter ${index + 1}: ${chapter?.title || 'Untitled'}</h2>
  <p>${chapter?.description || ''}</p>
`;
    });
  }

  content += `
</body>
</html>`;

  const blob = new Blob([content], { type: "application/epub+zip" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${topic.replace(/\s+/g, "-")}.epub`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Keep backward compatibility
export const generateEPUB = generateGuideEPUB;
