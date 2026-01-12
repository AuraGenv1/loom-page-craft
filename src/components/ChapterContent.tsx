import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, ExternalLink, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LocalResource {
  name: string;
  type: string;
  rating: number;
  address: string;
  website?: string;
}

interface ChapterContentProps {
  chapter: {
    title: string;
    content: string;
    imageUrl?: string;
    locationTitle?: string;
  } | null; // Allow null for safety
  language?: string;
  localResources?: LocalResource[];
  loadingLocation?: boolean;
}

export const ChapterContent = ({
  chapter,
  language = "en",
  localResources = [],
  loadingLocation,
}: ChapterContentProps) => {
  // --- SAFETY GUARD ---
  // If chapter is undefined (loading error), return null instead of crashing
  if (!chapter) {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Main Text Section */}
      <div className="prose prose-slate max-w-none">
        <div className="flex items-baseline justify-between mb-6 border-b pb-4">
          {/* This line was crashing before. Now it's safe. */}
          <h3 className="text-3xl font-serif text-slate-900">{chapter.title}</h3>
        </div>

        {/* Image */}
        {chapter.imageUrl && (
          <div className="my-8 rounded-xl overflow-hidden shadow-lg h-64 md:h-80">
            <img
              src={chapter.imageUrl}
              alt={chapter.title}
              className="w-full h-full object-cover transition-transform hover:scale-105 duration-700"
            />
          </div>
        )}

        {/* Text Content */}
        <div className="whitespace-pre-wrap leading-relaxed text-slate-700">{chapter.content}</div>
      </div>

      {/* 2. Location / Resources Section */}
      {(loadingLocation || localResources.length > 0) && (
        <Card className="border-slate-200 shadow-sm bg-white mt-8 break-inside-avoid">
          <CardHeader className="pb-2 border-b border-slate-50">
            <CardTitle className="flex items-center gap-2 text-lg font-serif text-slate-800">
              <MapPin className="h-5 w-5 text-emerald-600" />
              {chapter.locationTitle || "Local Resources"}
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {loadingLocation ? (
              <div className="text-center py-4 text-slate-400 italic">Finding the best spots...</div>
            ) : localResources.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {localResources.map((resource, idx) => (
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
                        <span>★ {resource.rating}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate max-w-[250px]">{resource.address}</p>
                    </div>

                    {resource.website && (
                      <a
                        href={resource.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs flex items-center gap-1 mt-1"
                      >
                        Visit <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No specific local suppliers found for this section.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ChapterContent;
