import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="hover:opacity-70 transition-opacity">
            <Logo />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container py-12 max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground mb-8">
          Privacy Policy
        </h1>
        
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-muted-foreground">
          <p className="text-sm text-muted-foreground/70">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium text-foreground">About Loom & Page</h2>
            <p>
              Loom & Page is a creative inspiration tool that generates educational how-to guides using AI technology. 
              Our content is intended for creative and educational purposes only and should not be relied upon as 
              professional, legal, medical, or expert advice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium text-foreground">Information We Collect</h2>
            <p>
              We collect minimal information to provide our service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Topics you search for to generate guides</li>
              <li>Account information if you choose to sign in (email address via Google)</li>
              <li>Anonymous session identifiers to remember your generated content</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium text-foreground">How We Use Your Information</h2>
            <p>
              We use your information solely to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Generate and display personalized how-to guides</li>
              <li>Save your projects if you're signed in</li>
              <li>Improve our service and user experience</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium text-foreground">Data Storage</h2>
            <p>
              Your data is stored securely using industry-standard encryption and security practices. 
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-medium text-foreground">Contact</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us through our website.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
