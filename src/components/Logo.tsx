const Logo = () => {
  return (
    <div className="flex items-center gap-3">
      {/* CSS-based loom + page icon */}
      <div className="relative w-8 h-8">
        {/* Vertical loom lines */}
        <div className="absolute left-1 top-1 bottom-1 w-[2px] bg-foreground rounded-full" />
        <div className="absolute left-1/2 -translate-x-1/2 top-1 bottom-1 w-[2px] bg-foreground rounded-full" />
        <div className="absolute right-1 top-1 bottom-1 w-[2px] bg-foreground rounded-full" />
        {/* Horizontal page fold */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-foreground rounded-full" />
        {/* Corner fold detail */}
        <div className="absolute right-0 top-0 w-2 h-2 border-r-2 border-t-2 border-foreground rounded-tr-sm opacity-60" />
      </div>
      {/* Brand name */}
      <span className="font-serif text-xl font-normal tracking-tight text-foreground">
        Loom & Page
      </span>
    </div>
  );
};

export default Logo;
