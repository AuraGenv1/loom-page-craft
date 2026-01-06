import { forwardRef } from "react";
import { BookData } from "@/lib/bookTypes";
import BookCover from "./BookCover";
import TableOfContents from "./TableOfContents";
import ChapterContent from "./ChapterContent";
import LocalResources from "./LocalResources";

interface PrintPreviewProps {
  bookData: BookData;
  topic?: string; // Added to match Index.tsx
  displayTitle?: string; // Added to match Index.tsx
  diagramImages?: Record<string, string>; // Added to match Index.tsx
}

const PrintPreview = forwardRef<HTMLDivElement, PrintPreviewProps>(({ bookData, topic, displayTitle }, ref) => {
  return (
    <div ref={ref} className="bg-white text-black p-0 m-0 w-full">
      {/* Cover Page */}
      <div className="print-section min-h-[297mm]">
        <BookCover
          title={displayTitle || bookData.displayTitle}
          topic={topic || bookData.title}
          coverImageUrl={bookData.coverImageUrl}
        />
      </div>

      {/* Contents Page */}
      <div className="print-section p-12 min-h-[297mm]">
        <TableOfContents topic={topic || bookData.title} chapters={bookData.tableOfContents} />
      </div>

      {/* Main Content Sections */}
      <div className="print-section p-12 min-h-[297mm]">
        <ChapterContent
          topic={topic || bookData.title}
          content={bookData.chapter1Content}
          tableOfContents={bookData.tableOfContents}
        />
      </div>

      {/* Local Resources Section */}
      {bookData.localResources && bookData.localResources.length > 0 && (
        <div className="print-section p-12 min-h-[297mm]">
          <LocalResources topic={topic || bookData.title} resources={bookData.localResources} />
        </div>
      )}
    </div>
  );
});

PrintPreview.displayName = "PrintPreview";
export default PrintPreview;
