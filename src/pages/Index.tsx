import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BookOpen } from "lucide-react";

const Index = () => {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleGenerate = async () => {
    if (!title || !topic) {
      toast({
        title: "Missing information",
        description: "Please provide both a title and a topic.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      // 1. Generate the Book Structure
      const { data: bookData, error: bookError } = await supabase.functions.invoke("generate-book", {
        body: { title, topic },
      });

      if (bookError) throw bookError;

      // 2. Generate the Cover Image (Force Photo)
      const { data: coverData, error: coverError } = await supabase.functions.invoke("generate-cover-image", {
        body: {
          title,
          topic,
          variant: "photo", // Changed from diagram to photo
        },
      });

      if (coverError) console.error("Cover generation failed, continuing...");

      // 3. Save to Database
      const { data: newBook, error: dbError } = await supabase
        .from("books")
        .insert({
          title,
          topic,
          content: bookData.content,
          cover_url: coverData?.imageUrl,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // 4. Generate Chapter Photos (No more diagrams)
      const chapters = bookData.content.chapters;
      for (const [index, chapter] of chapters.entries()) {
        const { data: plateData } = await supabase.functions.invoke("generate-cover-image", {
          body: {
            title: chapter.title,
            topic: chapter.description,
            variant: "photo", // Force high-res photo for chapters too
          },
        });

        if (plateData?.imageUrl) {
          await supabase.from("plates").insert({
            book_id: newBook.id,
            chapter_index: index,
            image_url: plateData.imageUrl,
            caption: chapter.title,
          });
        }
      }

      toast({
        title: "Success!",
        description: "Your luxury guide has been woven.",
      });

      navigate(`/book/${newBook.id}`);
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-stone-200">
        <div className="text-center">
          <BookOpen className="w-12 h-12 mx-auto text-stone-800 mb-4" />
          <h1 className="text-3xl font-serif text-stone-900">Loom & Page</h1>
          <p className="text-stone-500 mt-2">Create your artisan instructional guide</p>
        </div>

        <div className="space-y-4">
          <Input
            placeholder="Book Title (e.g. The Porsche 911 Manual)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-stone-200"
          />
          <Input
            placeholder="Topic (e.g. Restoring a vintage flat-six engine)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="border-stone-200"
          />
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Weaving Guide...
              </>
            ) : (
              "Generate Artisan Guide"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
