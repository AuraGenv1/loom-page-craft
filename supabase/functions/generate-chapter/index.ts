import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, chapterNumber, chapterTitle, topic } = await req.json();
    
    if (!bookId || !chapterNumber || !chapterTitle || !topic) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating chapter ${chapterNumber}: ${chapterTitle} for book ${bookId}`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('AI service is not configured');
    }

    const systemPrompt = `You are a prolific author creating a comprehensive instructional textbook. Write ONLY the chapter content - no JSON, no metadata, just pure markdown content.

CRITICAL REQUIREMENTS:
- Write MINIMUM 2,000 words of substantive instructional content
- DO NOT SUMMARIZE - provide exhaustive detail
- Write in first-person plural ("we", "our") with academic yet accessible tone
- Use proper markdown: ## for sections, > for quotes, - for lists

CHAPTER STRUCTURE (ALL REQUIRED):
1. Engaging introduction (150+ words) establishing the chapter's importance
2. Historical context or background (200+ words)
3. At least 4-5 major sections with ## headers
4. Step-by-step instructions with detailed explanations
5. 2 real-world case studies (300+ words each)
6. "Common Mistakes" section with solutions
7. "Pro Tips" section with advanced techniques
8. "Key Takeaways" summary
9. Transition to the next chapter

DO NOT include any JSON. Write ONLY markdown content.`;

    const userPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for the instructional guide on "${topic}".

This chapter MUST be at least 2,000 words. Include:
- Detailed explanations for every concept
- Real examples and case studies
- Step-by-step instructions where applicable
- Expert tips and common pitfalls

Begin writing the chapter content now. No preamble, no JSON - just the chapter text in markdown format.`;

    // Exponential backoff on rate limits (429): 5s, 10s, 20s
    const maxRetries = 3;
    const baseWaitMs = 5000;
    let response: Response | null = null;

    for (let retry = 0; retry <= maxRetries; retry++) {
      const attempt = retry + 1;
      console.log(`Gemini API attempt ${attempt}/${maxRetries + 1} for chapter ${chapterNumber}`);

      try {
        // Use AbortController for timeout (90 seconds for chapter generation)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 8192,
              },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          break;
        }

        const errorText = await response.text();
        console.error(`Gemini API error (attempt ${attempt}):`, response.status, errorText);

        if (response.status === 429 && retry < maxRetries) {
          const waitTimeMs = baseWaitMs * Math.pow(2, retry); // 5s, 10s, 20s
          console.log(`Rate limited. Waiting ${waitTimeMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
          continue;
        }

        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'The Loom is busy. Please wait and try again.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        throw new Error(`AI service error: ${response.status}`);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`Gemini API timeout (attempt ${attempt})`);
          if (retry < maxRetries) {
            const waitTimeMs = baseWaitMs * Math.pow(2, retry);
            console.log(`Timeout occurred. Waiting ${waitTimeMs}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
            continue;
          }
        }
        throw fetchError;
      }
    }

    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({ error: 'The Loom is busy. Please wait and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      throw new Error('No content generated');
    }

    // Clean any markdown code blocks if the AI wrapped it
    content = content.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '').trim();

    console.log(`Generated ${content.length} characters for chapter ${chapterNumber}`);

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const columnName = `chapter${chapterNumber}_content`;
    const updateData: Record<string, string> = {};
    updateData[columnName] = content;

    const { error: updateError } = await supabase
      .from('books')
      .update(updateData)
      .eq('id', bookId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error('Failed to save chapter');
    }

    console.log(`Chapter ${chapterNumber} saved successfully`);

    return new Response(
      JSON.stringify({ success: true, chapterNumber, content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-chapter:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
