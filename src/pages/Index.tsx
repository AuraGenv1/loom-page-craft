import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '@/components/Logo';
import SearchInput from '@/components/SearchInput';
import LoadingAnimation from '@/components/LoadingAnimation';
import BookCover from '@/components/BookCover';
import TableOfContents from '@/components/TableOfContents';
import PageViewer from '@/components/PageViewer';
import PaywallOverlay from '@/components/PaywallOverlay';
import Footer from '@/components/Footer';
import SaveToCloudBanner from '@/components/SaveToCloudBanner';
import AuthModal from '@/components/AuthModal';
import LanguageSelector from '@/components/LanguageSelector';
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
import { FunctionsHttpError, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BookData } from '@/lib/bookTypes';
import { PageBlock } from '@/lib/pageBlockTypes';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { generateBlockBasedPDF } from '@/lib/generateBlockPDF';
import { Download, Sparkles, FlaskConical, BookmarkPlus } from 'lucide-react';
import ProgressDownloadButton from '@/components/ProgressDownloadButton';

type ViewState = 'landing' | 'loading' | 'book';

// Title Case helper function
const toTitleCase = (str: string): string => {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

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
  const [coverImageUrls, setCoverImageUrls] = useState<string[]>([]);
  const [isLoadingCoverImage, setIsLoadingCoverImage] = useState(false);
  const { user, profile, loading: authLoading, isAuthenticating, signInWithGoogle, signOut } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const isGeneratingRef = useRef(false);
  const [isSavedToLibrary, setIsSavedToLibrary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);
  const [activeChapter, setActiveChapter] = useState(1);
  const [loadingChapter, setLoadingChapter] = useState<number | null>(null);
  
  // Block-based architecture state
  const [chapterBlocks, setChapterBlocks] = useState<Record<number, PageBlock[]>>({});
  const [isVisualTopic, setIsVisualTopic] = useState(false);
  const [targetPagesPerChapter, setTargetPagesPerChapter] = useState(8);

  // Check if user is admin via database role - run immediately when user changes
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      try {
        const { data } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin',
        });
        setIsAdmin(data === true);
      } catch (err) {
        console.error('Admin check failed:', err);
        setIsAdmin(false);
      }
    };
    
    // Run immediately without waiting for authLoading
    if (user) {
      checkAdminRole();
    } else {
      setIsAdmin(false);
    }
  }, [user]);

  // Test mode: ONLY enabled for verified admin users (from database role check)
  // URL parameter ?test=true is only allowed in development environment for testing
  const isTestMode = useMemo(() => {
    // In development, allow ?test=true for local testing
    if (import.meta.env.DEV) {
      const testParam = searchParams.get('test') === 'true';
      if (testParam) return true;
    }
    // In production, only database-verified admins can access test mode
    return isAdmin;
  }, [searchParams, isAdmin]);

  // Content is unlocked for admins, paid users, or if book is purchased
  const isPaid = true;

  // Handle chapter click from TOC - navigate to chapter in PageViewer
  const handleChapterClick = useCallback((chapterNumber: number) => {
    setActiveChapter(chapterNumber);
  }, []);

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

  // Check for existing book on mount or load from URL params (Dashboard navigation)
  useEffect(() => {
    if (authLoading) return;
    
    const loadBook = async () => {
      // Check if navigating from Dashboard with specific book
      const bookIdParam = searchParams.get('bookId');
      const viewMode = searchParams.get('view');
      
      if (bookIdParam && user) {
        // Load specific book from Dashboard
        const { data, error } = await supabase
          .from('books')
          .select('*')
          .eq('id', bookIdParam)
          .eq('user_id', user.id)
          .single();
        
        if (data && !error) {
          const words = data.title.split(' ');
          const fallbackDisplayTitle = words.slice(0, 5).join(' ');
          
          setBookData({
            title: data.title,
            displayTitle: fallbackDisplayTitle,
            subtitle: `A Comprehensive Guide to ${data.topic}`,
            tableOfContents: data.table_of_contents as unknown as BookData['tableOfContents'],
            chapter1Content: data.chapter1_content,
            chapter2Content: data.chapter2_content || undefined,
            chapter3Content: data.chapter3_content || undefined,
            chapter4Content: data.chapter4_content || undefined,
            chapter5Content: data.chapter5_content || undefined,
            chapter6Content: data.chapter6_content || undefined,
            chapter7Content: data.chapter7_content || undefined,
            chapter8Content: data.chapter8_content || undefined,
            chapter9Content: data.chapter9_content || undefined,
            chapter10Content: data.chapter10_content || undefined,
            localResources: data.local_resources as unknown as BookData['localResources'],
            hasDisclaimer: data.has_disclaimer ?? false,
            coverImageUrl: Array.isArray(data.cover_image_url) ? data.cover_image_url[0] : data.cover_image_url || undefined,
          });
          setTopic(data.topic);
          setBookId(data.id);
          setCoverImageUrls(Array.isArray(data.cover_image_url) ? data.cover_image_url : data.cover_image_url ? [data.cover_image_url] : []);
          setIsPurchased(data.is_purchased || false);
          setIsSavedToLibrary(true);
          setViewState('book');
          return;
        }
      }
      
      // Guest users should always see the landing page on fresh load
      // Clear any stale session data to prevent "Groundhog Day" effect
      if (!user) {
        setViewState('landing');
        setBookData(null);
        setBookId(null);
        setCoverImageUrls([]);
        setIsPurchased(false);
        return;
      }

      // No specific book requested - show landing for fresh start
      // Remove auto-loading last book to avoid confusion
      setViewState('landing');
    };

    loadBook();
  }, [user, authLoading, searchParams]);

  // Fetch blocks when viewing a chapter (block-based architecture)
  useEffect(() => {
    if (!bookId || viewState !== 'book') return;

    const fetchChapterBlocks = async (chapterNum: number) => {
      const { data, error } = await supabase
        .from('book_pages')
        .select('*')
        .eq('book_id', bookId)
        .eq('chapter_number', chapterNum)
        .order('page_order', { ascending: true });

      if (!error && data && data.length > 0) {
        const blocks: PageBlock[] = data.map(row => ({
          id: row.id,
          book_id: row.book_id,
          chapter_number: row.chapter_number,
          page_order: row.page_order,
          block_type: row.block_type as PageBlock['block_type'],
          content: row.content as any,
          image_url: row.image_url || undefined,
        }));
        setChapterBlocks(prev => ({ ...prev, [chapterNum]: blocks }));
      }
    };

    // Fetch blocks for active chapter
    fetchChapterBlocks(activeChapter);
  }, [bookId, viewState, activeChapter]);

  // Real-time subscription for chapter updates
  useEffect(() => {
    if (!bookId || viewState !== 'book') return;

    let channel: RealtimeChannel | null = null;

    const setupRealtime = () => {
      channel = supabase
        .channel(`book-updates-${bookId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'books',
            filter: `id=eq.${bookId}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>;
            
            // Update local state with any new chapter content
            setBookData(prev => {
              if (!prev) return prev;
              
              const updates: Partial<BookData> = {};
              
              for (let i = 1; i <= 10; i++) {
                const dbKey = `chapter${i}_content`;
                const stateKey = `chapter${i}Content` as keyof BookData;
                if (updated[dbKey] && !prev[stateKey]) {
                  (updates as Record<string, string>)[stateKey] = updated[dbKey] as string;
                }
              }
              
              // Update cover image if it changed
              if (updated.cover_image_url && !prev.coverImageUrl) {
                const urls = Array.isArray(updated.cover_image_url) ? updated.cover_image_url : [updated.cover_image_url as string];
                updates.coverImageUrl = urls[0];
                setCoverImageUrls(urls);
              }
              
              if (Object.keys(updates).length > 0) {
                return { ...prev, ...updates };
              }
              return prev;
            });
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [bookId, viewState]);

  // Calculate which chapters have blocks (block-based architecture)
  // DYNAMIC: Use tableOfContents.length instead of hardcoded 10
  const totalChapters = bookData?.tableOfContents?.length || 0;
  
  const nextMissingChapter = useMemo(() => {
    if (!bookData?.tableOfContents?.length) return null;

    // Dynamic loop: iterate through ALL chapters in the ToC
    for (let i = 2; i <= bookData.tableOfContents.length; i++) {
      // Check if we have blocks for this chapter
      if (!chapterBlocks[i] || chapterBlocks[i].length === 0) return i;
    }
    return null;
  }, [bookData?.tableOfContents, chapterBlocks]);
  
  // Calculate if ALL chapters are complete (dynamic)
  const isGenerationComplete = useMemo(() => {
    if (!totalChapters || totalChapters === 0) return false;
    
    // Check if we have blocks for all chapters
    for (let i = 1; i <= totalChapters; i++) {
      if (!chapterBlocks[i] || chapterBlocks[i].length === 0) return false;
    }
    return true;
  }, [totalChapters, chapterBlocks]);
  
  // Count completed chapters (dynamic)
  const completedChapterCount = useMemo(() => {
    let count = 0;
    for (let i = 1; i <= totalChapters; i++) {
      if (chapterBlocks[i] && chapterBlocks[i].length > 0) count++;
    }
    return count;
  }, [totalChapters, chapterBlocks]);

  // Daisy-chain: Generate missing chapter blocks (2-10)
  useEffect(() => {
    if (!isPaid || !bookId || !bookData || viewState !== 'book') return;
    if (!nextMissingChapter) return;
    
    // STOP if we are already generating (The Lock)
    if (isGeneratingRef.current) return;
    
    // The Lock: Claim this process immediately
    isGeneratingRef.current = true;
    setLoadingChapter(nextMissingChapter);

    const run = async () => {
      try {
        console.log('[Block] STARTING GENERATION for Chapter', nextMissingChapter);
        
        const tocEntry = bookData.tableOfContents?.find((ch) => ch.chapter === nextMissingChapter);
        if (!tocEntry) throw new Error('No TOC entry found');
        
        // Call the NEW block-based chapter generator
        const { data, error } = await supabase.functions.invoke('generate-chapter-blocks', {
          body: {
            bookId,
            chapterNumber: nextMissingChapter,
            chapterTitle: tocEntry.title,
            topic,
            tableOfContents: bookData.tableOfContents,
            isVisualTopic,
            targetPagesPerChapter,
            language,
          },
        });
        
        if (error) throw error;
        if (!data?.blocks) throw new Error('No blocks returned');
        
        console.log('[Block] AI Finished. Got', data.blocks.length, 'blocks');
        
        // Update local blocks state
        setChapterBlocks(prev => ({ ...prev, [nextMissingChapter]: data.blocks }));
        
        // Also update bookData for backward compatibility with chapter count checks
        setBookData((prev) => {
          if (!prev) return prev;
          const key = `chapter${nextMissingChapter}Content` as keyof BookData;
          return { ...prev, [key]: `[${data.blocks.length} blocks generated]` };
        });
          
      } catch (err) {
        console.error(`[Block] Failed to generate chapter ${nextMissingChapter}:`, err);
      } finally {
        // RELEASE THE LOCK
        isGeneratingRef.current = false;
        setLoadingChapter(null);
      }
    };

    run();

    return () => {
      // Clean-up
    };
  }, [isPaid, bookId, viewState, nextMissingChapter, topic, language, isVisualTopic, targetPagesPerChapter]);

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState('loading');
    setCoverImageUrls([]);
    setChapterBlocks({});
    setIsSavedToLibrary(false);
    setLoadingChapter(null);

    try {
      const currentSessionId = getSessionId();
      
      // Use the NEW block-based book generator
      const { data, error } = await supabase.functions.invoke('generate-book-blocks', {
        body: { topic: query, sessionId: currentSessionId, language }
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

      // Extract block-based response
      const { 
        bookId: newBookId, 
        title, 
        displayTitle, 
        subtitle, 
        tableOfContents, 
        chapter1Blocks,
        isVisualTopic: isVisual,
        targetPagesPerChapter: targetPages
      } = data;

      // Store chapter 1 blocks
      if (chapter1Blocks && chapter1Blocks.length > 0) {
        setChapterBlocks({ 1: chapter1Blocks });
      }

      // Store visual/pages settings for chapter generation
      setIsVisualTopic(isVisual || false);
      setTargetPagesPerChapter(targetPages || 8);

      // Create BookData for backward compatibility
      const generatedBook: BookData = {
        title,
        displayTitle,
        subtitle,
        tableOfContents,
        chapter1Content: `[${chapter1Blocks?.length || 0} blocks generated]`,
        localResources: [],
        hasDisclaimer: false,
      };
      
      setBookData(generatedBook);
      setBookId(newBookId);
      
      // Save to saved_projects if user is logged in
      if (user && newBookId) {
        supabase
          .from('saved_projects')
          .insert([{ user_id: user.id, book_id: newBookId }])
          .then(({ error: saveProjectError }) => {
            if (saveProjectError) console.error('Error saving to projects:', saveProjectError);
          });
      }

      // Enter book view
      setViewState('book');

      // Generate cover image in background
      setIsLoadingCoverImage(true);
      const coverSessionId = getSessionId();
      supabase.functions
        .invoke('generate-cover-image', {
          body: { title, topic: query, sessionId: coverSessionId, variant: 'cover' },
        })
        .then(({ data: imageData, error: imageError }) => {
          setIsLoadingCoverImage(false);
          if (!imageError && (imageData?.imageUrls || imageData?.imageUrl)) {
            const urls = imageData.imageUrls || (imageData.imageUrl ? [imageData.imageUrl] : []);
            setCoverImageUrls(urls);
            // Save to database
            if (newBookId) {
              supabase
                .from('books')
                .update({ cover_image_url: urls })
                .eq('id', newBookId)
                .then(({ error }) => {
                  if (error) console.error('Failed to save cover URL:', error);
                });
            }
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
    // If not logged in, prompt auth first
    if (!user) {
      toast.info('Please sign in or create an account to purchase', {
        description: 'You can checkout as a guest or sign in for your library.',
        action: {
          label: 'Sign In',
          onClick: () => setAuthModalOpen(true),
        },
      });
      return;
    }
    
    // TODO: Integrate Stripe checkout here
    toast.success('Thank you! Your complete guide is now unlocked.', {
      description: 'You can now download the full guide.',
    });
  };

  const handleDownloadPDF = async () => {
    if (!bookData || !bookId) return;
    
    try {
      toast.info('Generating PDF...', { 
        id: 'pdf-download',
        description: 'Creating your luxury 6x9 manuscript.' 
      });
      
      // Use NEW block-based PDF generator
      await generateBlockBasedPDF({
        title: bookData.title,
        displayTitle: bookData.displayTitle || bookData.title,
        subtitle: bookData.subtitle || `A Comprehensive Guide to ${topic}`,
        tableOfContents: bookData.tableOfContents || [],
        bookId,
      });
      
      toast.success('PDF downloaded!', { 
        id: 'pdf-download',
        description: 'Your guide has been saved.' 
      });
    } catch (error) {
      console.error('PDF error:', error);
      toast.error('Failed to generate PDF. Please try again.', { id: 'pdf-download' });
    }
  };

  const handleStartOver = () => {
    setViewState('landing');
    setTopic('');
    setBookData(null);
    setBookId(null);
    setCoverImageUrls([]);
    setIsLoadingCoverImage(false);
    setIsSavedToLibrary(false);
    setIsPurchased(false);
    setChapterBlocks({});
    setActiveChapter(1);
    // Clear URL params when starting over
    navigate('/', { replace: true });
  };

  const handleSaveToLibrary = async () => {
    if (!bookId) return;
    
    // If not logged in, open auth modal
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    // Already saved - no action needed, no toast
    if (isSavedToLibrary) return;

    setIsSaving(true);
    try {
      // Check if this exact bookId is already saved (not just same topic)
      const { data: existing } = await supabase
        .from('saved_projects')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_id', bookId)
        .maybeSingle();

      if (existing) {
        // Silently mark as saved, no toast spam
        setIsSavedToLibrary(true);
        return;
      }

      const { error } = await supabase
        .from('saved_projects')
        .insert([{ user_id: user.id, book_id: bookId }]);

      if (error) {
        // Check for unique constraint violation (duplicate)
        if (error.code === '23505') {
          setIsSavedToLibrary(true);
          return;
        }
        throw error;
      }
      
      setIsSavedToLibrary(true);
      toast.success('Saved to your library!');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Use AI-generated display title or fallback - always Title Case
  const rawDisplayTitle = bookData?.displayTitle || bookData?.title || `Master ${topic}`;
  const displayTitle = toTitleCase(rawDisplayTitle);
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
                {t('newGuide')}
              </button>
            )}
            <LanguageSelector />
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                    className="hidden sm:flex"
                  >
                    {t('dashboard')}
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
                        {t('dashboard')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="text-muted-foreground">
                        {t('signOut')}
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
                  {isAuthenticating ? t('loading') : t('join')}
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
                {t('learnAnything')}
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-md mx-auto">
                {t('beautifulGuides')}
              </p>
            </div>
            <div className="w-full animate-fade-up animation-delay-200">
              <SearchInput onSearch={handleSearch} />
            </div>
            <p className="text-sm text-muted-foreground mt-8 animate-fade-up animation-delay-300">
              {t('searchExamples')}
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
              <BookCover 
                title={displayTitle} 
                subtitle={subtitle} 
                topic={topic} 
                coverImageUrls={coverImageUrls} 
                isLoadingImage={isLoadingCoverImage}
                isAdmin={isAdmin}
                bookId={bookId || undefined}
                bookData={bookData || undefined}
                isGenerationComplete={isGenerationComplete}
                onCoverUpdate={(updates) => {
                  // Update local state immediately when Cover Studio makes changes
                  if (updates.coverImageUrls) setCoverImageUrls(updates.coverImageUrls);
                  
                  // Merge other updates (spine, back cover) into bookData
                  setBookData(prev => {
                    if (!prev) return prev;
                    return { ...prev, ...updates };
                  });
                }}
              />
              
              {/* Action Buttons */}
              <div className="flex flex-col items-center mt-8 gap-4">
                {/* Use dynamic chapter completion */}
                <div className="flex flex-col sm:flex-row justify-center gap-3 flex-wrap items-center">
                  {isPaid ? (
                    <ProgressDownloadButton
                      completedChapters={completedChapterCount}
                      totalChapters={totalChapters}
                      disabled={!isGenerationComplete}
                      isPurchased={isPurchased}
                      bookData={bookData}
                      topic={topic}
                      coverImageUrls={coverImageUrls}
                      isAdmin={isAdmin}
                    />
                  ) : (
                    <>
                      <Button
                        onClick={handleDownloadPDF}
                        variant="outline"
                        size="lg"
                        className="gap-2 font-serif"
                      >
                        <Download className="w-4 h-4" />
                        {t('downloadFreeSample')}
                      </Button>
                      <Button
                        size="lg"
                        className="gap-2 font-serif bg-slate-900 hover:bg-slate-800 text-white"
                        onClick={handlePurchase}
                      >
                        <Sparkles className="w-4 h-4" />
                        {t('unlockFullGuide')} — $4.99
                      </Button>
                    </>
                  )}
                </div>
                {!isPaid && (
                  <p className="text-xs text-muted-foreground text-center max-w-md">
                    {t('freeSampleDesc')}
                  </p>
                )}
                {isPaid && (
                  <p className="text-xs text-accent text-center max-w-md font-medium">
                    ✓ {t('fullAccessUnlocked')} — {completedChapterCount} of {totalChapters} chapters ready
                  </p>
                )}
                {/* Save to Library Button */}
                {!isSavedToLibrary && bookId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveToLibrary}
                    disabled={isSaving}
                    className="gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                    {isSaving ? t('saving') : t('saveToLibrary')}
                  </Button>
                )}
                {isSavedToLibrary && (
                  <p className="text-xs text-accent font-medium">✓ {t('saved')}</p>
                )}
              </div>
            </section>

            {/* Table of Contents - pass chapter statuses and content for realtime sync */}
            <section className="mb-8">
              {(() => {
                // Build chapter statuses dynamically based on chapterBlocks
                const statuses: Record<number, 'drafting' | 'complete' | 'pending'> = {};
                const chapterContentMap: Record<number, string | undefined> = {};
                
                // Dynamically build status for ALL chapters in ToC
                for (let i = 1; i <= totalChapters; i++) {
                  const hasBlocks = chapterBlocks[i] && chapterBlocks[i].length > 0;
                  chapterContentMap[i] = hasBlocks ? `[${chapterBlocks[i].length} blocks]` : undefined;
                  
                  if (hasBlocks) {
                    statuses[i] = 'complete';
                  } else if (loadingChapter === i) {
                    statuses[i] = 'drafting';
                  } else {
                    statuses[i] = 'pending';
                  }
                }
                
                return (
                  <TableOfContents 
                    topic={topic} 
                    chapters={bookData?.tableOfContents} 
                    allUnlocked={isPaid}
                    onChapterClick={handleChapterClick}
                    activeChapter={isPaid ? activeChapter : 1}
                    chapterStatuses={statuses}
                    loadingChapter={loadingChapter}
                    chapterContent={chapterContentMap}
                  />
                );
              })()}
            </section>

            {/* Divider */}
            <div className="max-w-2xl mx-auto my-12">
              <div className="flex items-center justify-center gap-4">
                <div className="flex-1 h-[1px] bg-border" />
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {t('beginReading')}
                </span>
                <div className="flex-1 h-[1px] bg-border" />
              </div>
            </div>

            {/* Kindle-Style PageViewer - Block-Based Architecture */}
            {bookId && (
              <section className="max-w-2xl mx-auto">
                <PageViewer 
                  bookId={bookId}
                  initialChapter={activeChapter}
                  onPageChange={(chapter) => setActiveChapter(chapter)}
                />
              </section>
            )}
            
            {/* Paywall - only show if not paid */}
            {!isPaid && (
              <PaywallOverlay onPurchase={handlePurchase} onDownload={handleDownloadPDF} />
            )}
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
