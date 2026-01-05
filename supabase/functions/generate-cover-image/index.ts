import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram";

const buildPrompt = (variant: Variant, topicOrTitle: string, caption?: string) => {
  if (variant === "diagram") {
    // Clear, instructive illustration (no text) for chapters.
    return `Ultra clean black and white instructional technical diagram of: ${caption || topicOrTitle}. Blueprint / engineering schematic style. Clear shapes, arrows and callouts WITHOUT any letters, numbers, labels or text. High contrast, thin precise lines, white background. No shading, no gradients, no watercolor, no realism.`;
  }

  // Cover (existing style)
  return `Minimalist black and white technical line art of ${topicOrTitle}, isolated on white background, architectural sketch style, no shading, high contrast. No text, no words, no letters. Clean precise thin lines only.`;
};

async function fetchWithRetry(url: string, init: RequestInit, retries = 2) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;

      // Retry transient upstream errors
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const waitMs = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Unknown error");
      if (attempt < retries) {
        const waitMs = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Unknown error");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, sessionId, variant, caption } = await req.json();

    // Validate session_id to prevent bot abuse
    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      console.error("Invalid or missing session_id:", sessionId);
      return new Response(JSON.stringify({ error: "Valid session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedVariant: Variant = variant === "diagram" ? "diagram" : "cover";
    const subject = (topic || title || "").toString();

    console.log(`Generating ${resolvedVariant} image for: ${subject}`);

    const prompt = buildPrompt(resolvedVariant, subject, caption);

    const response = await fetchWithRetry(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          modalities: ["image", "text"],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      throw new Error("No image generated");
    }

    // Return base64 data URL directly (no CORS, no storage policy issues)
    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error generating image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

