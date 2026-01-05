import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, BookOpen, Calendar, MoreVertical, Trash2, Download, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { generateGuidePDF } from '@/lib/generatePDF';
import { generateGuideEPUB } from '@/lib/generateEPUB';
import { BookData } from '@/lib/bookTypes';

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

  useEffect(() => {
    if (!loading && !user) {
      toast.error('Please sign in to view your library.');
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchSavedBooks = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('saved_projects')
        .select(`
          id,
          book_id,
          created_at,
          books (
            id,
            title,
            topic,
            chapter1_content,
            table_of_contents,
            local_resources,
            has_disclaimer
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSavedBooks(data as SavedBook[]);
      }
      setLoadingBooks(false);
    };

    if (user) {
      fetchSavedBooks();
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDeleteBook = async (savedBookId: string) => {
    const { error } = await supabase
      .from('saved_projects')
      .delete()
      .eq('id', savedBookId);

    if (error) {
      toast.error('Failed to delete guide');
    } else {
      setSavedBooks(savedBooks.filter(b => b.id !== savedBookId));
      toast.success('Guide removed from library');
    }
  };

  const handleDownloadPDF = async (book: SavedBook['books']) => {
    if (!book) return;
    
    setDownloadingId(book.id);
    try {
      const bookData: BookData = {
        title: book.title,
        displayTitle: book.title.split(' ').slice(0, 5).join(' '),
        subtitle: `A Comprehensive Guide to ${book.topic}`,
        tableOfContents: book.table_of_contents || [],
        chapter1Content: book.chapter1_content,
        localResources: book.local_resources || [],
        hasDisclaimer: book.has_disclaimer,
      };

      await generateGuidePDF({
        title: bookData.displayTitle,
        topic: book.topic,
        bookData,
      });
      toast.success('PDF downloaded!');
    } catch (error) {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadKindle = async (book: SavedBook['books']) => {
    if (!book) return;
    
    setDownloadingId(book.id + '-kindle');
    try {
      const bookData: BookData = {
        title: book.title,
        displayTitle: book.title.split(' ').slice(0, 5).join(' '),
        subtitle: `A Comprehensive Guide to ${book.topic}`,
        tableOfContents: book.table_of_contents || [],
        chapter1Content: book.chapter1_content,
        localResources: book.local_resources || [],
        hasDisclaimer: book.has_disclaimer,
      };

      await generateGuideEPUB({
        title: bookData.displayTitle,
        topic: book.topic,
        bookData,
      });
      toast.success('Kindle file downloaded!');
    } catch (error) {
      toast.error('Failed to generate Kindle file');
    } finally {
      setDownloadingId(null);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getDisplayName = () => {
    if (profile?.full_name) return profile.full_name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.user_metadata?.name) return user.user_metadata.name;
    if (user?.email) return user.email.split('@')[0];
    return 'Artisan';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-end gap-2 h-12">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 bg-foreground/60 rounded-full animate-weave"
                style={{ height: '100%', animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <p className="text-muted-foreground font-serif">Loading your studio...</p>
        </div>
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
          <Link to="/" className="hover:opacity-70 transition-opacity">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="hidden sm:flex gap-2"
            >
              <Plus className="h-4 w-4" />
              New Guide
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <span className="text-sm text-muted-foreground hidden md:block">
                    {getDisplayName()}
                  </span>
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-secondary text-xs font-serif">
                      {getInitials(profile?.full_name || user?.user_metadata?.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-muted-foreground">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-12">
        <div className="max-w-5xl mx-auto">
          {/* Welcome Header */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-[2px] opacity-40">
                <div className="w-[1.5px] h-4 bg-foreground rounded-full" />
                <div className="w-[1.5px] h-4 bg-foreground rounded-full" />
                <div className="w-[1.5px] h-4 bg-foreground rounded-full" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Your Studio
              </p>
            </div>
            <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground mb-2">
              Welcome, {getDisplayName().split(' ')[0]}
            </h1>
            <p className="text-muted-foreground text-lg">
              Your artisan guides, woven with care.
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-10">
            <div className="flex-1 h-[1px] bg-border" />
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-serif">
              Your Library
            </span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          {loadingBooks ? (
            <div className="text-center py-20 text-muted-foreground">
              Loading your guides...
            </div>
          ) : savedBooks.length === 0 ? (
            /* Empty State */
            <div className="text-center py-20">
              <div className="relative inline-block mb-8">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-border flex items-center justify-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                </div>
                {/* Decorative corners */}
                <div className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-foreground/20" />
                <div className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-foreground/20" />
                <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-foreground/20" />
                <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-foreground/20" />
              </div>
              <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-3">
                Start Your First Weaving
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Create beautiful, AI-crafted how-to guides on any topic. Your first masterpiece awaits.
              </p>
              <Button onClick={() => navigate('/')} size="lg" className="gap-2 font-serif">
                <Plus className="h-4 w-4" />
                Create Your First Guide
              </Button>
            </div>
          ) : (
            /* Saved Books Grid */
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {savedBooks.map((saved) => (
                <div
                  key={saved.id}
                  className="group relative bg-card border border-border rounded-lg overflow-hidden hover:shadow-card transition-all duration-300"
                >
                  {/* Card Header */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-secondary/50 to-secondary flex items-center justify-center relative">
                    {/* Blueprint pattern */}
                    <div className="absolute inset-0 opacity-[0.03]" style={{
                      backgroundImage: `
                        linear-gradient(to right, currentColor 1px, transparent 1px),
                        linear-gradient(to bottom, currentColor 1px, transparent 1px)
                      `,
                      backgroundSize: '15px 15px'
                    }} />
                    
                    {/* Center icon */}
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border border-foreground/10 flex items-center justify-center">
                        <BookOpen className="h-7 w-7 text-foreground/30" />
                      </div>
                    </div>

                    {/* Actions dropdown */}
                    <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors">
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem 
                            onClick={() => handleDownloadPDF(saved.books)}
                            disabled={downloadingId === saved.books?.id}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDownloadKindle(saved.books)}
                            disabled={downloadingId === saved.books?.id + '-kindle'}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Download Kindle (.epub)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDeleteBook(saved.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-5">
                    <h3 className="font-serif text-lg font-medium text-foreground mb-2 line-clamp-2">
                      {saved.books?.title || 'Untitled Guide'}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                      {saved.books?.topic}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(saved.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    
                    {/* Download buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => handleDownloadPDF(saved.books)}
                        disabled={downloadingId === saved.books?.id}
                      >
                        <Download className="h-3 w-3" />
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => handleDownloadKindle(saved.books)}
                        disabled={downloadingId === saved.books?.id + '-kindle'}
                      >
                        <FileText className="h-3 w-3" />
                        Kindle
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Card */}
              <button
                onClick={() => navigate('/')}
                className="group aspect-[4/3] sm:aspect-auto sm:min-h-[280px] border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-4 hover:border-foreground/30 hover:bg-secondary/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-full border border-foreground/20 flex items-center justify-center group-hover:border-foreground/40 transition-colors">
                  <Plus className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors font-serif">
                  New Guide
                </span>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
