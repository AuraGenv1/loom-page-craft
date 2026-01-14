import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '@/components/Logo';
import SearchInput from '@/components/SearchInput';
import LoadingAnimation from '@/components/LoadingAnimation';
import BookCover from '@/components/BookCover';
import TableOfContents from '@/components/TableOfContents';
import ChapterContent from '@/components/ChapterContent';
import AllChaptersContent, { AllChaptersContentHandle } from '@/components/AllChaptersContent';
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
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { generateCleanPDF } from '@/lib/generateCleanPDF';
import PrintPreview from '@/components/PrintPreview';
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
  const [diagramImages, setDiagramImages] = useState<Record<string, string>>({});
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const { user, profile, loading: authLoading, isAuthenticating, signInWithGoogle, signOut } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSavedToLibrary, setIsSavedToLibrary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);
  const [activeChapter, setActiveChapter] = useState(1);
  const [loadingChapter, setLoadingChapter] = useState<number | null>(null);
  const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
  const isCurrentlyGenerating = useRef(false); // STRICT LOCK: useRef to prevent re-renders triggering loops
  const allChaptersRef = useRef<AllChaptersContentHandle>(null);
  const chapter1Ref = useRef<HTMLElement>(null);

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

  // Handle chapter click from TOC - smooth scroll
  const handleChapterClick = useCallback((chapterNumber: number) => {
    if (isPaid && allChaptersRef.current) {
      allChaptersRef.current.scrollToChapter(chapterNumber);
    } else if (chapterNumber === 1 && chapter1Ref.current) {
      chapter1Ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isPaid]);

  // Track active chapter on scroll for full view
  useEffect(() => {
    if (!isPaid || viewState !== 'book') return;

    const handleScroll = () => {
      const refs = allChaptersRef.current?.getChapterRefs();
      if (!refs) return;

      const scrollTop = window.scrollY + 150; // Offset for header
      let current = 1;

      refs.forEach((el, idx) => {
        if (el && el.offsetTop <= scrollTop) {
          current = idx + 1;
        }
      });

      setActiveChapter(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isPaid, viewState]);

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

  // Generate chapter diagrams in background (never show blank boxes)
  useEffect(() => {
    if (viewState !== 'book' || !bookData?.title || !topic) return;

    let cancelled = false;

    const run = async () => {
      setIsGeneratingDiagrams(true);

      const sessionId = getSessionId();
      const plates = [
        { plateNumber: '1.1', caption: `Core concepts of ${topic} visualized` },
        { plateNumber: '1.2', caption: `Essential tools and materials for ${topic}` },
      ];

      await Promise.all(
        plates.map(async ({ plateNumber, caption }) => {
          const { data, error } = await supabase.functions.invoke('generate-cover-image', {
            body: {
              title: bookData.title,
              topic,
              caption,
              plateNumber,
              variant: 'diagram',
              sessionId,
            },
          });

          if (cancelled) return;
          if (!error && data?.imageUrl) {
            setDiagramImages((prev) => ({ ...prev, [plateNumber]: data.imageUrl }));
          }
        })
      );

      if (!cancelled) setIsGeneratingDiagrams(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [viewState, bookData?.title, topic]);

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

  // Daisy-chain missing chapters (2-10): one request at a time; next starts only after state updates
  const nextMissingChapter = useMemo(() => {
    if (!bookData?.tableOfContents?.length) return null;

    for (let i = 2; i <= 10; i++) {
      const key = `chapter${i}Content` as keyof BookData;
      if (!bookData[key]) return i;
    }
    return null;
  }, [
    bookData?.tableOfContents,
    bookData?.chapter2Content,
    bookData?.chapter3Content,
    bookData?.chapter4Content,
    bookData?.chapter5Content,
    bookData?.chapter6Content,
    bookData?.chapter7Content,
    bookData?.chapter8Content,
    bookData?.chapter9Content,
    bookData?.chapter10Content,
  ]);

  useEffect(() => {
    if (!isPaid || !bookId || !bookData || viewState !== 'book') return;
    if (!nextMissingChapter) return;
    if (loadingChapter !== null) return; // ensure only ONE chapter shows spinner / is requested
    if (isGeneratingChapter) return; // State-based lock
    if (isCurrentlyGenerating.current) return; // REF-based strict lock - prevents flip-flop

    const tocEntry = bookData.tableOfContents?.find((ch) => ch.chapter === nextMissingChapter);
    if (!tocEntry) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      // First, check if the chapter already exists in the chapters table
      // This prevents generating duplicates when the books object hasn't refreshed yet
      try {
        const { data: existingChapter } = await supabase
          .from('chapters')
          .select('content, status')
          .eq('book_id', bookId)
          .eq('chapter_number', nextMissingChapter)
          .maybeSingle();

        if (cancelled) return;

        // If chapter exists with content, update local state and skip generation
        if (existingChapter?.content && existingChapter.status === 'completed') {
          console.log(`Chapter ${nextMissingChapter} already exists in chapters table, updating local state`);
          setBookData((prev) => {
            if (!prev) return prev;
            const key = `chapter${nextMissingChapter}Content` as keyof BookData;
            return { ...prev, [key]: existingChapter.content };
          });
          return;
        }

        // If chapter is being generated (status = 'generating'), wait and don't start another
        if (existingChapter?.status === 'generating') {
          console.log(`Chapter ${nextMissingChapter} is already being generated, waiting...`);
          return;
        }
      } catch (err) {
        console.error(`Error checking chapters table for chapter ${nextMissingChapter}:`, err);
        // Continue with generation if check fails
      }

      if (cancelled) return;

      // STRICT LOCK: Set BOTH locks BEFORE any async operations
      isCurrentlyGenerating.current = true;
      setIsGeneratingChapter(true);
      setLoadingChapter(nextMissingChapter);

      // 15-second timeout safety net - releases lock if something gets stuck
      timeoutId = setTimeout(() => {
        console.warn(`Chapter ${nextMissingChapter} generation timeout - releasing lock`);
        isCurrentlyGenerating.current = false;
        setLoadingChapter(null);
        setIsGeneratingChapter(false);
      }, 15000);

      // Small delay to allow database sync
      await new Promise(resolve => setTimeout(resolve, 1500));

      if (cancelled) {
        if (timeoutId) clearTimeout(timeoutId);
        isCurrentlyGenerating.current = false;
        setLoadingChapter(null);
        setIsGeneratingChapter(false);
        return;
      }

      try {
        console.log(`Calling generate-chapter for Chapter ${nextMissingChapter}: "${tocEntry.title}"`);
        
        const { data, error } = await supabase.functions.invoke('generate-chapter', {
          body: {
            bookId,
            chapterNumber: nextMissingChapter,
            chapterTitle: tocEntry.title,
            topic,
            tableOfContents: bookData.tableOfContents,
            language,
          },
        });

        if (cancelled) return;

        if (error) {
          console.error(`Error generating chapter ${nextMissingChapter}:`, error);
          toast.error(`Failed to generate Chapter ${nextMissingChapter}. Please refresh.`);
          return;
        }

        if (data?.content) {
          // Mark as complete immediately by saving content into local state
          setBookData((prev) => {
            if (!prev) return prev;
            const key = `chapter${nextMissingChapter}Content` as keyof BookData;
            return { ...prev, [key]: data.content };
          });
        }
      } catch (err) {
        console.error(`Failed to generate chapter ${nextMissingChapter}:`, err);
        toast.error(`Failed to generate Chapter ${nextMissingChapter}. Please refresh.`);
      } finally {
        // Clear the timeout since we're done
        if (timeoutId) clearTimeout(timeoutId);
        
        // SAFETY DELAY: Wait 3 seconds before releasing lock to prevent flip-flop
        // This ensures the database has fully confirmed the save before we allow another generation
        if (!cancelled) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          isCurrentlyGenerating.current = false;
          setLoadingChapter(null);
          setIsGeneratingChapter(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      // STRICT LOCK: Never reset isCurrentlyGenerating.current in cleanup - operation may still be in progress
    };
  }, [isPaid, bookId, bookData?.tableOfContents, viewState, nextMissingChapter, loadingChapter, isGeneratingChapter, topic, language]);

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState('loading');
    setCoverImageUrls([]);
    setDiagramImages({});
    setIsGeneratingDiagrams(false);
    setIsSavedToLibrary(false); // Reset for new book
    setLoadingChapter(null);


    try {
      const currentSessionId = getSessionId();
      const { data, error } = await supabase.functions.invoke('generate-book-v2', {
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

      const generatedBook = data as BookData;
      setBookData(generatedBook);

      // Save to database (user_id is null for guests)
      const sessionId = getSessionId();

      let savedBookId: string | null = null;

      if (user) {
        // Authenticated users can insert + return row normally
        const { data: savedBook, error: saveError } = await supabase
          .from('books')
          .insert([
            {
              topic: query,
              title: generatedBook.title,
              table_of_contents: JSON.parse(JSON.stringify(generatedBook.tableOfContents)),
              chapter1_content: generatedBook.chapter1Content,
              chapter2_content: generatedBook.chapter2Content || null,
              chapter3_content: generatedBook.chapter3Content || null,
              chapter4_content: generatedBook.chapter4Content || null,
              chapter5_content: generatedBook.chapter5Content || null,
              chapter6_content: generatedBook.chapter6Content || null,
              chapter7_content: generatedBook.chapter7Content || null,
              chapter8_content: generatedBook.chapter8Content || null,
              chapter9_content: generatedBook.chapter9Content || null,
              chapter10_content: generatedBook.chapter10Content || null,
              local_resources: JSON.parse(JSON.stringify(generatedBook.localResources || [])),
              has_disclaimer: generatedBook.hasDisclaimer || false,
              cover_image_url: generatedBook.coverImageUrl ? (Array.isArray(generatedBook.coverImageUrl) ? generatedBook.coverImageUrl : [generatedBook.coverImageUrl]) : null,
              is_purchased: false,
              session_id: sessionId,
              user_id: user.id,
            },
          ])
          .select()
          .single();

        if (saveError) {
          console.error('Error saving book:', saveError);
          toast.error('Failed to save your guide. Please try again.');
          setViewState('landing');
          return;
        }

        savedBookId = savedBook.id;
      } else {
        // Guests cannot SELECT directly due to RLS, so insert without returning rows...
        const { error: saveError } = await supabase.from('books').insert([
          {
            topic: query,
            title: generatedBook.title,
            table_of_contents: JSON.parse(JSON.stringify(generatedBook.tableOfContents)),
            chapter1_content: generatedBook.chapter1Content,
            chapter2_content: generatedBook.chapter2Content || null,
            chapter3_content: generatedBook.chapter3Content || null,
            chapter4_content: generatedBook.chapter4Content || null,
            chapter5_content: generatedBook.chapter5Content || null,
            chapter6_content: generatedBook.chapter6Content || null,
            chapter7_content: generatedBook.chapter7Content || null,
            chapter8_content: generatedBook.chapter8Content || null,
            chapter9_content: generatedBook.chapter9Content || null,
            chapter10_content: generatedBook.chapter10Content || null,
            local_resources: JSON.parse(JSON.stringify(generatedBook.localResources || [])),
            has_disclaimer: generatedBook.hasDisclaimer || false,
            cover_image_url: generatedBook.coverImageUrl ? (Array.isArray(generatedBook.coverImageUrl) ? generatedBook.coverImageUrl : [generatedBook.coverImageUrl]) : null,
            is_purchased: false,
            session_id: sessionId,
            user_id: null,
          },
        ]);

        if (saveError) {
          console.error('Error saving book (guest):', saveError);
          toast.error('Failed to save your guide. Please try again.');
          setViewState('landing');
          return;
        }

        // ...then fetch the latest book for this session via the security definer RPC.
        const { data: sessionBooks, error: fetchError } = await supabase.rpc('get_book_by_session', {
          p_session_id: sessionId,
        });

        const first = (sessionBooks as any[] | null)?.[0];
        if (fetchError || !first?.id) {
          console.error('Error fetching session book:', fetchError);
          toast.error('Guide saved, but we could not load it. Please refresh.');
          setViewState('landing');
          return;
        }

        savedBookId = first.id as string;
      }

      setBookId(savedBookId);
      
      // Only save to saved_projects if user is logged in
      if (user && savedBookId) {
        const { error: saveProjectError } = await supabase
          .from('saved_projects')
          .insert([
            {
              user_id: user.id,
              book_id: savedBookId,
            },
          ]);

        if (saveProjectError) {
          console.error('Error saving to projects:', saveProjectError);
        }
      }

      // Enter book view IMMEDIATELY - chapters will stream in via realtime
      setViewState('book');

      // Use cover image from generate-book response if available
      if (generatedBook.coverImageUrl) {
        const urls = Array.isArray(generatedBook.coverImageUrl) ? generatedBook.coverImageUrl : [generatedBook.coverImageUrl];
        setCoverImageUrls(urls);
        setIsLoadingCoverImage(false);
        
        // Update cover_image_url in database if not already set
        if (savedBookId) {
          supabase
            .from('books')
            .update({ cover_image_url: urls })
            .eq('id', savedBookId)
            .then(({ error }) => {
              if (error) console.error('Failed to save cover URL:', error);
            });
        }
      } else {
        // Fallback to separate cover image generation
        setIsLoadingCoverImage(true);
        const coverSessionId = getSessionId();
        supabase.functions
          .invoke('generate-cover-image', {
            body: { title: generatedBook.title, topic: query, sessionId: coverSessionId, variant: 'cover' },
          })
          .then(({ data: imageData, error: imageError }) => {
            setIsLoadingCoverImage(false);
            if (!imageError && (imageData?.imageUrls || imageData?.imageUrl)) {
              // Prefer imageUrls array, fallback to single imageUrl
              const urls = imageData.imageUrls || (imageData.imageUrl ? [imageData.imageUrl] : []);
              setCoverImageUrls(urls);
              // Save to database
              if (savedBookId) {
                supabase
                  .from('books')
                  .update({ cover_image_url: urls })
                  .eq('id', savedBookId)
                  .then(({ error }) => {
                    if (error) console.error('Failed to save cover URL:', error);
                  });
              }
            } else {
              console.log('Cover image generation skipped or failed:', imageError);
            }
          });
      }
      
      // Background chapters will be generated by the existing useEffect that
      // watches for missing chapters (isPaid check). No need for a second call
      // to generate-book which was causing duplicate rate limit issues.

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
    if (!bookData) return;
    
    try {
      toast.info('Generating PDF...', { 
        id: 'pdf-download',
        description: 'Creating your clean, content-only guide.' 
      });
      
      // Use clean PDF generator that strips all UI elements
      await generateCleanPDF({
        topic,
        bookData,
        coverImageUrl: coverImageUrls[0] || null,
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

  // TITLE HIERARCHY: Main heading = Topic (e.g., "Rome Luxury"), Subtitle = AI creative title
  const mainTitle = toTitleCase(topic || 'Your Guide');
  const creativeSubtitle = bookData?.displayTitle || bookData?.subtitle || bookData?.title;

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
              <BookCover title={mainTitle} subtitle={creativeSubtitle} topic={topic} coverImageUrls={coverImageUrls} isLoadingImage={isLoadingCoverImage} />
              
              {/* Action Buttons */}
              <div className="flex flex-col items-center mt-8 gap-4">
                {/* Calculate chapter completion */}
                {(() => {
                  const completedChapters = [
                    bookData?.chapter1Content,
                    bookData?.chapter2Content,
                    bookData?.chapter3Content,
                    bookData?.chapter4Content,
                    bookData?.chapter5Content,
                    bookData?.chapter6Content,
                    bookData?.chapter7Content,
                    bookData?.chapter8Content,
                    bookData?.chapter9Content,
                    bookData?.chapter10Content,
                  ].filter(Boolean).length;
                  const allChaptersComplete = completedChapters === 10;
                  const isWeaving = isPaid && !allChaptersComplete && completedChapters < 10;
                  
                  return (
                    <div className="flex flex-col sm:flex-row justify-center gap-3 flex-wrap items-center">
                      {isPaid ? (
                        <ProgressDownloadButton
                          completedChapters={completedChapters}
                          totalChapters={10}
                          disabled={!allChaptersComplete}
                          isPurchased={isPurchased}
                          bookData={bookData}
                          topic={topic}
                          coverImageUrls={coverImageUrls}
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
                  );
                })()}
                {!isPaid && (
                  <p className="text-xs text-muted-foreground text-center max-w-md">
                    {t('freeSampleDesc')}
                  </p>
                )}
                {isPaid && (
                  <p className="text-xs text-accent text-center max-w-md font-medium">
                    ✓ {t('fullAccessUnlocked')} — {[
                      bookData?.chapter1Content,
                      bookData?.chapter2Content,
                      bookData?.chapter3Content,
                      bookData?.chapter4Content,
                      bookData?.chapter5Content,
                      bookData?.chapter6Content,
                      bookData?.chapter7Content,
                      bookData?.chapter8Content,
                      bookData?.chapter9Content,
                      bookData?.chapter10Content,
                    ].filter(Boolean).length} of 10 chapters ready
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
                // Build chapter statuses
                const statuses: Record<number, 'drafting' | 'complete' | 'pending'> = {};
                const chapterContentMap: Record<number, string | undefined> = {
                  1: bookData?.chapter1Content,
                  2: bookData?.chapter2Content,
                  3: bookData?.chapter3Content,
                  4: bookData?.chapter4Content,
                  5: bookData?.chapter5Content,
                  6: bookData?.chapter6Content,
                  7: bookData?.chapter7Content,
                  8: bookData?.chapter8Content,
                  9: bookData?.chapter9Content,
                  10: bookData?.chapter10Content,
                };
                
                Object.entries(chapterContentMap).forEach(([num, content]) => {
                  const chapterNum = parseInt(num);
                  if (content && content.length > 0) {
                    statuses[chapterNum] = 'complete';
                  } else if (loadingChapter === chapterNum) {
                    statuses[chapterNum] = 'drafting';
                  } else {
                    statuses[chapterNum] = 'pending';
                  }
                });
                
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

            {/* Full Chapters (for paid/admin) or Chapter 1 Only (for free) */}
            {isPaid ? (
              <section>
                <AllChaptersContent
                  ref={allChaptersRef}
                  topic={topic}
                  loadingChapter={loadingChapter}
                  isFullAccess={isPaid}
                  sessionId={getSessionId()}
                  bookData={{
                    chapter1Content: bookData?.chapter1Content,
                    chapter2Content: bookData?.chapter2Content,
                    chapter3Content: bookData?.chapter3Content,
                    chapter4Content: bookData?.chapter4Content,
                    chapter5Content: bookData?.chapter5Content,
                    chapter6Content: bookData?.chapter6Content,
                    chapter7Content: bookData?.chapter7Content,
                    chapter8Content: bookData?.chapter8Content,
                    chapter9Content: bookData?.chapter9Content,
                    chapter10Content: bookData?.chapter10Content,
                    localResources: bookData?.localResources,
                    hasDisclaimer: bookData?.hasDisclaimer,
                    tableOfContents: bookData?.tableOfContents,
                  }}
                />
              </section>
            ) : (
              <>
                <section>
                  <ChapterContent 
                    ref={chapter1Ref}
                    topic={topic} 
                    content={bookData?.chapter1Content}
                    localResources={bookData?.localResources}
                    hasDisclaimer={bookData?.hasDisclaimer}
                    materials={extractMaterials(bookData?.chapter1Content)}
                    isGenerating={isGeneratingDiagrams}
                    diagramImages={diagramImages}
                    tableOfContents={bookData?.tableOfContents}
                    sessionId={getSessionId()}
                  />
                </section>

                {/* Paywall - only show if not paid */}
                <PaywallOverlay onPurchase={handlePurchase} onDownload={handleDownloadPDF} />
              </>
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
