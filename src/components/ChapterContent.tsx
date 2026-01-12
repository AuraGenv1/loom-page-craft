import React, { forwardRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, ExternalLink, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LocalResource, ChapterInfo } from "@/lib/bookTypes";
import ReactMarkdown from "react-markdown";

interface ChapterContentProps {
  topic: string;
  content?: string;
  localResources?: LocalResource[];
  hasDisclaimer?: boolean;
  materials?: string[];
  isGenerating?: boolean;
  diagramImages?: Record<string, string>;
  tableOfContents?: ChapterInfo[];
  sessionId?: string;
}

const ChapterContent = forwardRef<HTMLElement, ChapterContentProps>(({
  topic,
  content,
  localResources = [],
  hasDisclaimer,
  materials = [],
  isGenerating,
  diagramImages = {},
  tableOfContents = [],
  sessionId,
}, ref) => {
  // Safety guard
  if (!content) {
    return null;
  }

  const chapterTitle = tableOfContents[0]?.title || "Chapter 1";

  return (
    <section ref={ref} className="space-y-8 animate-fade-in">
      {/* 1. Main Text Section */}
      <div className="prose prose-slate max-w-none">
        <div className="flex items-baseline justify-between mb-6 border-b pb-4">
          <h3 className="text-3xl font-serif text-slate-900">{chapterTitle}</h3>
        </div>

        {/* Markdown Content */}
        <div className="leading-relaxed text-slate-700">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>

      {/* Disclaimer if present */}
      {hasDisclaimer && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            This guide is for informational purposes only. Please verify details with local authorities and experts.
          </AlertDescription>
        </Alert>
      )}

      {/* 2. Location / Resources Section */}
      {localResources.length > 0 && (
        <Card className="border-slate-200 shadow-sm bg-white mt-8 break-inside-avoid">
          <CardHeader className="pb-2 border-b border-slate-50">
            <CardTitle className="flex items-center gap-2 text-lg font-serif text-slate-800">
              <MapPin className="h-5 w-5 text-emerald-600" />
              Local Resources
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {localResources.slice(0, 5).map((resource, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-start border-b border-slate-50 pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <h4 className="font-medium text-slate-900 text-base">{resource.name}</h4>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider">
                        {resource.type}
                      </span>
                      {resource.rating && <span>★ {resource.rating}</span>}
                    </div>
                    {resource.address && (
                      <p className="text-xs text-slate-400 mt-1 truncate max-w-[250px]">{resource.address}</p>
                    )}
                    {resource.description && (
                      <p className="text-xs text-slate-500 mt-1">{resource.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materials section if any */}
      {materials.length > 0 && (
        <Card className="border-slate-200 shadow-sm bg-white mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif text-slate-800">
              Materials & Supplies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
              {materials.map((material, idx) => (
                <li key={idx}>{material}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
});

ChapterContent.displayName = "ChapterContent";

export default ChapterContent;
