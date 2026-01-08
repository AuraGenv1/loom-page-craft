import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = "cover" | "diagram";

const NEGATIVE_PROMPT = "text, letters, words, labels, gibberish, alphabet, watermark, blurry, signature, numbers, captions, titles";

const buildPrompt = (variant: Variant, topicOrTitle: string, caption?: string) => {
  if (variant === "diagram") {
    // High-end infographic style for [IMAGE:] tags
    return `High-end professional photograph, 8k resolution: ${caption || topicOrTitle}. Cinematic lighting, sharp focus, magazine quality. NO TEXT ON IMAGE. No diagrams, no illustrations, no people.`;
  }

  // Cover - Breathtaking professional photography
  // NO books, NO diagrams, NO people, just stunning imagery of the topic
  return `A breathtaking, professional 8k travel photograph of ${topicOrTitle}. Cinematic lighting, wide angle, high resolution, vibrant colors, magazine cover quality. Strictly NO text, NO open books, NO diagrams, NO people, NO illustrations. Just pure stunning photography of the location or subject.`;
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

    // SECURITY: Limit input length to prevent cost abuse
    const MAX_INPUT_LENGTH = 200;
    const rawSubject = (topic || title || "").toString();
    if (rawSubject.length > MAX_INPUT_LENGTH) {
      console.error("Input too long:", rawSubject.length, "chars");
      return new Response(JSON.stringify({ error: `Input must be ${MAX_INPUT_LENGTH} characters or less` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedVariant: Variant = variant === "diagram" ? "diagram" : "cover";
    const subject = rawSubject;

    console.log(`Generating ${resolvedVariant} image for: ${subject}`);

    const prompt = buildPrompt(resolvedVariant, subject, caption);
    
    // Use FAL.AI directly with FAL_KEY
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      console.error("FAL_KEY not configured");
      return new Response(JSON.stringify({ error: "Image service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Calling FAL.AI flux/dev endpoint...");

    const response = await fetchWithRetry(
      "https://fal.run/fal-ai/flux/dev",
      {
        method: "POST",
        headers: {
          "Authorization": `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: NEGATIVE_PROMPT,
          image_size: "square_hd",
          num_inference_steps: 28,
          num_images: 1,
          enable_safety_checker: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FAL.AI API error:", response.status, errorText);
      throw new Error(`FAL.AI API error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.images?.[0]?.url;

    if (!imageUrl) {
      console.error("No image URL in FAL.AI response:", data);
      throw new Error("No image generated");
    }

    console.log("FAL.AI image generated successfully");

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

