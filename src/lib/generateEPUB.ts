import { BookData } from "./bookTypes";

// Renamed to generateGuideEPUB to fix Admin/Dashboard import errors
export const generateGuideEPUB = async (data: BookData) => {
  const title = data.displayTitle || data.title;

  console.log("Generating EPUB for:", title);

  const content = `
    Title: ${title}
    Topic: ${data.topic}
    Preface: ${data.preface}
  `;

  const blob = new Blob([content], { type: "application/epub+zip" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.topic.replace(/\s+/g, "-")}.epub`;
  a.click();
};

// Also keep a generic export just in case
export const generateEPUB = generateGuideEPUB;
