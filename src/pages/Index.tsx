import { useState, useEffect } from "react";
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
  const navigate = useNavigate();

  const handleGenerate = async (topic: string) => {
    // LOCKDOWN: Reset everything before starting
    setActiveBook(null);
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { topic },
      });

      if (error) throw error;

      // Ensure the state is updated only with the fresh AI data
      setActiveBook(data);
      
      toast({
        title: "Volume Created",
        description: "Your luxury instructional guide is ready.",
      });
    } catch (error: any) {
      console