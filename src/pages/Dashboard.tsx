import React, { useEffect, useState } from "react";
import { BookData } from "@/lib/bookTypes";
import { PrintPreview } from "@/components/PrintPreview";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const Dashboard = () => {
  const [books, setBooks] = useState<BookData[]>([]);

  /**
   * Sanitizes the data coming from the database/storage to
   * match the required BookData type strictly.
   */
  const sanitizeBookData = (data: any): BookData => {
    return {
      title: data.title || "Untitled Guide",
      displayTitle: data.displayTitle || data.title || "Untitled Guide",
      subtitle: data.subtitle || "",
      topic: data.topic || "General",
      preface: data.preface || "",
      chapters: data.chapters || [],
      tableOfContents: data.tableOfContents || [],
      chapter1Content: data.chapter1Content || "",
      localResources: data.localResources || [],
      hasDisclaimer: data.hasDisclaimer ?? true,
      coverImage: data.coverImage,
    };
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 p-4 mb-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Generator
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-slate-900">My Artisan Guides</h1>
          <div className="w-24"></div> {/* Spacer for centering */}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4">
        {books.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-slate-200">
            <p className="text-slate-500">You haven't generated any guides yet.</p>
            <Link to="/">
              <Button className="mt-4">Generate Your First Guide</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            {books.map((book, index) => (
              <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <PrintPreview data={sanitizeBookData(book)} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
