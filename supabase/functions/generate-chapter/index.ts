import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, chapterNumber, topic, type, tone, instructions } = await req.json();
    
    // HARDCODED MODEL FIX
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `Write Chapter ${chapterNumber} for a book about "${topic}".
    Style: ${tone || 'engaging'}. 
    Instructions: ${instructions || 'Write a comprehensive chapter.'}.
    Return ONLY the raw text content. No markdown formatting like ** or ##.`;

    console.log(`Generating Chapter ${chapterNumber} with gemini-pro...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Gemini API Error:', data);
      throw new Error(data.error?.message || 'Failed to generate content');
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) throw new Error('No text returned from Gemini');

    // Save to Database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabase
      .from('chapters')
      .update({ content: generatedText, status: 'completed' })
      .eq('book_id', bookId)
      .eq('chapter_number', chapterNumber);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, content: generatedText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
