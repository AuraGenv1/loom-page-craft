import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border/30 py-3 px-4 z-50">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-2">
        {/* Logo matching header exactly */}
        <div className="flex items-center gap-2">
          {/* CSS-based loom + page icon - smaller version */}
          <div className="relative w-5 h-5 opacity-50">
            {/* Vertical loom lines */}
            <div className="absolute left-0.5 top-0.5 bottom-0.5 w-[1.5px] bg-foreground rounded-full" />
            <div className="absolute left-1/2 -translate-x-1/2 top-0.5 bottom-0.5 w-[1.5px] bg-foreground rounded-full" />
            <div className="absolute right-0.5 top-0.5 bottom-0.5 w-[1.5px] bg-foreground rounded-full" />
            {/* Horizontal page fold */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-foreground rounded-full" />
            {/* Corner fold detail */}
            <div className="absolute right-0 top-0 w-1.5 h-1.5 border-r-[1.5px] border-t-[1.5px] border-foreground rounded-tr-sm opacity-60" />
          </div>
          {/* Brand name */}
          <span className="font-serif text-xs font-normal tracking-tight text-muted-foreground">
            Loom & Page
          </span>
        </div>
        
        {/* Disclaimer - translated */}
        <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
          {t('aiDisclaimer')}
        </p>
        
        {/* Links - kept in English as requested */}
        <div className="flex items-center gap-4">
          <Link 
            to="/privacy" 
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link 
            to="/terms" 
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link 
            to="/faq" 
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            FAQ
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link 
            to="/contact" 
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {t('contactUs')}
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
