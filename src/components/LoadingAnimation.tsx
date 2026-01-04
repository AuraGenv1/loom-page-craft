const LoadingAnimation = () => {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      {/* Weaving loom animation */}
      <div className="flex items-end gap-2 h-12 mb-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-1 bg-foreground rounded-full animate-weave"
            style={{
              height: '100%',
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
      <p className="font-serif text-xl md:text-2xl text-foreground tracking-tight">
        Weaving your guide...
      </p>
      <p className="text-sm text-muted-foreground mt-2">
        Crafting chapters with care
      </p>
    </div>
  );
};

export default LoadingAnimation;
