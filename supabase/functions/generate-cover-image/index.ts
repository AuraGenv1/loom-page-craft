import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, variant, plateNumber, caption } = await req.json();
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (!FAL_KEY) {
      console.error("FAL_KEY is missing in environment variables");
      throw new Error("Image service configuration missing");
    }

    // Determine the prompt based on whether it's a cover or a diagram
    let prompt = "";
    if (variant === "diagram") {
      prompt = `A professional, 8k technical diagram of ${topic} for ${title}. Plate ${plateNumber}: ${caption}. Detailed technical drawing, white background, labeled parts with clear text, architectural style, sharp lines.`;
    } else {
      prompt = `A cinematic, high-end studio photograph for a luxury book cover titled "${title}" about ${topic}. Professional lighting, shallow depth of field, minimal artisan aesthetic, 8k resolution, elegant composition.`;
    }

    console.log(`Requesting Fal.ai image for: ${variant}`);

    // Call Fal.ai FLUX Schnell (Fast and high quality)
    const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        image_size: "square_hd",
        num_inference_steps: 4,
        sync_mode: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Fal.ai API error:", errorData);
      throw new Error("Failed to generate image from Fal.ai");
    }

    const data = await response.json();
    const imageUrl = data.images[0].url;

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in generate-cover-image:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
