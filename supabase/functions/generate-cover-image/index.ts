import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram";

const BLOCKED_HOST_SNIPPETS = [
  "instagram.",
  "pinterest.",
  "tripadvisor.",
];

const isBlockedUrl = (urlStr: string): boolean => {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return BLOCKED_HOST_SNIPPETS.some((d) => host.includes(d));
  } catch {
    return true;
  }
};

// More permissive location extraction: supports apostrophes/hyphens and commas (e.g. "St. Moritz", "Badrutt's")
const extractGeographicLocation = (topic: string): string | null => {
  const patterns = [
    /\b(?:in|to|of|about|for|visiting|exploring)\s+([A-Z][\w'’\-\.]+(?:\s+[A-Z][\w'’\-\.]+)*(?:,\s*[A-Z][\w'’\-\.]+(?:\s+[A-Z][\w'’\-\.]+)*)?)/i,
    /^([A-Z][\w'’\-\.]+(?:,?\s+[A-Z][\w'’\-\.]+)*)/,
  ];

  for (const p of patterns) {
    const m = topic.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
};

const isTravelTopic = (topic: string): boolean => {
  const travelPatterns = /\b(travel|trip|vacation|tour|visit|guide|destination|city|country|explore|journey|getaway|resort|hotel|tourism|itinerary)\b/i;
  return travelPatterns.test(topic);
};

const buildSearchQuery = (variant: Variant, topicOrTitle: string, caption?: string): string => {
  const location = extractGeographicLocation(topicOrTitle);
  const isTravel = isTravelTopic(topicOrTitle);

  if (variant === "diagram" && caption) {
    // Inline images: we want real photos when possible (not diagrams)
    const locationSuffix = location ? ` ${location}` : "";
    return `${caption}${locationSuffix} photograph`;
  }

  // Cover image: prioritize location grounding for travel topics
  if (isTravel && location) {
    return `${location} landmark architecture photograph editorial`;
  }

  return `${topicOrTitle} professional photograph`;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeoutId);
  }
};

const looksLikeLoadableImage = async (url: string): Promise<boolean> => {
  // We only need to reject obvious non-images or dead links.
  // (Browser hotlink/CORS can still fail, but this eliminates the worst offenders.)
  try {
    // Prefer HEAD (fast) but some servers disallow.
    let res = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (res.status === 405 || res.status === 403) {
      // Some CDNs block HEAD; try minimal GET.
      res = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            Range: "bytes=0-0",
            "User-Agent": "Mozilla/5.0 (compatible; LovableImageFetcher/1.0)",
          },
        },
        8000
      );
    }

    if (!res.ok) return false;
    const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
    return ct.startsWith("image/");
  } catch {
    return false;
  }
};

async function fetchGoogleImage(query: string, apiKey: string, cx: string): Promise<string | null> {
  try {
    console.log("Google CSE search query:", query);

    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      searchType: "image",
      num: "5",
      imgSize: "xlarge",
      imgType: "photo",
      safe: "active",
    });

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google CSE API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const items: Array<{ link?: string; displayLink?: string; mime?: string }> = data.items ?? [];

    if (!items.length) {
      console.log("Google CSE returned no results");
      return null;
    }

    // Candidate selection: block known-hostile domains; validate link is an image.
    const candidates = items
      .map((it) => it.link)
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      .filter((u) => !isBlockedUrl(u));

    for (const url of candidates) {
      const ok = await looksLikeLoadableImage(url);
      if (ok) {
        console.log("Google CSE selected image:", url);
        return url;
      }
      console.log("Rejected image candidate (not loadable):", url);
    }

    console.log("No suitable image found after filtering/validation");
    return null;
  } catch (error) {
    console.error("Google CSE fetch error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption } = await req.json();

    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid or missing sessionId:", sessionId);
      return new Response(JSON.stringify({ error: "Valid session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MAX_INPUT_LENGTH = 200;
    const rawSubject = (topic || title || "").toString();
    if (!rawSubject || rawSubject.length > MAX_INPUT_LENGTH) {
      return new Response(JSON.stringify({ error: `Input must be ${MAX_INPUT_LENGTH} characters or less` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedVariant: Variant = variant === "diagram" ? "diagram" : "cover";

    const GOOGLE_CSE_API_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
    const GOOGLE_CSE_CX = Deno.env.get("GOOGLE_CSE_CX");

    if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) {
      console.error("Google CSE credentials not configured");
      return new Response(JSON.stringify({ error: "Image service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For cover: use topic first (more accurate), then title as fallback
    const coverSubject = (topic || title || "").toString();
    const subjectForQuery = resolvedVariant === "cover" ? coverSubject : rawSubject;

    const searchQuery = buildSearchQuery(resolvedVariant, subjectForQuery, caption);
    const imageUrl = await fetchGoogleImage(searchQuery, GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX);

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No suitable image found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
