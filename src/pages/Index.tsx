import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import SearchInput from "@/components/SearchInput";
import LoadingAnimation from "@/components/LoadingAnimation";
import BookCover from "@/components/BookCover";
import TableOfContents from "@/components/TableOfContents";
import ChapterContent from "@/components/ChapterContent";
import Footer from "@/components/Footer";
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
import { Download } from "lucide-react";

type ViewState = "landing" | "loading" | "book";

const Index = () => {
  const [viewState, setViewState] = useState<ViewState>("landing");
  const [topic, setTopic] = useState("");
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isLoadingCoverImage, setIsLoadingCoverImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const bookRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState("loading");
    setErrorMessage(null);
    setCoverImageUrl(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: { topic: query },
      });

      if (error) {
        console.error("Edge function error:", error);
        setErrorMessage(`Edge function error: ${error.message}`);
        toast.error(`Generation failed: ${error.message}`);
        setViewState("landing");
        return;
      }

      if (data?.error) {
        console.error("API error:", data.error);
        setErrorMessage(`API error: ${data.error}`);
        toast.error(`Generation failed: ${data.error}`);
        setViewState("landing");
        return;
      }

      const content = data?.content;
      if (!content) {
        setErrorMessage("No content returned from API");
        toast.error("No content returned from API");
        setViewState("landing");
        return;
      }

      // Safely build BookData with all required fields
      const formattedBook: BookData = {
        title: content.title || `Mastering ${query}`,
        displayTitle: content.displayTitle || content.title || `Mastering ${query}`,
        subtitle: content.subtitle || (content.preface ? content.preface.substring(0, 120) + "..." : ""),
        preface: content.preface || "",
        topic: query,
        chapters: Array.isArray(content.chapters)
          ? content.chapters.map((ch: any) => ({
              title: ch?.title || "Untitled Chapter",
              description: ch?.description || "",
            }))
          : [],
        tableOfContents: Array.isArray(content.tableOfContents)
          ? content.tableOfContents
          : Array.isArray(content.chapters)
          ? content.chapters.map((ch: any, idx: number) => ({
              chapter: idx + 1,
              title: ch?.title || `Chapter ${idx + 1}`,
            }))
          : [],
        chapter1Content:
          content.chapters?.[0]?.description || content.preface || "",
        localResources: content.localResources || [],
        hasDisclaimer: content.hasDisclaimer ?? true,
      };

      setBookData(formattedBook);
      setViewState("book");

      // Generate cover image
      setIsLoadingCoverImage(true);
      supabase.functions
        .invoke("generate-cover-image", {
          body: { title: formattedBook.title, topic: query },
        })
        .then(({ data: imgData, error: imgError }) => {
          setIsLoadingCoverImage(false);
          if (imgError) {
            console.error("Cover image error:", imgError);
          } else if (imgData?.imageUrl) {
            setCoverImageUrl(imgData.imageUrl);
          }
        })
        .catch((err) => {
          setIsLoadingCoverImage(false);
          console.error("Cover image exception:", err);
        });
    } catch (err: any) {
      console.error("Unexpected error:", err);
      setErrorMessage(`Unexpected error: ${err?.message || "Unknown error"}`);
      toast.error(`Generation failed: ${err?.message || "Unknown error"}`);
      setViewState("landing");
    }
  };

  const handleDownloadPDF = async () => {
    if (!bookData || !bookRef.current) return;
    try {
      toast.loading("Generating PDF...", { id: "pdf" });
      await generateGuidePDF({
        title: bookData.displayTitle || bookData.title,
        topic,
        bookData,
        previewElement: bookRef.current,
        isAdmin: false,
      });
      toast.success("PDF Ready!", { id: "pdf" });
    } catch (error: any) {
      console.error("PDF error:", error);
      toast.error(`PDF Failed: ${error?.message || "Unknown error"}`, { id: "pdf" });
    }
  };

  const handlePurchase = () => {
    toast.info("Stripe integration coming soon! Full book purchase will be enabled shortly.");
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button
            onClick={() => {
              setViewState("landing");
              setErrorMessage(null);
            }}
            className="hover:opacity-70 transition-opacity"
          >
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
                    <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                      Dashboard
                    </DropdownMenuItem>
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
              <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4">
                Learn anything.
              </h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Beautiful artisan guides crafted for you.
              </p>
            </div>
            <SearchInput onSearch={handleSearch} />
            {errorMessage && (
              <div className="mt-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg max-w-lg">
                <p className="text-sm text-destructive font-medium">Error:</p>
                <p className="text-sm text-destructive/80 mt-1">{errorMessage}</p>
              </div>
            )}
          </div>
        )}

        {viewState === "loading" && <LoadingAnimation />}

        {viewState === "book" && bookData && (
          <div className="py-12 animate-fade-in">
            {/* Book Cover with page break for PDF */}
            <div ref={bookRef} className="pdf-content">
              <div className="pdf-page-break">
                <BookCover
                  title={bookData.displayTitle || bookData.title}
                  subtitle={bookData.subtitle}
                  topic={topic}
                  coverImageUrl={coverImageUrl}
                  isLoadingImage={isLoadingCoverImage}
                />
              </div>

              {/* Action Buttons - Top */}
              <div className="flex flex-col sm:flex-row items-center justify-center mt-8 gap-4 no-pdf-capture">
                <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" /> Download Preview PDF
                </Button>
                <Button onClick={handlePurchase} size="lg" className="gap-2 bg-slate-900 hover:bg-slate-800 text-white">
                  Purchase Full Book
                </Button>
              </div>

              {/* Table of Contents with page break */}
              <section className="mt-12 mb-8 pdf-page-break">
                <TableOfContents topic={topic} chapters={bookData.tableOfContents} />
              </section>

              {/* Chapter 1 Content */}
              <section className="pdf-page-break">
                <ChapterContent
                  topic={topic}
                  content={bookData.chapter1Content}
                  localResources={bookData.localResources}
                  hasDisclaimer={bookData.hasDisclaimer}
                  isGenerating={false}
                />
              </section>
            </div>

            {/* Large Purchase Button - Bottom (outside PDF capture) */}
            <div className="flex justify-center mt-16 pt-8 border-t border-border no-pdf-capture">
              <Button onClick={handlePurchase} size="lg" className="gap-2 bg-slate-900 hover:bg-slate-800 text-white text-lg px-12 py-6">
                Purchase Full Book - Unlock All Chapters
              </Button>
            </div>
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
