import React from "react";
import { BookData } from "@/lib/bookTypes";
import { generatePixelPerfectPDF } from "@/lib/generatePDF";
import { Button } from "./ui/button";
import { TableOfContents } from "./TableOfContents";
import { ChapterContent } from "./ChapterContent";
import { LocalResources } from "./LocalResources";

interface PrintPreviewProps {
  data: BookData;
  isAdmin?: boolean;
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({ data, isAdmin = false }) => {
  const previewRef = React.useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (previewRef.current) {
      // Fixed: Only passing 2 arguments to match the simplified generatePDF.ts
      await generatePixelPerfectPDF(previewRef.current, `${data.topic}-guide.pdf`);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <div className="flex justify-end w-full max-w-[210mm]">
        <Button onClick={handleDownload}>Download PDF</Button>
      </div>

      <div
        ref={previewRef}
        className="bg-white shadow-2xl w-[210mm] min-h-[297mm] p-[20mm] text-slate-900 flex flex-col gap-8"
        id="pdf-content"
      >
        <header className="text-center border-b-2 border-slate-200 pb-8">
          <h1 className="text-4xl font-serif font-bold mb-2">{data.displayTitle || data.title}</h1>
          {data.subtitle && <p className="text-xl text-slate-600 italic">{data.subtitle}</p>}
        </header>

        <section className="prose prose-slate max-w-none">
          <h2 className="text-2xl font-bold">Preface</h2>
          <p className="whitespace-pre-wrap">{data.preface}</p>
        </section>

        {data.tableOfContents && <TableOfContents chapters={data.tableOfContents} />}

        {data.chapters.map((chapter, index) => (
          <ChapterContent key={index} chapter={chapter} />
        ))}

        {/* Using chapter1Content if chapters list is empty or for specific formatting */}
        {data.chapter1Content && !data.chapters.length && (
          <section className="prose prose-slate max-w-none">
            <p className="whitespace-pre-wrap">{data.chapter1Content}</p>
          </section>
        )}
      </div>
    </div>
  );
};
