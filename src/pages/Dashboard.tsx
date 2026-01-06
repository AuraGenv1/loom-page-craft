import { useEffect, useState, useRef } from 'react';
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
import BookCover from '@/components/BookCover';
import TableOfContents from '@/components/TableOfContents';
import ChapterContent from '@/components/ChapterContent';

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

      setPdfBookData(bookData);
      
      // Give the browser time to render the high-res images
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (hiddenContainerRef.current) {
        await generateGuidePDF({
          title: bookData.displayTitle,
          topic: book.topic,
          bookData,
          previewElement: hiddenContainerRef.current,
        });
      }
      
      toast.success('PDF downloaded!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingId(null);
      // We keep pdfBookData set to avoid unmounting the element mid-generation
    }
  };

  const handleDownloadKindle = async (book: SavedBook['books']) => {
    if (!book) return;
    
    setDownloadingId(book.id + '-kindle');
    try {
      const
