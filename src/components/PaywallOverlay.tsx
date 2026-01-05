import { useState } from 'react';
import { BookOpen, Check, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PaywallOverlayProps {
  onPurchase: () => void;
  onDownload?: () => void;
}

const PaywallOverlay = ({ onPurchase, onDownload }: PaywallOverlayProps) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);

  const features = [
    '10 comprehensive chapters',
    'Step-by-step instructions',
    'Expert tips & techniques',
    'Downloadable PDF version',
  ];

  const handlePurchase = async () => {
    setIsPurchasing(true);
    
    // Simulate purchase flow (replace with Stripe integration when enabled)
    // TODO: Connect to Stripe checkout when stripe--enable_stripe is called
    toast.info('Stripe integration coming soon! For now, enjoy test mode.', {
      description: 'Use ?test=true in the URL to unlock full content.',
    });
    
    // For demo purposes, show success after delay
    setTimeout(() => {
      setIsPurchasing(false);
      setIsPurchased(true);
      onPurchase();
    }, 1500);
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    }
  };

  return (
    <div className="relative mt-16">
      {/* Fade gradient overlay */}
      <div className="absolute inset-x-0 -top-32 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      
      {/* Paywall content */}
      <div className="backdrop-blur-md bg-background/80 border-t border-border py-16 px-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-6">
            <BookOpen className="w-7 h-7 text-foreground" />
          </div>
          
          {isPurchased ? (
            <>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-3">
                Thank you for your purchase!
              </h2>
              
              <p className="text-muted-foreground mb-8">
                Your complete guide is now unlocked. Download your PDF below.
              </p>

              {/* Download button */}
              <button
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 h-14 px-10 bg-foreground text-background font-medium rounded-full hover:opacity-90 transition-opacity active:scale-[0.98]"
              >
                <Download className="w-5 h-5" />
                Download Now
              </button>

              <p className="text-xs text-muted-foreground mt-4">
                PDF format • Commercial rights included
              </p>
            </>
          ) : (
            <>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-3">
                The rest of your 10-chapter guide is ready.
              </h2>
              
              <p className="text-muted-foreground mb-8">
                Unlock the complete guide and master this topic with our comprehensive curriculum.
              </p>

              {/* Features list */}
              <div className="flex flex-wrap justify-center gap-4 mb-10">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-foreground/80"
                  >
                    <Check className="w-4 h-4 text-accent" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Purchase button */}
              <button
                onClick={handlePurchase}
                disabled={isPurchasing}
                className="inline-flex items-center justify-center gap-2 h-14 px-10 bg-foreground text-background font-medium rounded-full hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50"
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'One-time purchase: $4.99'
                )}
              </button>

              <p className="text-xs text-muted-foreground mt-4">
                Instant access • No subscription required
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaywallOverlay;
