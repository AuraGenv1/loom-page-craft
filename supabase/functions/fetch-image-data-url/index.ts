// Force deploy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGE_BYTES = 2_500_000; // ~2.5MB safety cap

const toBase64 = (bytes: Uint8Array): string => {
  // Chunked conversion to avoid call stack limits
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string" || url.length > 1000) {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return new Response(JSON.stringify({ error: "Invalid url protocol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch image bytes server-side (avoids browser CORS/canvas taint issues)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LovablePDFProxy/1.0)",
          Accept: "image/*,*/*;q=0.8",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Failed to fetch image (${res.status})`, details: text.slice(0, 200) }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response(JSON.stringify({ error: "URL did not return an image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: "Image too large for PDF embedding" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base64 = toBase64(buf);
    const dataUrl = `data:${contentType};base64,${base64}`;

    return new Response(JSON.stringify({ dataUrl, contentType, bytes: buf.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-image-data-url error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
