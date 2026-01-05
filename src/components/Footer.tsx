import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border/30 py-3 px-4 z-50">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-2">
        {/* Mini loom logo */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-[2px]">
            <div className="w-[1.5px] h-3 bg-foreground/40 rounded-full" />
            <div className="w-[1.5px] h-3 bg-foreground/40 rounded-full" />
            <div className="w-[1.5px] h-3 bg-foreground/40 rounded-full" />
          </div>
          <div className="w-2 h-[1px] bg-foreground/40 -ml-[5px]" />
          <span className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-serif ml-1">
            Loom & Page
          </span>
        </div>
        
        {/* Disclaimer */}
        <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
          AI-generated content for creative inspiration only. Not professional advice.
        </p>
        
        {/* Links */}
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
        </div>
      </div>
    </footer>
  );
};

export default Footer;
