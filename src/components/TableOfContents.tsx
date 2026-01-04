import { Check, Lock } from 'lucide-react';
import { ChapterInfo } from '@/lib/bookTypes';

interface TableOfContentsProps {
  topic: string;
  chapters?: ChapterInfo[];
}

const TableOfContents = ({ topic, chapters }: TableOfContentsProps) => {
  // Use AI-generated chapters or fallback to defaults
  const displayChapters = chapters?.length
    ? chapters.map((ch, idx) => ({
        number: ch.chapter,
        title: ch.title,
        isUnlocked: idx === 0,
      }))
    : [
        { number: 1, title: `Introduction to ${topic}`, isUnlocked: true },
        { number: 2, title: 'Understanding the Fundamentals', isUnlocked: false },
        { number: 3, title: 'Essential Tools & Materials', isUnlocked: false },
        { number: 4, title: 'Getting Started: Step-by-Step', isUnlocked: false },
        { number: 5, title: 'Common Mistakes to Avoid', isUnlocked: false },
        { number: 6, title: 'Advanced Techniques', isUnlocked: false },
        { number: 7, title: 'Troubleshooting Guide', isUnlocked: false },
        { number: 8, title: 'Expert Tips & Tricks', isUnlocked: false },
        { number: 9, title: 'Real-World Applications', isUnlocked: false },
        { number: 10, title: 'Your Next Steps', isUnlocked: false },
      ];

  return (
    <div className="w-full max-w-2xl mx-auto py-12 animate-fade-up animation-delay-200">
      <h2 className="font-serif text-2xl md:text-3xl text-center mb-8">
        Table of Contents
      </h2>
      <div className="space-y-3">
        {displayChapters.map((chapter) => (
          <div
            key={chapter.number}
            className={`flex items-center justify-between py-3 px-4 rounded-lg transition-colors ${
              chapter.isUnlocked
                ? 'bg-card hover:bg-secondary/50 cursor-pointer'
                : 'opacity-50'
            }`}
          >
            <div className="flex items-center gap-4">
              <span className="font-serif text-lg text-muted-foreground w-8">
                {chapter.number.toString().padStart(2, '0')}
              </span>
              <span className={chapter.isUnlocked ? 'text-foreground' : 'text-muted-foreground'}>
                {chapter.title}
              </span>
            </div>
            {chapter.isUnlocked ? (
              <Check className="w-4 h-4 text-accent" />
            ) : (
              <Lock className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableOfContents;
