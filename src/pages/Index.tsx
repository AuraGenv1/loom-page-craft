import React, { useState } from "react";
import { BookData } from "@/lib/bookTypes";
import { PrintPreview } from "@/components/PrintPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState<any | null>(null); // Using 'any' to restore the design immediately
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!topic) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { topic },
      });

      if (error) throw error;
      setGeneratedData(data.content);

      toast({
        title: "Guide Generated!",
        description: "Your professional artisan guide is ready.",
      });
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB]">
      {!generatedData ? (
        <div className="relative flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden">
          {/* Background Decorative Elements */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[radial-gradient(circle_at_50%_-20%,#E2E8F0,transparent)]" />

          <div className="relative w-full max-w-3xl text-center space-y-10">
            <div className="space-y-6">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-white shadow-sm border border-slate-100 text-slate-600 text-sm font-medium animate-fade-in">
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                AI-Powered Craftsmanship
              </div>

              <h1 className="text-7xl font-serif font-bold text-slate-900 tracking-tight leading-tight">
                Master your craft, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-500">
                  share your wisdom.
                </span>
              </h1>

              <p className="text-xl text-slate-500 max-w-xl mx-auto leading-relaxed">
                Transform any skill into a beautifully formatted, professional-grade artisan guide in seconds.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 p-3 bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 max-w-2xl mx-auto">
              <Input
                placeholder="What skill are you sharing? (e.g. Leatherworking)"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="border-0 focus-visible:ring-0 text-lg py-7 px-4 bg-transparent"
              />
              <Button
                onClick={handleGenerate}
                disabled={isLoading || !topic}
                className="bg-slate-900 hover:bg-slate-800 text-white px-10 rounded-xl h-auto py-4 font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in zoom-in-95 duration-500">
          <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 p-4 mb-8">
            <div className="max-w-5xl mx-auto flex justify-between items-center">
              <Button variant="ghost" onClick={() => setGeneratedData(null)}>
                ← New Guide
              </Button>
              <div className="text-sm font-medium text-slate-500">Previewing: {topic}</div>
            </div>
          </div>
          <PrintPreview data={generatedData as any} />
        </div>
      )}
    </div>
  );
};

export default Index;
