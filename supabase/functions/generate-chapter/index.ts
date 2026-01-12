import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLOCKED_HOST_SNIPPETS = ["instagram.", "pinterest.", "tripadvisor."];

const isBlockedUrl = (urlStr: string): boolean => {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return BLOCKED_HOST_SNIPPETS.some((d) => host.includes(d));
  } catch {
    return true;
  }
};

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
  try {
    let res = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (res.status === 405 || res.status === 403) {
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
  const items: Array<{ link?: string }> = data.items ?? [];
  const candidates = items
    .map((it) => it.link)
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    .filter((u) => !isBlockedUrl(u));

  for (const url of candidates) {
    if (await looksLikeLoadableImage(url)) return url;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, chapterNumber, chapterTitle, topic, language = 'en' } = await req.json();

    if (!bookId || !chapterNumber || !chapterTitle || !topic) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating chapter ${chapterNumber}: ${chapterTitle} for book ${bookId}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("AI service is not configured");

    // Language mapping
    const languageNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      zh: 'Chinese',
      ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    const systemPrompt = `You are a world-class expert—a travel journalist, subject matter specialist, and prolific author. You do NOT give homework—you ARE the expert. Provide SPECIFIC data, prices (2026), names, and recommendations.

CRITICAL LANGUAGE REQUIREMENT:
You MUST write the ENTIRE chapter in ${targetLanguage}. Even if the user's prompt is in English, you MUST generate ALL content, titles, descriptions, and recommendations entirely in ${targetLanguage}. The only exception is proper nouns (brand names, hotel names, place names) which should remain in their original form.

CRITICAL EXPERT PERSONA:
- NEVER say "research online", "check local listings", or "consult a professional"
- YOU provide the specific names, prices, recommendations, and data
- If discussing travel: give actual hotel names, restaurant recommendations, prices in local currency AND USD
- If discussing technical topics: give specific tool brands, part numbers, supplier names
- Be the expert friend who knows everything

CRITICAL REQUIREMENTS:
- Write MINIMUM 2,000 words of substantive instructional content
- DO NOT SUMMARIZE - provide exhaustive detail with SPECIFIC recommendations
- Write in first-person plural ("we", "our") with authoritative yet accessible tone
- Use proper markdown: ## for sections, > for quotes, - for lists

CHAPTER STRUCTURE (ALL REQUIRED):
1. Engaging introduction (150+ words) with specific, enticing details
2. Historical context or background (200+ words)
3. At least 4-5 major sections with ## headers
4. Step-by-step instructions with SPECIFIC names, prices, recommendations
5. 2 real-world examples with actual data (not "research this")
6. "Common Mistakes" section with ## header, then ### subheaders for each mistake, followed by **Solution:** format
7. MANDATORY: Include exactly ONE "Pro-Tip" callout using: [PRO-TIP: Expert advice] - the UI will render this as a styled box

SMART VISUAL SYSTEM:
- Include exactly ONE image marker ONLY if it adds real instructional value
- Use the tag: [IMAGE: Extremely specific prompt for high-end travel journalism photograph]
- The prompt must include GEOGRAPHIC LOCATION and be HIGHLY SPECIFIC
- Example: "[IMAGE: Authentic editorial photography of the Champs-Élysées at golden hour with Arc de Triomphe in the distance, Paris, France]"
- NEVER use diagrams, blueprints, or technical illustrations

CRITICAL FORMATTING RULES:
- DO NOT write "Pro Tips" or "Key Takeaways" as section headers - the UI handles these via [PRO-TIP:] tags
- DO NOT use bold (**text**) or italic (*text*) syntax anywhere except **Solution:**
- Write in plain text only
- NEVER end any line with asterisks

DO NOT include any JSON. Write ONLY markdown content in plain text.`;

    const userPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for the instructional guide on "${topic}".

This chapter MUST be at least 2,000 words. Include:
- Detailed explanations for every concept with SPECIFIC recommendations
- Real examples with actual names, prices (2026), and expert guidance
- Step-by-step instructions where applicable
- Expert tips and common pitfalls
- MANDATORY: Exactly ONE [PRO-TIP: ...] callout (the UI renders this as a styled box)
- OPTIONAL: One [IMAGE: very specific prompt with location] marker if it adds value

EXPERT REQUIREMENT: Be the expert. Not "check online" but provide the actual answer.

FORMATTING: Do NOT write "Pro Tips" or "Key Takeaways" as section headers. Use [PRO-TIP:] tags instead.

Begin writing the chapter content now. No preamble, no JSON - just the chapter text in markdown format.`;

    const maxRetries = 3;
    const baseWaitMs = 5000;
    let response: Response | null = null;

    for (let retry = 0; retry <= maxRetries; retry++) {
      const attempt = retry + 1;
      console.log(`Gemini API attempt ${attempt}/${maxRetries + 1} for chapter ${chapterNumber}`);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) break;

        const errorText = await response.text();
        console.error(`Gemini API error (attempt ${attempt}):`, response.status, errorText);

        if (response.status === 429 && retry < maxRetries) {
          const waitTimeMs = baseWaitMs * Math.pow(2, retry);
          console.log(`Rate limited. Waiting ${waitTimeMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
          continue;
        }

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "The Loom is busy. Please wait and try again." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        throw new Error(`AI service error: ${response.status}`);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError" && retry < maxRetries) {
          const waitTimeMs = baseWaitMs * Math.pow(2, retry);
          console.log(`Timeout occurred. Waiting ${waitTimeMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
          continue;
        }
        throw fetchError;
      }
    }

    if (!response || !response.ok) {
      return new Response(JSON.stringify({ error: "The Loom is busy. Please wait and try again." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("No content generated");

    content = content.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
    console.log(`Generated ${content.length} characters for chapter ${chapterNumber}`);

    // Extract one image marker to generate a real photograph URL (chapter title + location)
    const imageMarker = content.match(/\[IMAGE:\s*([^\]]+)\]/i);
    const location = extractGeographicLocation(topic) || topic;

    let chapterImageUrl: string | null = null;
    if (imageMarker?.[1]) {
      const GOOGLE_CSE_API_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
      const GOOGLE_CSE_CX = Deno.env.get("GOOGLE_CSE_CX");

      if (GOOGLE_CSE_API_KEY && GOOGLE_CSE_CX) {
        const query = `${chapterTitle} ${location} photograph`;
        try {
          chapterImageUrl = await fetchGoogleImage(query, GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX);
          if (chapterImageUrl) console.log("Chapter image selected:", chapterImageUrl);
        } catch (e) {
          console.error("Chapter image fetch failed:", e);
        }
      }
    }

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1) Keep existing behavior (books table)
    const columnName = `chapter${chapterNumber}_content`;
    const updateData: Record<string, string> = {};
    updateData[columnName] = content;

    const { error: updateError } = await supabase.from("books").update(updateData).eq("id", bookId);
    if (updateError) {
      console.error("Books table update error:", updateError);
      throw new Error("Failed to save chapter");
    }

    // 2) Ensure chapters table receives content + image_url
    try {
      const { data: existing } = await supabase
        .from("chapters")
        .select("id")
        .eq("book_id", bookId)
        .eq("chapter_number", chapterNumber)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("chapters")
          .update({
            title: chapterTitle,
            content,
            image_url: chapterImageUrl,
            status: "complete",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("chapters").insert({
          book_id: bookId,
          chapter_number: chapterNumber,
          title: chapterTitle,
          content,
          image_url: chapterImageUrl,
          status: "complete",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Chapters table upsert failed:", e);
    }

    console.log(`Chapter ${chapterNumber} saved successfully`);

    return new Response(JSON.stringify({ success: true, chapterNumber, content, imageUrl: chapterImageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-chapter:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
