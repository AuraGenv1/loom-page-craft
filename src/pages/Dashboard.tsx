import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, BookOpen, Calendar, MoreVertical, Trash2, Download, FileText, RefreshCw, Sparkles, Package } from 'lucide-react';
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
import { generateKindleHTML } from '@/lib/generateKindle';
import { generateCleanPDF } from '@/lib/generateCleanPDF';
import { BookData } from '@/lib/bookTypes';
import JSZip from 'jszip';
import jsPDF from 'jspdf';

interface SavedBook {
  id: string;
  book_id: string;
  created_at: string;
  books: {
    id: string;
    title: string;
    topic: string;
    chapter1_content: string;
    chapter2_content: string | null;
    chapter3_content: string | null;
    chapter4_content: string | null;
    chapter5_content: string | null;
    chapter6_content: string | null;
    chapter7_content: string | null;
    chapter8_content: string | null;
    chapter9_content: string | null;
    chapter10_content: string | null;
    table_of_contents: any;
    local_resources: any;
    has_disclaimer: boolean;
    cover_image_url: string[] | null;
    is_purchased: boolean;
    edition_year: number | null;
  } | null;
}

const Dashboard = () => {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin via database role
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

  useEffect(() => {
    if (!loading && !user) {
      toast.error('Please sign in to view your library.');
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchSavedBooks = async () => {
      if (!user) return;

      let query = supabase
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
            chapter2_content,
            chapter3_content,
            chapter4_content,
            chapter5_content,
            chapter6_content,
            chapter7_content,
            chapter8_content,
            chapter9_content,
            chapter10_content,
            table_of_contents,
            local_resources,
            has_disclaimer,
            cover_image_url,
            is_purchased,
            edition_year
          )
        `);
      
      // Admins see ALL books; regular users see only their own
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });

      if (!error && data) {
        setSavedBooks(data as SavedBook[]);
      }
      setLoadingBooks(false);
    };

    if (user) {
      fetchSavedBooks();
    }
  }, [user, isAdmin]);

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
      // Build complete BookData with ALL chapters for proper PDF
      const bookData: BookData = {
        title: book.title,
        displayTitle: book.title.split(' ').slice(0, 5).join(' '),
        subtitle: `A Curated Guide`,
        tableOfContents: book.table_of_contents || [],
        chapter1Content: book.chapter1_content,
        chapter2Content: book.chapter2_content || undefined,
        chapter3Content: book.chapter3_content || undefined,
        chapter4Content: book.chapter4_content || undefined,
        chapter5Content: book.chapter5_content || undefined,
        chapter6Content: book.chapter6_content || undefined,
        chapter7Content: book.chapter7_content || undefined,
        chapter8Content: book.chapter8_content || undefined,
        chapter9Content: book.chapter9_content || undefined,
        chapter10Content: book.chapter10_content || undefined,
        localResources: book.local_resources || [],
        hasDisclaimer: book.has_disclaimer,
        coverImageUrl: book.cover_image_url?.[0] || undefined,
      };

      toast.loading('Generating PDF from your guide...', { id: 'pdf-gen' });
      await generateGuidePDF({
        title: bookData.displayTitle,
        topic: book.topic,
        bookData,
      });
      toast.success('PDF downloaded!', { id: 'pdf-gen' });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF', { id: 'pdf-gen' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadKindle = async (book: SavedBook['books']) => {
    if (!book) return;
    
    setDownloadingId(book.id + '-kindle');
    try {
      // Build complete BookData with ALL chapters
      const bookData: BookData = {
        title: book.title,
        displayTitle: book.title.split(' ').slice(0, 5).join(' '),
        subtitle: `A Curated Guide`,
        tableOfContents: book.table_of_contents || [],
        chapter1Content: book.chapter1_content,
        chapter2Content: book.chapter2_content || undefined,
        chapter3Content: book.chapter3_content || undefined,
        chapter4Content: book.chapter4_content || undefined,
        chapter5Content: book.chapter5_content || undefined,
        chapter6Content: book.chapter6_content || undefined,
        chapter7Content: book.chapter7_content || undefined,
        chapter8Content: book.chapter8_content || undefined,
        chapter9Content: book.chapter9_content || undefined,
        chapter10Content: book.chapter10_content || undefined,
        localResources: book.local_resources || [],
        hasDisclaimer: book.has_disclaimer,
        coverImageUrl: book.cover_image_url?.[0] || undefined,
      };

      // Use Kindle-optimized HTML export
      toast.loading('Generating Kindle file...', { id: 'kindle-gen' });
      await generateKindleHTML({
        title: bookData.displayTitle,
        topic: book.topic,
        bookData,
      });
      toast.success('Kindle file downloaded!', { id: 'kindle-gen' });
    } catch (error) {
      console.error('Kindle generation error:', error);
      toast.error('Failed to generate Kindle file', { id: 'kindle-gen' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadKDPPackage = async (book: SavedBook['books']) => {
    if (!book) return;
    
    setDownloadingId(book.id + '-kdp');
    try {
      toast.loading('Generating KDP Package... This may take a minute.', { id: 'kdp-gen' });
      
      const bookData: BookData = {
        title: book.title,
        displayTitle: book.title.split(' ').slice(0, 5).join(' '),
        subtitle: `A Curated Guide`,
        tableOfContents: book.table_of_contents || [],
        chapter1Content: book.chapter1_content,
        chapter2Content: book.chapter2_content || undefined,
        chapter3Content: book.chapter3_content || undefined,
        chapter4Content: book.chapter4_content || undefined,
        chapter5Content: book.chapter5_content || undefined,
        chapter6Content: book.chapter6_content || undefined,
        chapter7Content: book.chapter7_content || undefined,
        chapter8Content: book.chapter8_content || undefined,
        chapter9Content: book.chapter9_content || undefined,
        chapter10Content: book.chapter10_content || undefined,
        localResources: book.local_resources || [],
        hasDisclaimer: book.has_disclaimer,
        coverImageUrl: book.cover_image_url?.[0] || undefined,
      };

      const zip = new JSZip();
      const safeTitle = book.title.replace(/[^a-zA-Z0-9]/g, '_');
      const coverUrl = book.cover_image_url?.[0] || '';

      // 1. Generate Cover PDF (simplified version for dashboard)
      toast.loading('Creating cover PDF...', { id: 'kdp-gen' });
      const coverPdf = new jsPDF({
        orientation: 'landscape',
        unit: 'in',
        format: [9.25, 12.485]
      });
      const pageWidth = 12.485;
      const pageHeight = 9.25;
      const spineWidth = 0.485;
      const cvWidth = (pageWidth - spineWidth) / 2;

      coverPdf.setFillColor('#ffffff');
      coverPdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Front cover area
      coverPdf.setFontSize(24);
      coverPdf.text(book.title, cvWidth + spineWidth + cvWidth / 2, 4, { align: 'center', maxWidth: cvWidth - 1 });
      coverPdf.setFontSize(12);
      coverPdf.text('Loom & Page', cvWidth + spineWidth + cvWidth / 2, pageHeight - 0.5, { align: 'center' });

      zip.file('Cover-File.pdf', coverPdf.output('blob'));

      // 2. Generate Manuscript PDF
      toast.loading('Creating manuscript PDF...', { id: 'kdp-gen' });
      const manuscriptBlob = await generateCleanPDF({
        topic: book.topic,
        bookData,
        coverImageUrl: coverUrl || undefined,
        isKdpManuscript: true,
        returnBlob: true
      });
      if (manuscriptBlob) {
        zip.file('Manuscript.pdf', manuscriptBlob);
      }

      // 3. Generate EPUB
      toast.loading('Creating Kindle eBook...', { id: 'kdp-gen' });
      const epubZip = new JSZip();
      epubZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
      epubZip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

      const chapters = book.table_of_contents || [];
      const manifestItems: string[] = [];
      const spineItems: string[] = [];

      epubZip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${book.title}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <div class="cover">
    <h1>${book.title}</h1>
    <p>Loom & Page</p>
  </div>
</body>
</html>`);
      manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
      spineItems.push('<itemref idref="cover"/>');

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const content = bookData[`chapter${ch.chapter}Content` as keyof BookData] as string || '';
        const cleanContent = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, '').replace(/[#*>`]/g, '');
        
        epubZip.file(`OEBPS/chapter${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter ${ch.chapter}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <h1>Chapter ${ch.chapter}: ${ch.title}</h1>
  <p>${cleanContent.replace(/\n\n/g, '</p><p>')}</p>
</body>
</html>`);
        manifestItems.push(`<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
        spineItems.push(`<itemref idref="chapter${i + 1}"/>`);
      }

      epubZip.file('OEBPS/styles.css', `body { font-family: serif; margin: 1em; line-height: 1.6; }
h1 { font-size: 1.5em; margin-bottom: 0.5em; }
.cover { text-align: center; padding: 2em; }
p { margin-bottom: 1em; }`);
      manifestItems.push('<item id="styles" href="styles.css" media-type="text/css"/>');

      epubZip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${book.title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`);

      const epubBlob = await epubZip.generateAsync({ type: 'blob' });
      zip.file('Kindle-eBook.epub', epubBlob);

      // 4. Add Kindle Cover JPG
      if (coverUrl) {
        try {
          const response = await fetch(coverUrl);
          if (response.ok) {
            const kindleCoverBlob = await response.blob();
            zip.file('Kindle_Cover.jpg', kindleCoverBlob);
          }
        } catch (e) {
          console.warn('Could not fetch cover image for Kindle');
        }
      }

      // Generate ZIP and download
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}-KDP-Package.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('KDP Package downloaded successfully!', { id: 'kdp-gen' });
    } catch (error) {
      console.error('KDP package generation error:', error);
      toast.error('Failed to generate KDP package', { id: 'kdp-gen' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUpdateEdition = async (saved: SavedBook) => {
    if (!saved.books || !user) return;
    
    // Check effective purchase status (admins bypass)
    const effectivelyPurchased = saved.books.is_purchased || isAdmin;
    
    // Only allow updates for purchased guides (or admins)
    if (!effectivelyPurchased) {
      toast.error('Please unlock the full guide first');
      return;
    }
    
    const currentYear = new Date().getFullYear();
    const originalTopic = saved.books.topic;
    
    setDownloadingId(saved.books.id + '-update');
    
    try {
      toast.loading('Weaving your updated edition...', { id: 'update-edition' });
      
      // Call generate-book with fullBook=true to get all chapters
      const { data, error } = await supabase.functions.invoke('generate-book', {
        body: { 
          topic: originalTopic, 
          sessionId: crypto.randomUUID(),
          fullBook: true 
        }
      });
      
      if (error || data?.error) {
        throw new Error(data?.error || 'Failed to generate updated edition');
      }
      
      // Save as NEW entry with current year edition
      const { data: newBook, error: saveError } = await supabase
        .from('books')
        .insert([
          {
            topic: originalTopic,
            title: `${data.displayTitle || data.title} — ${currentYear} Edition`,
            table_of_contents: JSON.parse(JSON.stringify(data.tableOfContents)),
            chapter1_content: data.chapter1Content,
            chapter2_content: data.chapter2Content || null,
            chapter3_content: data.chapter3Content || null,
            chapter4_content: data.chapter4Content || null,
            chapter5_content: data.chapter5Content || null,
            chapter6_content: data.chapter6Content || null,
            chapter7_content: data.chapter7Content || null,
            chapter8_content: data.chapter8Content || null,
            chapter9_content: data.chapter9Content || null,
            chapter10_content: data.chapter10Content || null,
            local_resources: JSON.parse(JSON.stringify(data.localResources || [])),
            has_disclaimer: data.hasDisclaimer || false,
            cover_image_url: data.coverImageUrl ? (Array.isArray(data.coverImageUrl) ? data.coverImageUrl : [data.coverImageUrl]) : null,
            is_purchased: true, // Inherit purchased status
            edition_year: currentYear,
            session_id: crypto.randomUUID(),
            user_id: user.id,
          },
        ])
        .select()
        .single();
      
      if (saveError || !newBook) {
        throw new Error('Failed to save updated edition');
      }
      
      // Add to saved_projects
      await supabase
        .from('saved_projects')
        .insert([{ user_id: user.id, book_id: newBook.id }]);
      
      // Refresh the books list
      const { data: refreshedData } = await supabase
        .from('saved_projects')
        .select(`
          id,
          book_id,
          created_at,
          books (
            id, title, topic, chapter1_content, chapter2_content, chapter3_content,
            chapter4_content, chapter5_content, chapter6_content, chapter7_content,
            chapter8_content, chapter9_content, chapter10_content, table_of_contents,
            local_resources, has_disclaimer, cover_image_url, is_purchased, edition_year
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (refreshedData) {
        setSavedBooks(refreshedData as SavedBook[]);
      }
      
      toast.success(`${currentYear} Edition created!`, { 
        id: 'update-edition',
        description: 'Your original guide is preserved.' 
      });
    } catch (err) {
      console.error('Update edition error:', err);
      toast.error('Failed to create updated edition', { id: 'update-edition' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleViewGuide = (saved: SavedBook) => {
    if (!saved.books) return;
    
    // Check effective purchase status (admins bypass)
    const effectivelyPurchased = saved.books.is_purchased || isAdmin;
    
    // Navigate to Index with book data
    // If purchased (or admin), pass fullView=true; otherwise show preview
    const params = new URLSearchParams({
      bookId: saved.books.id,
      view: effectivelyPurchased ? 'full' : 'preview'
    });
    navigate(`/?${params.toString()}`);
  };

  const handleUnlockGuide = (saved: SavedBook) => {
    if (!saved.books) return;
    // Navigate to preview mode with unlock prompt
    const params = new URLSearchParams({
      bookId: saved.books.id,
      view: 'preview'
    });
    navigate(`/?${params.toString()}`);
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
                  {/* Card Header - Cover Image or Placeholder */}
                  <div 
                    className="aspect-[4/3] bg-secondary flex items-center justify-center relative cursor-pointer overflow-hidden"
                    onClick={() => handleViewGuide(saved)}
                  >
                    {saved.books?.cover_image_url?.length ? (
                      <img 
                        src={saved.books.cover_image_url[0]} 
                        alt={saved.books.title}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <>
                        {/* Blueprint pattern for placeholder */}
                        <div className="absolute inset-0 opacity-[0.03]" style={{
                          backgroundImage: `
                            linear-gradient(to right, currentColor 1px, transparent 1px),
                            linear-gradient(to bottom, currentColor 1px, transparent 1px)
                          `,
                          backgroundSize: '15px 15px'
                        }} />
                        
                        {/* Placeholder with title */}
                        <div className="relative text-center p-4">
                          <div className="w-12 h-12 mx-auto mb-2 rounded-full border border-foreground/10 flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-foreground/30" />
                          </div>
                          <p className="text-xs text-muted-foreground font-serif line-clamp-2">
                            {saved.books?.title || 'Untitled'}
                          </p>
                        </div>
                      </>
                    )}
                    
                    {/* Edition badge */}
                    {saved.books?.edition_year && (
                      <div className="absolute top-2 right-2 bg-background/90 text-xs px-2 py-0.5 rounded font-serif">
                        {saved.books.edition_year} Edition
                      </div>
                    )}
                    
                    {/* Purchase status badge - admins see as purchased */}
                    {!saved.books?.is_purchased && !isAdmin && (
                      <div className="absolute bottom-2 left-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs px-2 py-0.5 rounded font-medium">
                        Preview
                      </div>
                    )}

                    {/* Actions dropdown */}
                    <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className="p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {(saved.books?.is_purchased || isAdmin) && (
                            <>
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
                                Download Kindle
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleUpdateEdition(saved)}
                                disabled={downloadingId === saved.books?.id + '-update'}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Update Edition
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBook(saved.id);
                            }}
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
                    
                    {/* Action buttons based on purchase status (admins see as purchased) */}
                    <div className="space-y-2">
                      {(saved.books?.is_purchased || isAdmin) ? (
                        <>
                          {/* Single KDP Export button */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 text-xs"
                            onClick={() => handleDownloadKDPPackage(saved.books)}
                            disabled={downloadingId === saved.books?.id + '-kdp'}
                          >
                            <Package className="h-3 w-3" />
                            {downloadingId === saved.books?.id + '-kdp' ? 'Generating...' : 'KDP Export'}
                          </Button>
                          
                          {/* Update Edition button */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 text-xs"
                            onClick={() => handleUpdateEdition(saved)}
                            disabled={downloadingId === saved.books?.id + '-update'}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {downloadingId === saved.books?.id + '-update' ? 'Updating...' : 'Update Edition'}
                          </Button>
                        </>
                      ) : (
                        /* Unlock button for unpurchased guides */
                        <Button
                          size="sm"
                          className="w-full gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-white"
                          onClick={() => handleUnlockGuide(saved)}
                        >
                          <Sparkles className="h-3 w-3" />
                          Unlock Full Guide
                        </Button>
                      )}
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
