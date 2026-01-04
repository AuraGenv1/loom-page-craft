import { useState, useEffect } from 'react';
import Logo from '@/components/Logo';
import SearchInput from '@/components/SearchInput';
import LoadingAnimation from '@/components/LoadingAnimation';
import BookCover from '@/components/BookCover';
import TableOfContents from '@/components/TableOfContents';
import ChapterContent from '@/components/ChapterContent';
import PaywallOverlay from '@/components/PaywallOverlay';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BookData } from '@/lib/bookTypes';

type ViewState = 'landing' | 'loading' | 'book';

// Generate or retrieve a session ID for anonymous users
const getSessionId = (): string => {
  const stored = localStorage.getItem('loom_page_session_id');
  if (stored) return stored;
  
  const newId = crypto.randomUUID();
  localStorage.setItem('loom_page_session_id', newId);
  return newId;
};

const Index = () => {
  const [viewState, setViewState] = useState<ViewState>('landing');
  const [topic, setTopic] = useState('');
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);

  // Check for existing book on mount
  useEffect(() => {
    const checkExistingBook = async () => {
      const sessionId = getSessionId();
      
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setBookData({
          title: data.title,
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
  }, []);

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState('loading');

    try {
      const { data, error } = await supabase.functions.invoke('generate-book', {
        body: { topic: query }
      });

      if (error) {
        console.error('Error generating book:', error);

        // If the function returned a non-2xx response, Supabase surfaces it as a FunctionsHttpError.
        // Parse the JSON body so we can show the friendly server-provided message.
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

      // Save to database
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
        }])
        .select()
        .single();

      if (saveError) {
        console.error('Error saving book:', saveError);
        // Don't block the user, just log the error
      } else {
        setBookId(savedBook.id);
      }

      setViewState('book');
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

  const handleStartOver = () => {
    setViewState('landing');
    setTopic('');
    setBookData(null);
    setBookId(null);
  };

  // Use AI-generated title or fallback
  const displayTitle = bookData?.title || `How to Master ${topic}`;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button onClick={handleStartOver} className="hover:opacity-70 transition-opacity">
            <Logo />
          </button>
          {viewState === 'book' && (
            <button
              onClick={handleStartOver}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              New Guide
            </button>
          )}
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
            {/* Book Cover */}
            <section className="mb-20">
              <BookCover title={displayTitle} topic={topic} />
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
              />
            </section>

            {/* Paywall */}
            <PaywallOverlay onPurchase={handlePurchase} />
          </div>
        )}
      </main>

      {/* Sticky Footer Disclaimer */}
      <Footer />
    </div>
  );
};

export default Index;
