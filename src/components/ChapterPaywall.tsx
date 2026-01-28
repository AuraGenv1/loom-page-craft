import { Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ChapterPaywallProps {
  chapterNumber: number;
  chapterTitle: string;
  onUnlock?: () => void;
}

const ChapterPaywall = ({ chapterNumber, chapterTitle, onUnlock }: ChapterPaywallProps) => {
  const handleUnlock = () => {
    // Placeholder: No Stripe integration yet
    console.log('Stripe Checkout Triggered');
    toast.info('Checkout flow coming soon.');
    onUnlock?.();
  };

  return (
    <div className="relative h-full min-h-[400px] flex flex-col">
      {/* Chapter header (visible) */}
      <div className="text-center pt-8 pb-4 px-4">
        <p className="text-sm tracking-[0.3em] uppercase text-muted-foreground mb-2">
          Chapter {chapterNumber}
        </p>
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-4">
          {chapterTitle}
        </h2>
        <div className="w-16 h-px bg-border mx-auto" />
      </div>

      {/* Blurred content placeholder */}
      <div className="relative flex-1 overflow-hidden">
        {/* Fake content to blur */}
        <div className="absolute inset-0 p-8 select-none pointer-events-none" style={{ filter: 'blur(8px)' }}>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
          </p>
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />

        {/* Unlock CTA */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-6 max-w-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-serif text-xl font-semibold mb-2">
              Unlock Full Book
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Get instant access to all chapters, editing tools, and PDF exports.
            </p>
            <Button onClick={handleUnlock} size="lg" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Unlock — $4.99
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChapterPaywall;
