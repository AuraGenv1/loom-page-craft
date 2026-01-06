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
import PrintPreview from '@/components/PrintPreview';
import { Download, Sparkles, FlaskConical } from 'lucide-react';

type ViewState = 'landing' | 'loading' | 'book';

const getSessionId = (): string => {
  const stored = localStorage.getItem('loom_page_session_id');
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem('loom_page_session_id', newId);
  return newId;
};

const extractMaterials = (content?: string): string[] => {
  if (!content) return [];
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
        const items = match[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
        materials.push(...items.slice(0, 5));
      }
    }
  }
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
  const [diagramImages, setDiagramImages] = useState<Record<string, string>>({});
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const { user, profile, loading: authLoading, isAuthenticating, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin',
      });
      setIsAdmin(data === true);
    };
    checkAdminRole();
  }, [user]);

  const isTestMode = useMemo(() => {
    if (import.meta.env.DEV) {
      const testParam = searchParams.get('test') === 'true';
      if (testParam) return true;
    }
    return isAdmin;
  }, [searchParams, isAdmin]);

  const isPaid = isTestMode;

  const handleOpenAuthModal = () => setAuthModalOpen(true);
  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    if (authLoading) return;
    const checkExistingBook = async () => {
      if (!user) {
        setViewState('landing');
        setBookData(null);
        setBookId(null);
        setCoverImageUrl(null);
        return;
      }

      const result = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const data = result.data;
      const error = result.error;

      if (data && !error) {
        setBookData({
          title: data.title,
          displayTitle: data.title.split(' ').slice(0, 5).join(' '),
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

  // DIAGRAM GENERATION
  useEffect(() => {
    if (viewState !== 'book' || !bookData?.title || !topic) return;
    let cancelled = false;
    const run = async () => {
      setIsGeneratingDiagrams(true);
      const sessionId = getSessionId();
      const plates = [
        { plateNumber: '1.1', caption: `Core concepts of ${topic}` },
        { plateNumber: '1.2', caption: `Essential tools for ${topic}` },
      ];

      await Promise.all(
        plates.map(async ({ plateNumber, caption }) => {
          const { data, error } = await supabase.functions.invoke('generate-cover-image', {
            body: { title: bookData.title, topic, caption, sessionId },
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
    return () => { cancelled = true; };
  }, [viewState, bookData?.title, topic]);

  // SEARCH LOGIC
  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState('loading');
    setCoverImageUrl(null);
    setDiagramImages({});

    try {
      const { data, error } = await supabase.functions.invoke('generate-book', {
        body: { title: `The Artisan Guide to ${query}`, topic: query }
      });

      if (error) throw error;

      // Extract Gemini data and map to your App's BookData format
      const geminiContent = data.content;
      const formattedBook: BookData = {
        title: geminiContent.title || `Mastering ${query}`,
        displayTitle: geminiContent.title || `Mastering ${query}`,
        subtitle: geminiContent.preface?.substring(0, 100) + "...",
        tableOfContents: geminiContent.chapters.map((ch: any) => ({
          title: ch.title,
          description: ch.description
        })),
        chapter1Content: geminiContent.chapters[0]?.description || geminiContent.preface,
        localResources: [],
        hasDisclaimer: true,
      };

      setBookData(formattedBook);

      // SAVE TO DATABASE
      const sessionId = getSessionId();
      const { data: savedBook, error: saveError } = await supabase
        .from('books')
        .insert([{
          topic: query,
          title: formattedBook.title,
          table_of_contents: formattedBook.tableOfContents,
          chapter1_content: formattedBook.chapter1Content,
          session_id: sessionId,
          user_id: user?.id || null,
        }])
        .select().single();

      if (saveError) console.error("Database save failed:", saveError);
      if (savedBook) setBookId(savedBook.id);

      setViewState('book');

      // COVER IMAGE (Background)
      setIsLoadingCoverImage(true);
      supabase.functions.invoke('generate-cover-image', {
        body: { title: formattedBook.title, topic: query },
      }).then(({ data: imgData }) => {
        setIsLoadingCoverImage(false);
        if (imgData?.imageUrl) setCoverImageUrl(imgData.imageUrl);
      });

    } catch (err: any) {
      toast.error(err.message || "Failed to generate guide.");
      setViewState('landing');
    }
  };

  const handlePurchase = () => {
    if (!user) {
      toast.info('Please sign in to purchase');
      setAuthModalOpen(true);
      return;
    }
    toast.success('Guide unlocked!');
  };

  const handleDownloadPDF = async () => {
    if (!bookData) return;
    toast.loading('Preparing PDF...', { id: 'pdf'