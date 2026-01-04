import { BookOpen, Utensils, Palette, Wrench, Camera, Music, Leaf, Dumbbell, Code, Sparkles } from 'lucide-react';

interface BookCoverProps {
  title: string;
  topic?: string;
}

const getTopicIcon = (topic: string) => {
  const lowerTopic = topic.toLowerCase();
  if (lowerTopic.includes('cook') || lowerTopic.includes('bak') || lowerTopic.includes('food') || lowerTopic.includes('bread')) {
    return Utensils;
  }
  if (lowerTopic.includes('paint') || lowerTopic.includes('art') || lowerTopic.includes('draw') || lowerTopic.includes('color')) {
    return Palette;
  }
  if (lowerTopic.includes('repair') || lowerTopic.includes('fix') || lowerTopic.includes('build') || lowerTopic.includes('diy')) {
    return Wrench;
  }
  if (lowerTopic.includes('photo') || lowerTopic.includes('camera')) {
    return Camera;
  }
  if (lowerTopic.includes('music') || lowerTopic.includes('guitar') || lowerTopic.includes('piano')) {
    return Music;
  }
  if (lowerTopic.includes('garden') || lowerTopic.includes('plant') || lowerTopic.includes('grow')) {
    return Leaf;
  }
  if (lowerTopic.includes('fitness') || lowerTopic.includes('exercise') || lowerTopic.includes('workout')) {
    return Dumbbell;
  }
  if (lowerTopic.includes('code') || lowerTopic.includes('program') || lowerTopic.includes('develop')) {
    return Code;
  }
  return BookOpen;
};

const BookCover = ({ title, topic = '' }: BookCoverProps) => {
  const TopicIcon = getTopicIcon(topic || title);

  return (
    <div className="w-full max-w-md mx-auto aspect-[3/4] gradient-paper rounded-sm shadow-book p-12 md:p-16 flex flex-col justify-between animate-page-turn relative overflow-hidden border border-border/30">
      {/* Deckle edge effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-gradient-to-b from-transparent via-foreground/5 to-transparent" />
      </div>

      {/* Top decorative element */}
      <div className="flex justify-center">
        <div className="flex gap-1.5">
          <div className="w-10 h-[1px] bg-foreground/15 rounded-full" />
          <div className="w-2 h-[1px] bg-foreground/15 rounded-full" />
          <div className="w-2 h-[1px] bg-foreground/15 rounded-full" />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
        {/* Large blueprint-style icon */}
        <div className="relative mb-10">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border border-foreground/10 flex items-center justify-center bg-secondary/20">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border border-dashed border-foreground/15 flex items-center justify-center">
              <TopicIcon className="w-16 h-16 md:w-20 md:h-20 text-foreground/40 stroke-[0.75]" />
            </div>
          </div>
          {/* Corner accents */}
          <div className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-foreground/20" />
          <div className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-foreground/20" />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-foreground/20" />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-foreground/20" />
        </div>

        <p className="text-[10px] md:text-xs uppercase tracking-[0.4em] text-muted-foreground mb-3">
          A Complete Guide
        </p>
        <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground leading-tight mb-4">
          {title}
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground/70 italic tracking-wide">
          A Comprehensive Instructional Volume
        </p>
        <div className="w-16 h-[1px] bg-foreground/20 mt-6" />
      </div>

      {/* Bottom branding with logo */}
      <div className="text-center flex flex-col items-center gap-3">
        {/* Mini loom icon */}
        <div className="flex items-center gap-2 opacity-60">
          <div className="flex items-center gap-[2px]">
            <div className="w-[1.5px] h-4 bg-foreground/50 rounded-full" />
            <div className="w-[1.5px] h-4 bg-foreground/50 rounded-full" />
            <div className="w-[1.5px] h-4 bg-foreground/50 rounded-full" />
          </div>
          <div className="w-3 h-[1px] bg-foreground/50 -ml-[6px]" />
        </div>
        <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase font-serif">
          Loom & Page
        </p>
      </div>
    </div>
  );
};

export default BookCover;
