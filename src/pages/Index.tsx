import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, BookOpen, Sparkles } from "lucide-react";

const Index = () => {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!title || !topic) {
      toast({
        title: "Missing Information",
        description: "Please enter both a title and a topic.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Calling the Edge Function we fixed earlier
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { title, topic },
      });

      if (error) throw error;

      toast({
        title: "Book Generated!",
        description: "Your luxury guide outline is ready.",
      });

      console.log("Book Content:", data.content);
      // Here you would normally navigate to a viewer page or save to DB
    } catch (err: any) {
      console.error("Generation Error:", err);
      toast({
        title: "Generation Failed",
        description: err.message || "Could not connect to the generator.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f5f2] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl shadow-2xl border border-stone-200">
        <div className="text-center space-y-3">
          <div className="bg-stone-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8 text-stone-700" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-stone-900">Artisan Archivist</h1>
          <p className="text-stone-500 italic">Weaving high-end instructional guides</p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest font-semibold text-stone-400 ml-1">Title</label>
            <Input
              className="border-stone-200 focus:border-stone-400 transition-colors"
              placeholder="The Porsche 911 Restoration"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest font-semibold text-stone-400 ml-1">Focus Area</label>
            <Input
              className="border-stone-200 focus:border-stone-400 transition-colors"
              placeholder="Air-cooled engine assembly"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <Button
            className="w-full bg-stone-900 hover:bg-stone-800 text-white h-12 rounded-xl transition-all active:scale-[0.98]"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Transcribing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Generate Masterpiece
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

// This line fixes error TS1192
export default Index;
