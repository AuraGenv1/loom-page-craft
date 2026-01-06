import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Book, Loader2, RefreshCw } from "lucide-react";
import Logo from "@/components/Logo";
import { toast } from "sonner";

interface SavedBook {
  id: string;
  topic: string;
  title: string;
  created_at: string;
  coverImage?: string;
}

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<SavedBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchBooks = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("books")
          .select("id, topic, title, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching books:", error);
          toast.error("Failed to load your guides");
        } else {
          setBooks(data || []);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
      } finally {
        setLoadingBooks(false);
      }
    };

    if (user) {
      fetchBooks();
    }
  }, [user]);

  const handlePurchase = (bookId: string) => {
    toast.info("Stripe integration coming soon! Full book purchase will be enabled shortly.");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Logo />
            </Link>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-serif">
              My Guides
            </span>
          </div>
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Title and New Guide Button */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-3xl text-foreground">My Artisan Guides</h1>
          <Link to="/">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Guide
            </Button>
          </Link>
        </div>

        {loadingBooks ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-xl border-2 border-dashed border-border">
            <Book className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-4">You haven't generated any guides yet.</p>
            <Link to="/">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Generate Your First Guide
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => (
              <div
                key={book.id}
                className="bg-card rounded-xl border border-border shadow-card overflow-hidden hover:shadow-book transition-shadow duration-300"
              >
                {/* Book Cover Placeholder */}
                <div className="aspect-[3/4] bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                  <Book className="w-16 h-16 text-muted-foreground/30" />
                </div>

                {/* Book Info */}
                <div className="p-4">
                  <h3 className="font-serif text-lg font-semibold text-foreground line-clamp-2 mb-1">
                    {book.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">{book.topic}</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Created {new Date(book.created_at).toLocaleDateString()}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePurchase(book.id)}
                      size="sm"
                      className="flex-1 gap-1 bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Purchase
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Update
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
