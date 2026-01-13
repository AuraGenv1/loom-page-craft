import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

    // DIAGNOSTIC CALL: List all available models
    console.log("DEBUGGING: Listing available models...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to list models: ${data.error?.message || response.statusText}`);
    }

    // Filter for "generateContent" capable models
    const availableModels = data.models
      ?.filter((m: { supportedGenerationMethods: string[] }) => m.supportedGenerationMethods.includes("generateContent"))
      .map((m: { name: string }) => m.name)
      .join(", ");

    // THROW THE LIST AS AN ERROR SO WE CAN SEE IT IN THE UI
    throw new Error(`DIAGNOSTIC SUCCESS. Available models: ${availableModels || 'None found'}`);

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
