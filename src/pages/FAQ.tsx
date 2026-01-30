import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const { t } = useLanguage();

  const faqs = [
    {
      question: t('faqOwnershipQ'),
      answer: t('faqOwnershipA'),
    },
    {
      question: t('faqCommercialQ'),
      answer: t('faqCommercialA'),
    },
    {
      question: t('faqLocalResourcesQ'),
      answer: t('faqLocalResourcesA'),
    },
    {
      question: t('faqTopicsQ'),
      answer: t('faqTopicsA'),
    },
    {
      question: t('faqUniqueQ'),
      answer: t('faqUniqueA'),
    },
    {
      question: t('faqMultiDeviceQ'),
      answer: t('faqMultiDeviceA'),
    },
    {
      question: t('faqReturnsQ'),
      answer: t('faqReturnsA'),
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
              <AccordionContent className="text-muted-foreground leading-relaxed pb-5 whitespace-pre-line">
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
            to="/contact"
            className="inline-flex items-center gap-2 font-serif text-primary hover:text-primary/80 transition-colors"
          >
            {t('contactUs')}
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
