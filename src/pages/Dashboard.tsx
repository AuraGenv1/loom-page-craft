import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, BookOpen, Download } from "lucide-react";
import { toast } from "sonner";
import { generateGuidePDF } from "@/lib/generatePDF";
import { BookData } from "@/lib/bookTypes";
import BookCover from "@/components/BookCover";
import TableOfContents from "@/components/TableOfContents";
import ChapterContent from "@/components/ChapterContent";

interface SavedBook {
  id: string;
  book_id: string;
  created_at: string;
  books: {
    id: string;
    title: string;
    topic: string;
    chapter1_content: string;
    table_of_contents: any;
    local_resources: any;
    has_disclaimer: boolean;
  } | null;
}

const Dashboard = () => {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pdfBookData, setPdfBookData] = useState<BookData | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      toast.error("Please sign in to view your library.");
      navigate("/");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchSavedBooks = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from("saved_projects")
        .select(
          `id, book_id, created_at, books (id, title, topic, chapter1_content, table_of_contents, local_resources, has_disclaimer)`,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) setSavedBooks(data as SavedBook[]);
      setLoadingBooks(false);
    };
    if (user) fetchSavedBooks();
  }, [user]);

  const handleDownloadPDF = async (book: SavedBook["books"]) => {
    if (!book) return;
    setDownloadingId(book.id);
    try {
      const bookData: BookData = {
        title: book.title,
        displayTitle: book.title.split(" ").slice(0, 5).join(" "),
        subtitle: `A Comprehensive Guide to ${book.topic}`,
        tableOfContents: book.table_of_contents || [],
        chapter1Content: book.chapter1_content,
        localResources: book.local_resources || [],
        hasDisclaimer: book.has_disclaimer,
      };

      setPdfBookData(bookData);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (hiddenContainerRef.current) {
        await generateGuidePDF({
          title: bookData.displayTitle,
          topic: book.topic,
          bookData,
          previewElement: hiddenContainerRef.current,
        });
      }
      toast.success("PDF downloaded!");
    } catch (error) {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) return <div className="p-10 text-center">Loading Studio...</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <Link to="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="hidden sm:flex gap-2">
              <Plus className="h-4 w-4" /> New Guide
            </Button>
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={profile?.avatar_url} />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-serif text-3xl mb-8">Your Library</h1>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {savedBooks.map((saved) => (
              <div key={saved.id} className="bg-card border rounded-lg p-5 flex flex-col justify-between h-[200px]">
                <h3 className="font-serif text-lg mb-2 line-clamp-2">{saved.books?.title}</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-auto"
                  onClick={() => handleDownloadPDF(saved.books)}
                  disabled={downloadingId === saved.books?.id}
                >
                  <Download className="h-3 w-3 mr-1" />{" "}
                  {downloadingId === saved.books?.id ? "Processing..." : "Download PDF"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {pdfBookData && (
        <div
          ref={hiddenContainerRef}
          className="fixed bg-white"
          style={{ left: "-10000px", top: "0", width: "800px", visibility: "visible", zIndex: -1 }}
        >
          <BookCover title={pdfBookData.displayTitle} topic={pdfBookData.title} />
          <div className="p-10">
            <TableOfContents topic={pdfBookData.title} chapters={pdfBookData.tableOfContents} />
          </div>
          <div className="p-10">
            <ChapterContent
              topic={pdfBookData.title}
              content={pdfBookData.chapter1Content}
              tableOfContents={pdfBookData.tableOfContents}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
