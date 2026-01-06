import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, topic, caption } = await req.json();
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (!FAL_KEY) {
      throw new Error("FAL_KEY is missing in secrets");
    }

    // We removed the 'diagram' check. Now every image is a beautiful photo.
    // We use the caption or the topic to create the scene.
    const imageDescription = caption || topic;
    const prompt = `A cinematic, high-end studio photograph of ${imageDescription} for a luxury book titled "${title}". Professional lighting, shallow depth of field, 8k resolution, elegant artisan aesthetic, masterpiece quality.`;

    console.log(`Requesting Fal.ai photo for: ${imageDescription}`);

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

    const data = await response.json();
    return new Response(JSON.stringify({ imageUrl: data.images[0].url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
