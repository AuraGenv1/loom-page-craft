import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Plus, Trash2, ArrowLeft, Shield, Key, Copy, AlertTriangle, Check, Loader2, Settings, Mail } from 'lucide-react';
import Logo from '@/components/Logo';

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

interface OpenverseCredentials {
  client_id: string;
  client_secret: string;
  name: string;
}

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCode, setNewCode] = useState({
    code: '',
    discount_percent: 10,
    max_uses: '',
    expires_at: '',
  });

  // Openverse registration state
  const [openverseForm, setOpenverseForm] = useState({
    name: 'LoomPage Book Generator',
    email: '',
    description: 'Book generation tool for education',
  });
  const [registeringOpenverse, setRegisteringOpenverse] = useState(false);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [openverseCredentials, setOpenverseCredentials] = useState<OpenverseCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'secret' | null>(null);

  // Platform settings state
  const [supportEmail, setSupportEmail] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);

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

  // Fetch platform settings
  useEffect(() => {
    const fetchSettings = async () => {
      if (!isAdmin) return;

      const { data, error } = await supabase
        .from('platform_settings')
        .select('support_email')
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching platform settings:', error);
      } else {
        setSupportEmail(data?.support_email || '');
      }
      setLoadingSettings(false);
    };

    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  const handleSaveEmail = async () => {
    if (!supportEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setSavingEmail(true);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .update({ support_email: supportEmail.trim() })
        .not('id', 'is', null); // Update all rows (there should be only one)

      if (error) {
        throw error;
      }

      toast.success('Email address saved successfully');
    } catch (error) {
      console.error('Error saving email:', error);
      toast.error('Failed to save email address');
    } finally {
      setSavingEmail(false);
    }
  };

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

  // Set default email when user loads
  useEffect(() => {
    if (user?.email && !openverseForm.email) {
      setOpenverseForm(prev => ({ ...prev, email: user.email || '' }));
    }
  }, [user?.email]);

  const handleRegisterOpenverse = async () => {
    if (!openverseForm.name.trim() || !openverseForm.email.trim() || !openverseForm.description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setRegisteringOpenverse(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-openverse', {
        body: {
          name: openverseForm.name.trim(),
          email: openverseForm.email.trim(),
          description: openverseForm.description.trim(),
        },
      });

      if (error) {
        console.error('Error registering with Openverse:', error);
        toast.error(error.message || 'Failed to register with Openverse');
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setOpenverseCredentials(data);
      setCredentialsModalOpen(true);
      toast.success('Openverse credentials generated!');
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setRegisteringOpenverse(false);
    }
  };

  const copyToClipboard = async (text: string, field: 'id' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${field === 'id' ? 'Client ID' : 'Client Secret'} copied!`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
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
        {/* Quick Actions Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl text-foreground">Quick Actions</h2>
            <Button onClick={() => navigate('/')} variant="secondary">
              <Plus className="w-4 h-4 mr-2" />
              New Guide
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Create new guides directly from the homepage. Manage API credentials and promo codes below.
          </p>
        </section>

        {/* Openverse API Setup Section */}
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle className="font-serif text-xl">Openverse API Setup</CardTitle>
                  <CardDescription>
                    Register your application to get API credentials for image search
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="app-name">App Name</Label>
                <Input
                  id="app-name"
                  value={openverseForm.name}
                  onChange={e => setOpenverseForm({ ...openverseForm, name: e.target.value })}
                  placeholder="LoomPage Book Generator"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={openverseForm.email}
                  onChange={e => setOpenverseForm({ ...openverseForm, email: e.target.value })}
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={openverseForm.description}
                  onChange={e => setOpenverseForm({ ...openverseForm, description: e.target.value })}
                  placeholder="Book generation tool for education"
                  rows={2}
                />
              </div>
              <Button 
                onClick={handleRegisterOpenverse} 
                disabled={registeringOpenverse}
                className="w-full sm:w-auto"
              >
                {registeringOpenverse ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4 mr-2" />
                    Register & Get Keys
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Credentials Modal */}
        <Dialog open={credentialsModalOpen} onOpenChange={setCredentialsModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Openverse Credentials Generated
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Warning */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">
                    IMPORTANT: Copy these now!
                  </p>
                  <p className="text-muted-foreground">
                    Openverse will never show them again.
                  </p>
                </div>
              </div>

              {/* Client ID */}
              <div className="space-y-2">
                <Label>Client ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                    {openverseCredentials?.client_id}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(openverseCredentials?.client_id || '', 'id')}
                    className="shrink-0"
                  >
                    {copiedField === 'id' ? (
                      <Check className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Client Secret */}
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                    {openverseCredentials?.client_secret}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(openverseCredentials?.client_secret || '', 'secret')}
                    className="shrink-0"
                  >
                    {copiedField === 'secret' ? (
                      <Check className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Next steps */}
              <p className="text-sm text-muted-foreground pt-2">
                Next: Add these as secrets in your project settings (OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET)
              </p>

              <Button 
                onClick={() => setCredentialsModalOpen(false)} 
                className="w-full"
              >
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Platform Settings Section */}
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle className="font-serif text-xl">Platform Settings</CardTitle>
                  <CardDescription>
                    Configure notification settings and platform preferences
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSettings ? (
                <div className="text-center py-4 text-muted-foreground">Loading settings...</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="support-email" className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Notification Email Address
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Contact form submissions will be sent to this email address.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="support-email"
                        type="email"
                        value={supportEmail}
                        onChange={(e) => setSupportEmail(e.target.value)}
                        placeholder="support@example.com"
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleSaveEmail} 
                        disabled={savingEmail}
                      >
                        {savingEmail ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Email'
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default Admin;
