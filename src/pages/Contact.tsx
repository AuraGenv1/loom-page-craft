import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Send } from 'lucide-react';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  subject: z.string().trim().min(1, 'Subject is required').max(200, 'Subject must be less than 200 characters'),
  message: z.string().trim().min(1, 'Message is required').max(5000, 'Message must be less than 5000 characters'),
});

const Contact = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      toast({
        title: 'Validation Error',
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Insert into contact_messages table
      const { error: insertError } = await supabase
        .from('contact_messages')
        .insert({
          name: result.data.name,
          email: result.data.email,
          subject: result.data.subject,
          message: result.data.message,
        });

      if (insertError) {
        throw insertError;
      }

      // Try to send email notification (graceful failure)
      try {
        await supabase.functions.invoke('send-contact-notification', {
          body: {
            name: result.data.name,
            email: result.data.email,
            subject: result.data.subject,
            message: result.data.message,
          },
        });
      } catch (emailError) {
        console.warn('Email notification failed, but message was saved:', emailError);
      }

      toast({
        title: t('contactSuccess'),
        description: t('contactResponseTime'),
      });

      // Reset form
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      console.error('Error submitting contact form:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="hover:opacity-70 transition-opacity">
            <Logo />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container py-12 max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground mb-3">
            {t('contactTitle')}
          </h1>
          <p className="text-muted-foreground">
            {t('contactSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('contactNameLabel')}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('contactNamePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('contactEmailLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('contactEmailPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{t('contactSubjectLabel')}</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder={t('contactSubjectPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{t('contactMessageLabel')}</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder={t('contactMessagePlaceholder')}
              rows={6}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('contactSubmitting')}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t('contactSubmit')}
              </>
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('contactResponseTime')}
          </p>
        </form>

        <div className="mt-12 pt-8 border-t border-border">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Contact;
