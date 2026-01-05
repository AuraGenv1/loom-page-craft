import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft, Shield, BookOpen, Download, Loader2 } from 'lucide-react';
import Logo from '@/components/Logo';
import { BookData } from '@/lib/bookTypes';
import { generateGuidePDF } from '@/lib/generatePDF';

interface PromoCode {
  id: string;
  code: string;
  discount_percent: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookTopic, setBookTopic] = useState('');
  const [generatingBook, setGeneratingBook] = useState(false);
  const [generatedBook, setGeneratedBook] = useState<BookData | null>(null);
  const [newCode, setNewCode] = useState({
    code: '',
    discount_percent: 10,
    max_uses: '',
    expires_at: '',
  });

  // Check if user is admin
  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setCheckingRole(false);
        return;
      }

      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin',
      });

      if (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data === true);
      }
      setCheckingRole(false);
    };

    if (!authLoading) {
      checkAdminRole();
    }
  }, [user, authLoading]);

  // Fetch promo codes
  useEffect(() => {
    const fetchPromoCodes = async () => {
      if (!isAdmin) return;

      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching promo codes:', error);
        toast.error('Failed to load promo codes');
      } else {
        setPromoCodes(data || []);
      }
      setLoadingCodes(false);
    };

    if (isAdmin) {
      fetchPromoCodes();
    }
  }, [isAdmin]);

  const handleCreateCode = async () => {
    if (!newCode.code.trim()) {
      toast.error('Please enter a promo code');
      return;
    }

    const { error } = await supabase.from('promo_codes').insert({
      code: newCode.code.toUpperCase().trim(),
      discount_percent: newCode.discount_percent,
      max_uses: newCode.max_uses ? parseInt(newCode.max_uses) : null,
      expires_at: newCode.expires_at || null,
    });

    if (error) {
      console.error('Error creating promo code:', error);
      toast.error('Failed to create promo code');
    } else {
      toast.success('Promo code created');
      setDialogOpen(false);
      setNewCode({ code: '', discount_percent: 10, max_uses: '', expires_at: '' });
      // Refresh list
      const { data } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });
      setPromoCodes(data || []);
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    const { error } = await supabase
      .from('promo_codes')
      .update({ is_active: !currentState })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update promo code');
    } else {
      setPromoCodes(codes =>
        codes.map(c => (c.id === id ? { ...c, is_active: !currentState } : c))
      );
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('promo_codes').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete promo code');
    } else {
      setPromoCodes(codes => codes.filter(c => c.id !== id));
    toast.success('Promo code deleted');
    }
  };

  const handleGenerateBook = async () => {
    if (!bookTopic.trim()) {
      toast.error('Please enter a topic');
      return;
    }

    setGeneratingBook(true);
    setGeneratedBook(null);

    try {
      const sessionId = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke('generate-book', {
        body: { topic: bookTopic, sessionId }
      });

      if (error) {
        toast.error('Failed to generate book');
        console.error('Book generation error:', error);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setGeneratedBook(data as BookData);
      toast.success('Book generated successfully!');
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Something went wrong');
    } finally {
      setGeneratingBook(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!generatedBook) return;

    try {
      toast.loading('Generating PDF...', { id: 'admin-pdf' });
      await generateGuidePDF({
        title: generatedBook.displayTitle || generatedBook.title,
        topic: bookTopic,
        bookData: generatedBook,
      });
      toast.success('PDF downloaded!', { id: 'admin-pdf' });
    } catch (error) {
      console.error('PDF error:', error);
      toast.error('Failed to generate PDF', { id: 'admin-pdf' });
    }
  };

  // Loading state
  if (authLoading || checkingRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
        <Shield className="w-16 h-16 text-muted-foreground/50" />
        <h1 className="font-serif text-2xl text-foreground">Admin Access Required</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Please sign in with an admin account to access this page.
        </p>
        <Button onClick={() => navigate('/')} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
        <Shield className="w-16 h-16 text-destructive/50" />
        <h1 className="font-serif text-2xl text-foreground">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your account does not have admin privileges.
        </p>
        <Button onClick={() => navigate('/')} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-serif">
              Admin Panel
            </span>
          </div>
          <Button onClick={() => navigate('/')} variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-12">
        {/* Generate Full Book Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl text-foreground">Generate Full Book</h2>
            <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <BookOpen className="w-4 h-4 mr-2" />
                  New Book
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-serif">Generate Full Book (Admin)</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="book-topic">Topic</Label>
                    <Input
                      id="book-topic"
                      value={bookTopic}
                      onChange={e => setBookTopic(e.target.value)}
                      placeholder="e.g., Ferrari 308 GTB Restoration"
                      disabled={generatingBook}
                    />
                  </div>
                  <Button
                    onClick={handleGenerateBook}
                    className="w-full"
                    disabled={generatingBook || !bookTopic.trim()}
                  >
                    {generatingBook ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Book'
                    )}
                  </Button>

                  {generatedBook && (
                    <div className="pt-4 border-t space-y-3">
                      <div className="text-sm">
                        <span className="font-medium">Title:</span>{' '}
                        {generatedBook.displayTitle || generatedBook.title}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {generatedBook.tableOfContents?.length || 0} chapters generated
                      </div>
                      <Button onClick={handleDownloadPDF} className="w-full gap-2">
                        <Download className="w-4 h-4" />
                        Download Full PDF
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-sm text-muted-foreground">
            As an admin, you can generate and download full books without payment restrictions.
          </p>
        </section>

        {/* Promo Codes Section */}
        <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif text-2xl text-foreground">Promo Codes</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">Create Promo Code</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={newCode.code}
                    onChange={e => setNewCode({ ...newCode, code: e.target.value })}
                    placeholder="SAVE20"
                    className="uppercase"
                  />
                </div>
                <div>
                  <Label htmlFor="discount">Discount %</Label>
                  <Input
                    id="discount"
                    type="number"
                    min="0"
                    max="100"
                    value={newCode.discount_percent}
                    onChange={e =>
                      setNewCode({ ...newCode, discount_percent: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="max_uses">Max Uses (leave empty for unlimited)</Label>
                  <Input
                    id="max_uses"
                    type="number"
                    min="1"
                    value={newCode.max_uses}
                    onChange={e => setNewCode({ ...newCode, max_uses: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="expires">Expires At (optional)</Label>
                  <Input
                    id="expires"
                    type="datetime-local"
                    value={newCode.expires_at}
                    onChange={e => setNewCode({ ...newCode, expires_at: e.target.value })}
                  />
                </div>
                <Button onClick={handleCreateCode} className="w-full">
                  Create Code
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loadingCodes ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : promoCodes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No promo codes yet. Create your first one!
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.map(code => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-medium">{code.code}</TableCell>
                    <TableCell>{code.discount_percent}%</TableCell>
                    <TableCell>
                      {code.current_uses}
                      {code.max_uses ? ` / ${code.max_uses}` : ''}
                    </TableCell>
                    <TableCell>
                      {code.expires_at
                        ? new Date(code.expires_at).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={code.is_active}
                        onCheckedChange={() => handleToggleActive(code.id, code.is_active)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(code.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </section>
      </main>
    </div>
  );
};

export default Admin;
