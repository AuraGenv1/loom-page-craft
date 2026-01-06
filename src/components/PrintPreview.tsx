import { forwardRef } from "react";
import { BookData } from "@/lib/bookTypes";
import BookCover from "./BookCover";
import TableOfContents from "./TableOfContents";
import ChapterContent from "./ChapterContent";
import LocalResources from "./LocalResources";

interface PrintPreviewProps {
  bookData: BookData;
  topic?: string;
  displayTitle?: string;
  diagramImages?: Record<string, string>;
}

const PrintPreview = forwardRef<HTMLDivElement, PrintPreviewProps>(({ bookData, topic, displayTitle }, ref) => {
  if (!bookData) return null;

  return (
    <div ref={ref} className="bg-white text-black p-0 m-0 w-full overflow-visible">
      {/* SECTION 1: THE LUXURY COVER */}
      <div className="print-section min-h-[297mm] w-full flex flex-col items-center justify-center bg-white border-b border-gray-100">
        <BookCover
          title={displayTitle || bookData.displayTitle || bookData.title}
          topic={topic || bookData.title}
          coverImageUrl={bookData.coverImageUrl}
        />
      </div>

      {/* SECTION 2: TABLE OF CONTENTS */}
      <div className="print-section p-16 min-h-[297mm] w-full bg-white border-b border-gray-100">
        <TableOfContents topic={topic || bookData.title} chapters={bookData.tableOfContents || []} />
      </div>

      {/* SECTION 3: MAIN INSTRUCTIONAL CONTENT */}
      <div className="print-section p-16 min-h-[297mm] w-full bg-white border-b border-gray-100">
        <ChapterContent
          topic={topic || bookData.title}
          content={bookData.chapter1Content}
          tableOfContents={bookData.tableOfContents || []}
        />
      </div>

      {/* SECTION 4: CURATED LOCAL RESOURCES (GOOGLE PLACES) */}
      {bookData.localResources && bookData.localResources.length > 0 && (
        <div className="print-section p-16 min-h-[297mm] w-full bg-white">
          <LocalResources topic={topic || bookData.title} resources={bookData.localResources} />
        </div>
      )}
    </div>
  );
});

PrintPreview.displayName = "PrintPreview";

export default PrintPreview;
