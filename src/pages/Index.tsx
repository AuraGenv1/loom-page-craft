import React, { useState } from "react";
import { BookData } from "@/lib/bookTypes";
import { PrintPreview } from "@/components/PrintPreview";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [generatedData, setGeneratedData] = useState<BookData | null>(null);

  const handleSetData = (rawData: any) => {
    // Ensuring all required BookData properties exist
    const fullData: BookData = {
      title: rawData.title || "Untitled",
      displayTitle: rawData.displayTitle || rawData.title || "Untitled",
      subtitle: rawData.subtitle || "",
      topic: rawData.topic || "Artisan Craft",
      preface: rawData.preface || "",
      chapters: rawData.chapters || [],
      tableOfContents: rawData.tableOfContents || [],
      chapter1Content: rawData.chapter1Content || "",
      localResources: rawData.localResources || [],
      hasDisclaimer: true,
    };
    setGeneratedData(fullData);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-8">
      {!generatedData ? (
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold mb-4 text-center">Artisan Guide Generator</h1>
          <p className="text-slate-600 mb-6 text-center">Enter a topic to generate your professional guide.</p>
          <Button className="w-full" onClick={() => handleSetData({ title: "Sample Guide" })}>
            Test Generator UI
          </Button>
        </div>
      ) : (
        <PrintPreview data={generatedData} />
      )}
    </div>
  );
};

export default Index;
