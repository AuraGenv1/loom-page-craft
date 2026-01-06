import React, { useState } from "react";
import { BookData } from "@/lib/bookTypes";
import { PrintPreview } from "@/components/PrintPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState<BookData | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!topic) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { topic },
      });

      if (error) throw error;

      const content = data.content;
      // Map to strict BookData type to prevent TS errors
      const fullData: BookData = {
        title: content.title || topic,
        displayTitle: content.displayTitle || content.title || topic,
        subtitle: content.subtitle || "A Professional Artisan Guide",
        topic: topic,
        preface: content.preface || "",
        chapters: content.chapters || [],
        tableOfContents: content.tableOfContents || [],
        hasDisclaimer: true,
      };

      setGeneratedData(fullData);
    } catch (err: any) {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {!generatedData ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-white">
          <div className="w-full max-w-2xl text-center space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-100 text-slate-600 text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4 mr-2 text-blue-500" />
                AI-Powered Artisan Guides
              </div>
              <h1 className="text-6xl font-serif font-bold text-slate-900 tracking-tight">
                Create Your <span className="text-blue-600">Masterpiece</span>
              </h1>
              <p className="text-xl text-slate-500 max-w-lg mx-auto">
                Turn any craft or topic into a professionally formatted, printable guide in seconds.
              </p>
            </div>

            <div className="flex gap-2 p-2 bg-white rounded-2xl shadow-xl border border-slate-200">
              <Input
                placeholder="What do you want to teach? (e.g. Sourdough Baking)"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="border-0 focus-visible:ring-0 text-lg py-6"
              />
              <Button
                onClick={handleGenerate}
                disabled={isLoading || !topic}
                className="bg-blue-600 hover:bg-blue-700 px-8 rounded-xl h-auto py-4 transition-all hover:scale-[1.02]"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : "Generate Guide"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-12 px-4">
          <Button variant="outline" onClick={() => setGeneratedData(null)} className="mb-8 mx-auto block">
            ← Generate Another
          </Button>
          <PrintPreview data={generatedData} />
        </div>
      )}
    </div>
  );
};

export default Index;
