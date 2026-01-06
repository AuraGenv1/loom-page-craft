import { forwardRef } from "react";
import { BookData } from "@/lib/bookTypes";
import BookCover from "./BookCover";
import TableOfContents from "./TableOfContents";
import ChapterContent from "./ChapterContent";
import LocalResources from "./LocalResources";

interface PrintPreviewProps {
  bookData: BookData;
}

const PrintPreview = forwardRef<HTMLDivElement, PrintPreviewProps>(({ bookData }, ref) => {
  if (!bookData) return null;

  return (
    <div ref={ref} className="bg-white text-black p-0 m-0 w-full">
      {/* PAGE 1: COVER */}
      <div className="print-section min-h-[297mm] flex flex-col justify-center">
        <BookCover
          title={bookData.displayTitle || bookData.title}
          topic={bookData.title}
          coverImageUrl={bookData.coverImageUrl}
        />
      </div>

      {/* PAGE 2: TABLE OF CONTENTS */}
      <div className="print-section p-16 min-h-[297mm]">
        <TableOfContents topic={bookData.title} chapters={bookData.tableOfContents} />
      </div>

      {/* PAGE 3+: CHAPTER CONTENT */}
      <div className="print-section p-16 min-h-[297mm]">
        <ChapterContent
          topic={bookData.title}
          content={bookData.chapter1Content}
          tableOfContents={bookData.tableOfContents}
        />
      </div>

      {/* PAGE 4+: LOCAL RESOURCES */}
      {bookData.localResources && bookData.localResources.length > 0 && (
        <div className="print-section p-16 min-h-[297mm]">
          <LocalResources topic={bookData.title} resources={bookData.localResources} />
        </div>
      )}
    </div>
  );
});

PrintPreview.displayName = "PrintPreview";
export default PrintPreview;
