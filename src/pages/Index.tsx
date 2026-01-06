import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Logo from "@/components/Logo";
import SearchInput from "@/components/SearchInput";
import LoadingAnimation from "@/components/LoadingAnimation";
import BookCover from "@/components/BookCover";
import TableOfContents from "@/components/TableOfContents";
import ChapterContent from "@/components/ChapterContent";
import PaywallOverlay from "@/components/PaywallOverlay";
import Footer from "@/components/Footer";
import SaveToCloudBanner from "@/components/SaveToCloudBanner";
import AuthModal from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BookData } from "@/lib/bookTypes";
import { useAuth } from "@/contexts/AuthContext";
import { generateGuidePDF } from "@/lib/generatePDF";
import { Download, Sparkles } from "lucide-react";

type ViewState = "landing" | "loading" | "book";

const getSessionId = (): string => {
  const stored = localStorage.getItem("loom_page_session_id");
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem("loom_page_session_id", newId);
  return newId;
};

const extractMaterials = (content?: string): string[] => {
  if (!content) return [];
  const materialPatterns = [/materials?:?\s*([^\n]+)/gi, /supplies?:?\s*([^\n]+)/gi, /tools?:?\s*([^\n]+)/gi];
  const materials: string[] = [];
  for (const pattern of materialPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const items = match[1]
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 2 && s.length < 50);
        materials.push(...items.slice(0, 5));
      }
    }
  }
  return [...new Set(materials)].slice(0, 5);
};

const Index = () => {
  const [searchParams] = useSearchParams();
  const [viewState, setViewState] = useState<ViewState>("landing");
  const [topic, setTopic] = useState("");
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isLoadingCoverImage, setIsLoadingCoverImage] = useState(false);
  const [diagramImages, setDiagramImages] = useState<Record<string, string>>({});
  const { user, profile, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const bookRef = useRef<HTMLDivElement>(null);

  const isPaid = false;

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState("loading");
    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { title: `Artisan Guide: ${query}`, topic: query },
      });
      if (error) throw error;

      const content = data.content;
      const formattedBook: BookData = {
        title: content.title || `Mastering ${query}`,
        displayTitle: content.title || `Mastering ${query}`,
        subtitle: content.preface?.substring(0, 120) + "...",
        tableOfContents: content.chapters.map((ch: any) => ({ title: ch.title, description: ch.description })),
        chapter1Content: content.chapters[0]?.description || content.preface,
        localResources: [],
        hasDisclaimer: true,
      };

      setBookData(formattedBook);
      setViewState("book");

      setIsLoadingCoverImage(true);
      supabase.functions
        .invoke("generate-cover-image", {
          body: { title: formattedBook.title, topic: query },
        })
        .then(({ data: imgData }) => {
          setIsLoadingCoverImage(false);
          if (imgData?.imageUrl) setCoverImageUrl(imgData.imageUrl);
        });
    } catch (err) {
      toast.error("Generation failed.");
      setViewState("landing");
    }
  };

  const handleDownloadPDF = async () => {
    if (!bookData || !bookRef.current) return;
    try {
      toast.loading("Capturing high-res guide...", { id: "pdf" });
      await generateGuidePDF({
        title: bookData.displayTitle || bookData.title,
        topic,
        bookData,
        previewElement: bookRef.current,
        isAdmin: true,
      });
      toast.success("Luxury PDF Ready!", { id: "pdf" });
    } catch (error) {
      toast.error("PDF Failed", { id: "pdf" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button onClick={() => setViewState("landing")} className="hover:opacity-70 transition-opacity">
            <Logo />
          </button>
          <div className="flex items-center gap-3">
            {!authLoading &&
              (user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hover:opacity-80">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate("/dashboard")}>Dashboard</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setAuthModalOpen(true)}>
                  Join
                </Button>
              ))}
          </div>
        </div>
      </header>

      <main className="container">
        {viewState === "landing" && (
          <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center px-4">
            <div className="text-center mb-10 animate-fade-up">
              <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4">Learn anything.</h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Beautiful artisan guides crafted for you.
              </p>
            </div>
            <SearchInput onSearch={handleSearch} />
          </div>
        )}

        {viewState === "loading" && <LoadingAnimation />}

        {viewState === "book" && (
          <div ref={bookRef} className="py-12 animate-fade-in bg-white">
            <BookCover
              title={bookData?.displayTitle || `Mastering ${topic}`}
              subtitle={bookData?.subtitle}
              topic={topic}
              coverImageUrl={coverImageUrl}
              isLoadingImage={isLoadingCoverImage}
            />
            <div className="flex flex-col items-center mt-8 gap-4">
              <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
                <Download className="w-4 h-4" /> PDF Guide
              </Button>
            </div>
            <section className="mt-12 mb-8">
              <TableOfContents topic={topic} chapters={bookData?.tableOfContents} />
            </section>
            <section>
              <ChapterContent
                topic={topic}
                content={bookData?.chapter1Content}
                materials={extractMaterials(bookData?.chapter1Content)}
                isGenerating={false}
                diagramImages={diagramImages}
                tableOfContents={bookData?.tableOfContents}
              />
            </section>
            {!isPaid && <PaywallOverlay onPurchase={() => {}} onDownload={handleDownloadPDF} />}
          </div>
        )}
      </main>
      <Footer />
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onGoogleSignIn={signInWithGoogle}
        isAuthenticating={false}
      />
    </div>
  );
};

export default Index;
