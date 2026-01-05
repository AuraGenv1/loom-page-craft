import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const faqs = [
    {
      question: "Do I own the guide once it's created?",
      answer:
        "Yes, absolutely. Once your custom guide is generated, you own the content entirely. The instructional material, table of contents, and all chapter content become your intellectual property to use as you see fit.",
    },
    {
      question: "Can I sell my custom manuals commercially?",
      answer:
        "Yes, you retain full commercial rights to any guide you create. Whether you wish to sell printed copies, offer digital downloads, or include the content in paid courses, you have complete freedom to monetize your custom manuals.",
    },
    {
      question: "How does local resource data work?",
      answer:
        "We integrate with real-time location services to provide relevant local suppliers, workshops, and specialty shops near you. When you enable location access, our system searches for businesses that match your guide's topic—ensuring you have access to genuine, nearby resources rather than generic suggestions.",
    },
    {
      question: "What topics can I create guides for?",
      answer:
        "Loom & Page can weave instructional volumes on a vast array of subjects—from artisan crafts like leatherworking and woodworking, to technical pursuits like vintage car restoration or electronics repair. We focus on practical, skill-based topics where step-by-step instruction provides genuine value.",
    },
    {
      question: "How is my guide different from others?",
      answer:
        "Each guide is uniquely composed based on your specific topic query. Unlike template-based content, our AI architect crafts original instructional prose in the style of classic technical manuals. No two guides are identical, even on similar subjects.",
    },
    {
      question: "Can I access my guides on multiple devices?",
      answer:
        "Yes. When you create an account and save your guides to the cloud, they become accessible from any device. You can also download PDF versions for offline access and printing.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
        <div className="text-center mb-12">
          <h1 className="font-serif text-4xl md:text-5xl tracking-wide text-foreground mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-muted-foreground text-lg">
            Everything you need to know about Loom & Page
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border border-border/60 rounded-lg px-6 bg-card/50"
            >
              <AccordionTrigger className="text-left font-serif text-lg hover:no-underline py-5">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed pb-5">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-16 text-center border-t border-border/40 pt-12">
          <p className="text-muted-foreground mb-4">
            Have another question?
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-serif text-primary hover:text-primary/80 transition-colors"
          >
            Return to the Loom
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
