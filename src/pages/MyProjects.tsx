import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { BookData } from '@/lib/bookTypes';
import { Button } from '@/components/ui/button';
import { LogOut, BookOpen, Plus } from 'lucide-react';

interface SavedBook {
  id: string;
  topic: string;
  title: string;
  created_at: string;
}

const MyProjects = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<SavedBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchBooks = async () => {
      if (!user) return;

      // Fetch saved projects joined with books
      const { data, error } = await supabase
        .from('saved_projects')
        .select(`
          id,
          created_at,
          books (
            id,
            topic,
            title,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Transform the data to flatten the book info
        const transformedBooks = data
          .filter(item => item.books)
          .map(item => ({
            id: (item.books as any).id,
            topic: (item.books as any).topic,
            title: (item.books as any).title,
            created_at: (item.books as any).created_at,
          }));
        setBooks(transformedBooks);
      }
      setLoadingBooks(false);
    };

    if (user) {
      fetchBooks();
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button onClick={() => navigate('/')} className="hover:opacity-70 transition-opacity">
            <Logo />
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
              My Projects
            </h1>
            <Button onClick={() => navigate('/')} className="gap-2">
              <Plus className="h-4 w-4" />
              New Guide
            </Button>
          </div>

          {loadingBooks ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading your projects...
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h2 className="font-serif text-xl text-foreground mb-2">No projects yet</h2>
              <p className="text-muted-foreground mb-6">
                Create your first how-to guide to get started.
              </p>
              <Button onClick={() => navigate('/')}>
                Create Your First Guide
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="p-6 rounded-lg border border-border bg-card hover:shadow-card transition-shadow cursor-pointer"
                  onClick={() => {
                    // For now, just show the book title - could link to view later
                  }}
                >
                  <h3 className="font-serif text-lg font-medium text-foreground mb-1">
                    {book.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Topic: {book.topic}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Created {new Date(book.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MyProjects;
