import { BookOpen, Check } from 'lucide-react';

interface PaywallOverlayProps {
  onPurchase: () => void;
}

const PaywallOverlay = ({ onPurchase }: PaywallOverlayProps) => {
  const features = [
    '10 comprehensive chapters',
    'Step-by-step instructions',
    'Expert tips & techniques',
    'Downloadable PDF version',
  ];

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
            onClick={onPurchase}
            className="inline-flex items-center justify-center h-14 px-10 bg-foreground text-background font-medium rounded-full hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            One-time purchase: $4.99
          </button>

          <p className="text-xs text-muted-foreground mt-4">
            Instant access • No subscription required
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaywallOverlay;
