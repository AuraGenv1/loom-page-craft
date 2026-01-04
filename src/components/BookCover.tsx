interface BookCoverProps {
  title: string;
}

const BookCover = ({ title }: BookCoverProps) => {
  return (
    <div className="w-full max-w-sm mx-auto aspect-[3/4] gradient-paper rounded-lg shadow-book p-8 flex flex-col justify-between animate-page-turn">
      {/* Top decorative element */}
      <div className="flex justify-center">
        <div className="flex gap-1">
          <div className="w-8 h-[2px] bg-foreground/20 rounded-full" />
          <div className="w-2 h-[2px] bg-foreground/20 rounded-full" />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
          A Complete Guide
        </p>
        <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground leading-tight mb-6">
          {title}
        </h1>
        <div className="w-12 h-[1px] bg-foreground/30" />
      </div>

      {/* Bottom branding */}
      <div className="text-center">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          Loom & Page
        </p>
      </div>
    </div>
  );
};

export default BookCover;
