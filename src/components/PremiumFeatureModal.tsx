import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, Download, Palette, Wand2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

interface PremiumFeatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
}

const PremiumFeatureModal = ({ open, onOpenChange, featureName = 'this feature' }: PremiumFeatureModalProps) => {
  const handlePurchase = () => {
    // Placeholder: No Stripe integration yet
    console.log('Stripe Checkout Triggered');
    toast.info('Checkout flow coming soon.');
    onOpenChange(false);
  };

  const benefits = [
    { icon: BookOpen, text: 'Access all chapters' },
    { icon: Palette, text: 'Edit photos & text' },
    { icon: Download, text: 'PDF & EPUB exports' },
    { icon: Wand2, text: 'AI regeneration tools' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Lock className="w-5 h-5 text-primary" />
            Premium Feature
          </DialogTitle>
          <DialogDescription>
            {featureName} is available with the full guide.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="space-y-3">
            {benefits.map((benefit, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <benefit.icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-foreground">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Maybe Later
          </Button>
          <Button onClick={handlePurchase} className="w-full sm:w-auto gap-2">
            <Sparkles className="w-4 h-4" />
            Unlock Full Guide — $4.99
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PremiumFeatureModal;
