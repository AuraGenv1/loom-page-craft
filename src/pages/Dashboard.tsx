import React, { useEffect, useState } from "react";
import { BookData } from "@/lib/bookTypes";
import { PrintPreview } from "@/components/PrintPreview";
import { Sidebar } from "@/components/Sidebar";

const Dashboard = () => {
  const [books, setBooks] = useState<BookData[]>([]);

  // Function to ensure data matches the BookData type perfectly
  const sanitizeBookData = (data: any): BookData => {
    return {
      ...data,
      title: data.title || "Untitled",
      topic: data.topic || "General",
      preface: data.preface || "",
      chapters: data.chapters || [],
      // Ensure nested bookData doesn't cause recursion errors
      bookData: undefined,
    };
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-8">Your Artisan Guides</h1>
        <div className="grid grid-cols-1 gap-8">
          {books.map((book, index) => (
            <PrintPreview key={index} data={sanitizeBookData(book)} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
