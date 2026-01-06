import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookData } from "@/lib/bookTypes";
import SearchInterface from "@/components/SearchInterface";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/DashboardHeader";
import PrintPreview from "@/components/PrintPreview";

const Index = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeBook, setActiveBook] = useState<BookData | null>(null);
  const { toast } = useToast();

  const handleGenerate = async (topic: string) => {
    // LOCKDOWN: Clear any previous book and start the loader
    setActiveBook(null);
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { topic },
      });

      if (error) throw error;

      // Update state with the fresh AI response
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
      <DashboardHeader />

      <main className="container mx-auto px-4 py-12">
        {!activeBook && !isGenerating ? (
          <div className="max-w-4xl mx-auto text-center space-y-8 py-20">
            <h1 className="text-5xl md:text-7xl font-light italic tracking-tight">Loom & Page</h1>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              Artisan Instructional Narratives
            </p>
            <div className="pt-10">
              <SearchInterface onSearch={handleGenerate} isLoading={isGenerating} />
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* The PrintPreview is only shown if activeBook exists */}
            {activeBook && (
              <div className="animate-in fade-in zoom-in duration-1000">
                <PrintPreview bookData={activeBook} />
              </div>
            )}

            {isGenerating && (
              <div className="flex flex-col items-center justify-center py-40">
                <div className="w-12 h-12 border-t-2 border-primary rounded-full animate-spin mb-6" />
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
