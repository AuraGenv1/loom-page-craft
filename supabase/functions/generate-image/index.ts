import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_API_URL = "https://fal.run/fal-ai/flux/schnell";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convert image URL to base64 data URL
async function urlToBase64(imageUrl: string): Promise<{ base64: string; contentType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }
  
  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  
  return {
    base64: btoa(binary),
    contentType,
  };
}

// Generate image with FAL.ai with retry logic
async function generateWithRetry(
  prompt: string,
  token: string,
  attempt: number = 1
): Promise<{ success: true; imageUrl: string } | { success: false; error: string; retryable: boolean }> {
  console.log(`[generate-image] Attempt ${attempt}/${MAX_RETRIES} for prompt: "${prompt.slice(0, 50)}..."`);

  try {
    const response = await fetch(FAL_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Key ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        image_size: "square_hd", // 1024x1024
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    // Handle rate limiting
    if (response.status === 429) {
      console.log(`[generate-image] Rate limited (429)`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        return generateWithRetry(prompt, token, attempt + 1);
      }
      return {
        success: false,
        error: "Our AI artist is taking a quick break. Please try again in a moment.",
        retryable: true,
      };
    }

    // Handle server errors with retry
    if (response.status >= 500) {
      console.log(`[generate-image] Server error (${response.status})`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        return generateWithRetry(prompt, token, attempt + 1);
      }
      return {
        success: false,
        error: "The AI service is temporarily busy. Please try again.",
        retryable: true,
      };
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[generate-image] HTTP ${response.status}: ${errorText}`);
      return {
        success: false,
        error: `Image generation failed. Please try again.`,
        retryable: false,
      };
    }

    const data = await response.json();
    console.log(`[generate-image] FAL response:`, JSON.stringify(data).slice(0, 200));

    // FAL returns images array with url
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
      console.error(`[generate-image] No image URL in response:`, data);
      return {
        success: false,
        error: "No image was generated. Please try a different prompt.",
        retryable: false,
      };
    }

    console.log(`[generate-image] Success! Image URL: ${imageUrl.slice(0, 80)}...`);
    
    return {
      success: true,
      imageUrl,
    };
  } catch (error) {
    console.error(`[generate-image] Network error:`, error);
    
    if (attempt < MAX_RETRIES) {
      console.log(`[generate-image] Retrying after network error...`);
      await sleep(RETRY_DELAY_MS);
      return generateWithRetry(prompt, token, attempt + 1);
    }
    
    return {
      success: false,
      error: "Connection issue. Please check your internet and try again.",
      retryable: true,
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, enhance } = await req.json();

    // Validate prompt
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please provide a description for your image." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (prompt.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Prompt is too long. Please keep it under 1000 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get API token
    const token = Deno.env.get("FAL_KEY");
    if (!token) {
      console.error("[generate-image] FAL_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build final prompt
    let finalPrompt = prompt.trim();
    if (enhance) {
      finalPrompt += ", highly detailed, cinematic lighting, 8k resolution, masterpiece";
    }

    console.log(`[generate-image] Starting generation. Enhance: ${enhance}. Prompt length: ${finalPrompt.length}`);

    // Generate with retry logic
    const result = await generateWithRetry(finalPrompt, token);

    if (!result.success) {
      const status = result.retryable ? 503 : 500;
      return new Response(
        JSON.stringify({ error: result.error, retryable: result.retryable }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert image URL to base64 for client
    try {
      const { base64, contentType } = await urlToBase64(result.imageUrl);
      
      return new Response(
        JSON.stringify({
          imageData: `data:${contentType};base64,${base64}`,
          contentType,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (convertError) {
      console.error("[generate-image] Failed to convert image:", convertError);
      // Fallback: return the URL directly
      return new Response(
        JSON.stringify({
          imageData: result.imageUrl,
          contentType: "image/png",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[generate-image] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
