import { useState, useEffect, useMemo } from "react";
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
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const { user, profile, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();

  const isPaid = false; // Toggle this based on your business logic

  const handleOpenAuthModal = () => setAuthModalOpen(true);
  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState("loading");

    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { title: `Artisan Guide: ${query}`, topic: query },
      });

      if (error) throw error;

      const geminiContent = data.content;
      const formattedBook: BookData = {
        title: geminiContent.title || `Mastering ${query}`,
        displayTitle: geminiContent.title || `Mastering ${query}`,
        subtitle: geminiContent.preface?.substring(0, 120) + "...",
        tableOfContents: geminiContent.chapters.map((ch: any) => ({
          title: ch.title,
          description: ch.description,
        })),
        chapter1Content: geminiContent.chapters[0]?.description || geminiContent.preface,
        localResources: [],
        hasDisclaimer: true,
      };

      setBookData(formattedBook);
      setViewState("book");

      // Cover Image (Background)
      setIsLoadingCoverImage(true);
      supabase.functions
        .invoke("generate-cover-image", {
          body: { title: formattedBook.title, topic: query },
        })
        .then(({ data: imgData }) => {
          setIsLoadingCoverImage(false);
          if (imgData?.imageUrl) setCoverImageUrl(imgData.imageUrl);
        });
    } catch (err: any) {
      toast.error("Generation failed. Please try again.");
      setViewState("landing");
    }
  };

  const handleDownloadPDF = async () => {
    if (!bookData) return;
    toast.loading("Preparing PDF...", { id: "pdf" });
    await generateGuidePDF({ title: bookData.displayTitle || bookData.title, topic, bookData });
    toast.success("Downloaded!", { id: "pdf" });
  };

  const handleStartOver = () => {
    setViewState("landing");
    setTopic("");
    setBookData(null);
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button onClick={handleStartOver} className="hover:opacity-70 transition-opacity">
            <Logo />
          </button>
          <div className="flex items-center gap-3">
            {viewState === "book" && (
              <button onClick={handleStartOver} className="text-sm text-muted-foreground hover:text-foreground">
                New Guide
              </button>
            )}
            {!authLoading &&
              (user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hover:opacity-80">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback>{getInitials(user?.user_metadata?.name)}</AvatarFallback>
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
                <Button variant="outline" size="sm" onClick={handleOpenAuthModal}>
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
              <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">Learn anything.</h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Beautiful, custom how-to guides crafted just for you.
              </p>
            </div>
            <SearchInput onSearch={handleSearch} />
          </div>
        )}

        {viewState === "loading" && <LoadingAnimation />}

        {viewState === "book" && (
          <div className="py-12 animate-fade-in">
            {!user && <SaveToCloudBanner onSignIn={handleOpenAuthModal} />}
            <BookCover
              title={bookData?.displayTitle || `Mastering ${topic}`}
              subtitle={bookData?.subtitle}
              topic={topic}
              coverImageUrl={coverImageUrl}
              isLoadingImage={isLoadingCoverImage}
            />

            <div className="flex flex-col items-center mt-8 gap-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleDownloadPDF} variant={isPaid ? "default" : "outline"} className="gap-2">
                  <Download className="w-4 h-4" /> PDF Guide
                </Button>
                {!isPaid && (
                  <Button className="gap-2 bg-stone-900 text-white hover:bg-stone-800">
                    <Sparkles className="w-4 h-4" /> Unlock Full Guide — $4.99
                  </Button>
                )}
              </div>
            </div>

            <section className="mt-12 mb-8">
              <TableOfContents topic={topic} chapters={bookData?.tableOfContents} />
            </section>

            <section>
              <ChapterContent
                topic={topic}
                content={bookData?.chapter1Content}
                materials={extractMaterials(bookData?.chapter1Content)}
                isGenerating={isGeneratingDiagrams}
                diagramImages={diagramImages}
                tableOfContents={bookData?.tableOfContents}
              />
            </section>
            {!isPaid && (
              <PaywallOverlay onPurchase={() => toast.info("Payment coming soon")} onDownload={handleDownloadPDF} />
            )}
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
