import TechnicalDiagram from './TechnicalDiagram';
import LocalResources from './LocalResources';

interface ChapterContentProps {
  topic: string;
}

const ChapterContent = ({ topic }: ChapterContentProps) => {
  return (
    <article className="w-full max-w-3xl mx-auto py-16 md:py-20 px-6 md:px-12 animate-fade-up animation-delay-300 bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative">
      {/* Deckle edge effect */}
      <div className="absolute inset-0 pointer-events-none rounded-sm overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-gradient-to-b from-transparent via-foreground/[0.03] to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-[3px] bg-gradient-to-b from-transparent via-foreground/[0.03] to-transparent" />
      </div>

      {/* Chapter header */}
      <header className="mb-14 text-center">
        <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Chapter One
        </p>
        <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight">
          Introduction to {topic}
        </h1>
        <div className="flex items-center justify-center gap-3 mt-8">
          <div className="w-12 h-[1px] bg-foreground/15" />
          <div className="w-2 h-2 rounded-full border border-foreground/20" />
          <div className="w-12 h-[1px] bg-foreground/15" />
        </div>
      </header>

      {/* Chapter content */}
      <div className="prose prose-lg max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <p className="text-lg md:text-xl first-letter:text-6xl first-letter:font-serif first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:leading-none first-letter:text-foreground">
          Welcome to your comprehensive guide on {topic}. This carefully crafted manual 
          will walk you through everything you need to know, from the foundational 
          concepts to advanced techniques that experts use every day.
        </p>

        <p className="text-base md:text-lg">
          Whether you're a complete beginner or looking to refine your existing skills, 
          this guide is designed to meet you where you are. We've distilled years of 
          expertise and countless hours of research into clear, actionable steps.
        </p>

        <TechnicalDiagram 
          caption={`Core concepts of ${topic} visualized`} 
          plateNumber="1.1"
        />

        <h2 className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
          Why This Matters
        </h2>

        <p className="text-base md:text-lg">
          Understanding {topic} isn't just about acquiring a new skill—it's about 
          opening doors to new possibilities. In today's world, this knowledge can 
          transform how you approach problems and create opportunities you never 
          knew existed.
        </p>

        <blockquote className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl">
          "The journey of a thousand miles begins with a single step. This chapter 
          is that first step."
        </blockquote>

        <TechnicalDiagram 
          caption={`Essential tools and materials for ${topic}`} 
          plateNumber="1.2"
        />

        <h2 className="font-serif text-2xl md:text-3xl font-semibold mt-14 mb-6 text-foreground">
          What You'll Need
        </h2>

        <p className="text-base md:text-lg">
          Before we dive deeper, let's ensure you have everything prepared. The 
          good news? You probably already have most of what's needed. We believe 
          in accessibility and have designed this guide to work with commonly 
          available resources.
        </p>

        <ul className="list-none pl-0 space-y-4 text-foreground/75 my-8">
          <li className="flex items-start gap-4">
            <span className="w-6 h-6 rounded-full border border-foreground/20 flex items-center justify-center text-xs text-muted-foreground shrink-0 mt-0.5">1</span>
            <span>A curious mindset and willingness to learn</span>
          </li>
          <li className="flex items-start gap-4">
            <span className="w-6 h-6 rounded-full border border-foreground/20 flex items-center justify-center text-xs text-muted-foreground shrink-0 mt-0.5">2</span>
            <span>Basic familiarity with fundamental concepts</span>
          </li>
          <li className="flex items-start gap-4">
            <span className="w-6 h-6 rounded-full border border-foreground/20 flex items-center justify-center text-xs text-muted-foreground shrink-0 mt-0.5">3</span>
            <span>Access to standard tools (detailed in Chapter 3)</span>
          </li>
          <li className="flex items-start gap-4">
            <span className="w-6 h-6 rounded-full border border-foreground/20 flex items-center justify-center text-xs text-muted-foreground shrink-0 mt-0.5">4</span>
            <span>Approximately 2-3 hours per week for practice</span>
          </li>
        </ul>

        <p className="mt-10 text-base md:text-lg">
          In the following chapters, we'll explore each aspect in detail, building 
          your knowledge systematically. By the end of this guide, you'll have a 
          solid foundation and the confidence to apply what you've learned.
        </p>
      </div>

      {/* Local Resources Section */}
      <LocalResources topic={topic} />
    </article>
  );
};

export default ChapterContent;
