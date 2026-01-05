import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '@/components/Logo';
import SearchInput from '@/components/SearchInput';
import LoadingAnimation from '@/components/LoadingAnimation';
import BookCover from '@/components/BookCover';
import TableOfContents from '@/components/TableOfContents';
import ChapterContent from '@/components/ChapterContent';
import PaywallOverlay from '@/components/PaywallOverlay';
import Footer from '@/components/Footer';
import SaveToCloudBanner from '@/components/SaveToCloudBanner';
import AuthModal from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BookData } from '@/lib/bookTypes';
import { useAuth } from '@/contexts/AuthContext';
import { generateGuidePDF } from '@/lib/generatePDF';
import { Download, Sparkles, FlaskConical } from 'lucide-react';

// Admin email for test mode access
const ADMIN_EMAIL = 'admin@loomandpage.com'; // Update this to your admin email

type ViewState = 'landing' | 'loading' | 'book';

// Generate or retrieve a session ID for anonymous users
const getSessionId = (): string => {
  const stored = localStorage.getItem('loom_page_session_id');
  if (stored) return stored;
  
  const newId = crypto.randomUUID();
  localStorage.setItem('loom_page_session_id', newId);
  return newId;
};

// Extract material keywords from chapter content for better local search
const extractMaterials = (content?: string): string[] => {
  if (!content) return [];
  
  // Look for common material list patterns
  const materialPatterns = [
    /materials?:?\s*([^\n]+)/gi,
    /supplies?:?\s*([^\n]+)/gi,
    /you(?:'ll)? need:?\s*([^\n]+)/gi,
    /ingredients?:?\s*([^\n]+)/gi,
    /tools?:?\s*([^\n]+)/gi,
  ];
  
  const materials: string[] = [];
  
  for (const pattern of materialPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        // Split by common delimiters and clean up
        const items = match[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
        materials.push(...items.slice(0, 5));
      }
    }
  }
  
  // Return unique materials, limited to top 5
  return [...new Set(materials)].slice(0, 5);
};

const Index = () => {
  const [searchParams] = useSearchParams();
  const [viewState, setViewState] = useState<ViewState>('landing');
  const [topic, setTopic] = useState('');
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isLoadingCoverImage, setIsLoadingCoverImage] = useState(false);
  const { user, profile, loading: authLoading, isAuthenticating, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();

  // Test mode: enabled via ?test=true URL param OR admin user
  const isTestMode = useMemo(() => {
    const testParam = searchParams.get('test') === 'true';
    const isAdmin = user?.email === ADMIN_EMAIL;
    return testParam || isAdmin;
  }, [searchParams, user?.email]);

  // In test mode, content is fully unlocked (simulates paid state)
  const isPaid = isTestMode;

  const handleOpenAuthModal = () => {
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Check for existing book on mount
  // For authenticated users: query their books directly
  // For guests: use RPC function with session_id
  useEffect(() => {
    if (authLoading) return;
    
    const checkExistingBook = async () => {
      let data = null;
      let error = null;

      if (user) {
        // Authenticated user: direct query (RLS allows this)
        const result = await supabase
          .from('books')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = result.data;
        error = result.error;
      } else {
        // Guest: use session-based RPC function
        const sessionId = getSessionId();
        const result = await supabase.rpc('get_book_by_session', { p_session_id: sessionId });
        data = result.data?.[0] || null;
        error = result.error;
      }

      if (data && !error) {
        // Generate fallback displayTitle from stored title
        const words = data.title.split(' ');
        const fallbackDisplayTitle = words.slice(0, 5).join(' ');
        
        setBookData({
          title: data.title,
          displayTitle: fallbackDisplayTitle,
          subtitle: `A Comprehensive Guide to ${data.topic}`,
          tableOfContents: data.table_of_contents as unknown as BookData['tableOfContents'],
          chapter1Content: data.chapter1_content,
          localResources: data.local_resources as unknown as BookData['localResources'],
          hasDisclaimer: data.has_disclaimer ?? false,
        });
        setTopic(data.topic);
        setBookId(data.id);
        setViewState('book');
      }
    };

    checkExistingBook();
  }, [user, authLoading]);

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState('loading');
    setCoverImageUrl(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-book', {
        body: { topic: query }
      });

      if (error) {
        console.error('Error generating book:', error);

        let message = 'Failed to generate your guide. Please try again.';
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error && typeof body.error === 'string') {
              message = body.error;
            }
          } catch {
            // ignore JSON parse errors
          }
        }

        toast.error(message);
        setViewState('landing');
        return;
      }

      if (data.error) {
        console.error('API error:', data.error);
        toast.error(data.error);
        setViewState('landing');
        return;
      }

      const generatedBook = data as BookData;
      setBookData(generatedBook);

      // Save to database (user_id is null for guests)
      const sessionId = getSessionId();
      const { data: savedBook, error: saveError } = await supabase
        .from('books')
        .insert([{
          topic: query,
          title: generatedBook.title,
          table_of_contents: JSON.parse(JSON.stringify(generatedBook.tableOfContents)),
          chapter1_content: generatedBook.chapter1Content,
          local_resources: JSON.parse(JSON.stringify(generatedBook.localResources || [])),
          has_disclaimer: generatedBook.hasDisclaimer || false,
          session_id: sessionId,
          user_id: user?.id || null,
        }])
        .select()
        .single();

      if (saveError) {
        console.error('Error saving book:', saveError);
        toast.error('Failed to save your guide. Please try again.');
        setViewState('landing');
        return;
      }

      setBookId(savedBook.id);
      
      // Only save to saved_projects if user is logged in
      if (user) {
        const { error: saveProjectError } = await supabase
          .from('saved_projects')
          .insert([{
            user_id: user.id,
            book_id: savedBook.id,
          }]);
        
        if (saveProjectError) {
          console.error('Error saving to projects:', saveProjectError);
        }
      }

      setViewState('book');

      // Generate cover image in background (non-blocking)
      setIsLoadingCoverImage(true);
      supabase.functions.invoke('generate-cover-image', {
        body: { title: generatedBook.title, topic: query }
      }).then(({ data: imageData, error: imageError }) => {
        setIsLoadingCoverImage(false);
        if (!imageError && imageData?.imageUrl) {
          setCoverImageUrl(imageData.imageUrl);
        } else {
          console.log('Cover image generation skipped or failed:', imageError);
        }
      });

    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Something went wrong. Please try again.');
      setViewState('landing');
    }
  };

  const handlePurchase = () => {
    toast.success('Thank you! Your complete guide is now unlocked.', {
      description: 'Check your email for the download link.',
    });
  };

  const handleDownloadPDF = async () => {
    if (!bookData) return;
    
    try {
      toast.loading('Generating your PDF...', { id: 'pdf-download' });
      await generateGuidePDF({
        title: displayTitle,
        topic,
        bookData,
      });
      toast.success('PDF downloaded successfully!', { id: 'pdf-download' });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.', { id: 'pdf-download' });
    }
  };

  const handleStartOver = () => {
    setViewState('landing');
    setTopic('');
    setBookData(null);
    setBookId(null);
    setCoverImageUrl(null);
    setIsLoadingCoverImage(false);
  };

  // Use AI-generated display title or fallback
  const displayTitle = bookData?.displayTitle || bookData?.title || `Master ${topic}`;
  const subtitle = bookData?.subtitle;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button onClick={handleStartOver} className="hover:opacity-70 transition-opacity">
            <Logo />
          </button>
          <div className="flex items-center gap-3">
            {viewState === 'book' && (
              <button
                onClick={handleStartOver}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                New Guide
              </button>
            )}
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                    className="hidden sm:flex"
                  >
                    Dashboard
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="hover:opacity-80 transition-opacity">
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
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenAuthModal}
                  disabled={isAuthenticating}
                  className="gap-2"
                >
                  {isAuthenticating ? 'Signing in...' : 'Join'}
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container">
        {/* Landing View */}
        {viewState === 'landing' && (
          <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center px-4">
            <div className="text-center mb-10 animate-fade-up">
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground mb-4 tracking-tight">
                Learn anything.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-md mx-auto">
                Beautiful, custom how-to guides crafted just for you.
              </p>
            </div>
            <div className="w-full animate-fade-up animation-delay-200">
              <SearchInput onSearch={handleSearch} />
            </div>
            <p className="text-sm text-muted-foreground mt-8 animate-fade-up animation-delay-300">
              Try: "Sourdough bread baking" or "Watercolor painting basics"
            </p>
          </div>
        )}

        {/* Loading View */}
        {viewState === 'loading' && <LoadingAnimation />}

        {/* Book View */}
        {viewState === 'book' && (
          <div className="py-12">
            {/* Save to Cloud Banner for guests */}
            {!user && !isTestMode && (
              <SaveToCloudBanner 
                onSignIn={handleOpenAuthModal} 
                isAuthenticating={isAuthenticating} 
              />
            )}
            
            {/* Test Mode Indicator */}
            {isTestMode && (
              <div className="mb-6 flex items-center justify-center gap-2 py-2 px-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200 text-sm">
                <FlaskConical className="w-4 h-4" />
                <span className="font-medium">Test Mode Active</span>
                <span className="text-amber-600 dark:text-amber-400">— Full content unlocked</span>
              </div>
            )}
            
            {/* Book Cover */}
            <section className="mb-20">
              <BookCover title={displayTitle} subtitle={subtitle} topic={topic} coverImageUrl={coverImageUrl} isLoadingImage={isLoadingCoverImage} />
              
              {/* Action Buttons */}
              <div className="flex flex-col items-center mt-8 gap-4">
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <Button
                    onClick={handleDownloadPDF}
                    variant={isPaid ? "default" : "outline"}
                    size="lg"
                    className="gap-2 font-serif"
                  >
                    <Download className="w-4 h-4" />
                    {isPaid ? 'Download Full Guide (PDF)' : 'Download Free Sample (PDF)'}
                  </Button>
                  {!isPaid && (
                    <Button
                      size="lg"
                      className="gap-2 font-serif"
                    >
                      <Sparkles className="w-4 h-4" />
                      Unlock Full Artisan Guide — $4.99
                    </Button>
                  )}
                </div>
                {!isPaid && (
                  <p className="text-xs text-muted-foreground text-center max-w-md">
                    Sample includes Step 1 and the material list. The full $4.99 guide unlocks all steps, pro tips, and the local supplier map.
                  </p>
                )}
                {isPaid && (
                  <p className="text-xs text-accent text-center max-w-md font-medium">
                    ✓ Full access unlocked — All 10 chapters available
                  </p>
                )}
              </div>
            </section>

            {/* Table of Contents */}
            <section className="mb-8">
              <TableOfContents topic={topic} chapters={bookData?.tableOfContents} />
            </section>

            {/* Divider */}
            <div className="max-w-2xl mx-auto my-12">
              <div className="flex items-center justify-center gap-4">
                <div className="flex-1 h-[1px] bg-border" />
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Begin Reading
                </span>
                <div className="flex-1 h-[1px] bg-border" />
              </div>
            </div>

            {/* Chapter 1 Content */}
            <section>
              <ChapterContent 
                topic={topic} 
                content={bookData?.chapter1Content}
                localResources={bookData?.localResources}
                hasDisclaimer={bookData?.hasDisclaimer}
                materials={extractMaterials(bookData?.chapter1Content)}
              />
            </section>

            {/* Paywall - only show if not paid */}
            {!isPaid && <PaywallOverlay onPurchase={handlePurchase} />}
          </div>
        )}
      </main>

      {/* Sticky Footer Disclaimer */}
      <Footer />

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onGoogleSignIn={signInWithGoogle}
        isAuthenticating={isAuthenticating}
      />
    </div>
  );
};

export default Index;
