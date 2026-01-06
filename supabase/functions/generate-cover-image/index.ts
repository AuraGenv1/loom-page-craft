import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { topic, title } = await req.json();
    const FAL_KEY = Deno.env.get("FAL_KEY");

    // FORCE high-end photography for EVERY request (No more diagrams)
    const prompt = `A cinematic, ultra-high-resolution studio photograph of ${topic} for a luxury book "${title}". Professional lighting, 8k, masterpiece quality.`;

    const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: "square_hd", sync_mode: true }),
    });

    const data = await response.json();
    return new Response(JSON.stringify({ imageUrl: data.images[0].url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: corsHeaders });
  }
});
