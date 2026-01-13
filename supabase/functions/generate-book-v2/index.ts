import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, sessionId, language = 'en' } = await req.json();

    console.log(`DEBUG: Starting generation for topic: "${topic}"`);

    // 1. AI GENERATION (Confirmed Working)
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
    
    const prompt = `Create a book outline for: "${topic}". Return ONLY raw JSON: { "title": "Title", "chapters": [{ "chapter_number": 1, "title": "Ch1" }] }. Generate 5 chapters.`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      }),
    });

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("AI failed to return text");
    
    const bookData = JSON.parse(rawText);
    console.log("DEBUG: AI Success. Title:", bookData.title);

    // 2. DATABASE SAVE (The Failing Part)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Construct the object we WANT to insert
    const bookPayload = {
      session_id: sessionId,   // CHECK: Does your table use 'session_id' or 'user_id'?
      topic: topic,
      title: bookData.title,
      table_of_contents: bookData.chapters,
      chapter1_content: 'Generating...',
      has_disclaimer: false,
      local_resources: [],
    };

    console.log("DEBUG: Attempting to insert into 'books' table:", JSON.stringify(bookPayload));

    const { data: bookRow, error: bookError } = await supabase
      .from('books')
      .insert(bookPayload)
      .select()
      .single();

    // 3. ERROR TRAP: Return the EXACT database error to the user
    if (bookError) {
      console.error("DB INSERT ERROR:", bookError);
      return new Response(
        JSON.stringify({ 
          error: `DATABASE REJECTED SAVE: ${bookError.message}. Hint: Check column names. Details: ${bookError.details || 'None'}` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Success Response
    return new Response(
      JSON.stringify({ success: true, bookId: bookRow.id, title: bookData.title }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `SCRIPT ERROR: ${(error as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
