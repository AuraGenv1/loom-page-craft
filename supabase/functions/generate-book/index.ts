import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, topic } = await req.json()
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is missing from your Lovable Secrets." }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Generating book for: ${title} - ${topic}`);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ 
            text: `Generate a luxury instructional book structure for "${title}" about "${topic}". Return ONLY a JSON object: {"preface": "string", "chapters": [{"title": "string", "description": "string"}]}. Generate 5 chapters.` 
          }] 
        }],
        generationConfig: {
          response_mime_type: "application/json",
        }
      })
    })

    const data = await response.json()

    // --- NEW ROBUST ERROR HANDLING ---
    if (data.error) {
      console.error("Gemini API Error:", data.error.message);
      return new Response(
        JSON.stringify({ error: `Gemini API Error: ${data.error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      console.error("Unexpected Gemini Response Format:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Gemini returned an empty response. This usually happens due to safety filters or an invalid API key." }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const contentText = data.candidates[0].content.parts[0].text;
    const bookContent = JSON.parse(contentText);

    return new Response(
      JSON.stringify({ content: bookContent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error("Edge Function Runtime Error:", error.message);
    return new Response(
      JSON.