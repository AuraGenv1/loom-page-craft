import TechnicalDiagram from './TechnicalDiagram';
import LocalResources from './LocalResources';

interface ChapterContentProps {
  topic: string;
}

const ChapterContent = ({ topic }: ChapterContentProps) => {
  return (
    <article className="w-full max-w-2xl mx-auto py-12 px-4 animate-fade-up animation-delay-300">
      {/* Chapter header */}
      <header className="mb-10 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Chapter One
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
          Introduction to {topic}
        </h1>
        <div className="w-16 h-[1px] bg-foreground/20 mx-auto mt-6" />
      </header>

      {/* Chapter content */}
      <div className="prose prose-lg max-w-none space-y-6 text-foreground/90 leading-relaxed">
        <p className="text-lg first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-none">
          Welcome to your comprehensive guide on {topic}. This carefully crafted manual 
          will walk you through everything you need to know, from the foundational 
          concepts to advanced techniques that experts use every day.
        </p>

        <p>
          Whether you're a complete beginner or looking to refine your existing skills, 
          this guide is designed to meet you where you are. We've distilled years of 
          expertise and countless hours of research into clear, actionable steps.
        </p>

        <TechnicalDiagram caption={`Core concepts of ${topic} visualized`} />

        <h2 className="font-serif text-2xl font-semibold mt-10 mb-4">
          Why This Matters
        </h2>

        <p>
          Understanding {topic} isn't just about acquiring a new skill—it's about 
          opening doors to new possibilities. In today's world, this knowledge can 
          transform how you approach problems and create opportunities you never 
          knew existed.
        </p>

        <blockquote className="border-l-2 border-foreground/20 pl-6 my-8 italic text-foreground/70">
          "The journey of a thousand miles begins with a single step. This chapter 
          is that first step."
        </blockquote>

        <h2 className="font-serif text-2xl font-semibold mt-10 mb-4">
          What You'll Need
        </h2>

        <p>
          Before we dive deeper, let's ensure you have everything prepared. The 
          good news? You probably already have most of what's needed. We believe 
          in accessibility and have designed this guide to work with commonly 
          available resources.
        </p>

        <ul className="list-disc pl-6 space-y-2 text-foreground/80">
          <li>A curious mindset and willingness to learn</li>
          <li>Basic familiarity with fundamental concepts</li>
          <li>Access to standard tools (detailed in Chapter 3)</li>
          <li>Approximately 2-3 hours per week for practice</li>
        </ul>

        <p className="mt-8">
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
