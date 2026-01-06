import { useState } from "react";
import { BookData } from "@/lib/bookTypes";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PrintPreview from "@/components/PrintPreview";

// Safety Check: We define these locally in case the components are missing/renamed
const FallbackHeader = () => (
  <header className="w-full py-6 px-8 border-b border-black/5 flex justify-between items-center bg-white">
    <span className="text-[11px] tracking-[0.4em] font-bold uppercase">Loom & Page</span>
  </header>
);

const Index = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeBook, setActiveBook] = useState<BookData | null>(null);
  const [topic, setTopic] = useState("");
  const { toast } = useToast();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;

    setActiveBook(null);
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { topic },
      });

      if (error) throw error;
      setActiveBook(data);

      toast({
        title: "Volume Created",
        description: "Your luxury instructional guide is ready.",
      });
    } catch (error: any) {
      console.error("Generation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate book.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-foreground font-serif">
      <FallbackHeader />

      <main className="container mx-auto px-4 py-12">
        {!activeBook && !isGenerating ? (
          <div className="max-w-4xl mx-auto text-center space-y-8 py-20">
            <h1 className="text-5xl md:text-7xl font-light italic tracking-tight text-black">Loom & Page</h1>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              Artisan Instructional Narratives
            </p>

            <div className="pt-10 flex justify-center">
              <form onSubmit={handleGenerate} className="flex w-full max-w-md gap-2">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter a luxury topic..."
                  className="flex-1 bg-transparent border-b border-black/20 py-2 focus:outline-none focus:border-black transition-colors font-serif italic"
                />
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="text-[10px] uppercase tracking-widest font-bold border border-black px-6 py-2 hover:bg-black hover:text-white transition-all disabled:opacity-50"
                >
                  Generate
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {activeBook && (
              <div className="animate-in fade-in zoom-in duration-1000">
                <PrintPreview bookData={activeBook} />
              </div>
            )}

            {isGenerating && (
              <div className="flex flex-col items-center justify-center py-40">
                <div className="w-12 h-12 border-t-2 border-black rounded-full animate-spin mb-6" />
                <p className="text-[10px] uppercase tracking-[0.5em] animate-pulse text-muted-foreground">
                  Drafting your manuscript...
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
