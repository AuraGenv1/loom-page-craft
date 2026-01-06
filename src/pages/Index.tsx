import { useState, useEffect, useMemo, useRef } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { BookData } from '@/lib/bookTypes';
import { useAuth } from '@/contexts/AuthContext';
import { generateGuidePDF } from '@/lib/generatePDF';
import { Download, Sparkles } from 'lucide-react';

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
  const materialPatterns = [/materials?:?\s*([^\n]+)/gi, /supplies?:?\s*([^\n]+)/gi, /tools?:?\s*([^\n]+)/gi];
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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isLoadingCoverImage, setIsLoadingCoverImage] = useState(false);
  const [diagramImages, setDiagramImages] = useState<Record<string, string>>({});
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const { user, profile, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();

  // This REF is what allows the PDF generator to "see" your content
  const bookRef = useRef<HTMLDivElement>(null);

  const isPaid = false; 

  const handleOpenAuthModal = () => setAuthModalOpen(true);
  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleSearch = async (query: string) => {
    setTopic(query);
    setViewState('loading');
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-book', {
        body: { title: `Artisan Guide: ${query}`, topic: query }
      });

      if (error) throw error;

      const geminiContent = data.content;
      const formattedBook: BookData = {
        title: geminiContent.title || `Mastering ${query}`,
        displayTitle: geminiContent.title || `Mastering ${query}`,
        subtitle: geminiContent.preface?.substring(0, 120) + "...",
        tableOfContents: geminiContent.chapters.map((ch: any) => ({
          title: ch.title,
          description: ch.description
        })),
        chapter1Content: geminiContent.chapters[0]?.description || geminiContent.preface,
        localResources: [],
        hasDisclaimer: true,
      };

      setBookData(formattedBook);
      setViewState('book');

      setIsLoadingCoverImage(true);
      supabase.functions.invoke('generate-cover-image', {
        body: { title: formattedBook.title, topic: query },
      }).then(({ data: imgData }) => {
        setIsLoadingCoverImage(false);
        if (imgData?.imageUrl) setCoverImageUrl(imgData.imageUrl);
      });

    } catch (err: any) {
      toast.error("Generation failed.");
      setViewState('landing');
    }
  };

  const handleDownloadPDF = async () => {
    if (!bookData || !bookRef.current) {
        toast.error("No content to download");
        return;
    }
    
    try {
      toast.loading('Capturing high-res guide...', { id: 'pdf' });
      
      // We pass bookRef.current so the PDF captures the actual photos
      await generateGuidePDF({ 
        title: bookData.displayTitle || bookData.title, 
        topic, 
        bookData,
        previewElement: bookRef.current,
        isAdmin: true // This ensures blurs are removed in the PDF
      });
      
      toast.success('Luxury PDF Ready!', { id: 'pdf' });
    } catch (error) {
      console.error("PDF Error:", error);
      toast.error("Failed to generate PDF", { id: 'pdf' });
    }
  };

  const handleStartOver = () => {
    setViewState('landing');
    setTopic('');
    setBookData(null);
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <button onClick={handleStartOver} className="hover:opacity-70 transition-opacity"><Logo /></button>
          <div className="flex items-center gap-3">
            {viewState === 'book' && (
              <button onClick={handleStartOver} className="text-sm text-muted-foreground hover:text-foreground">New Guide</button>
            )}
            {!authLoading && (
              user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hover:opacity-80">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback>{getInitials(user?.user_metadata?.name)}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate('/dashboard')}>Dashboard</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="outline" size="sm" onClick={handleOpenAuthModal}>Join</Button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {viewState === 'landing'