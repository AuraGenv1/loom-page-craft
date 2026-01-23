import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry helper with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Attempt ${attempt} failed with ${res.status}, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Attempt ${attempt} network error, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { 
      bookId, 
      chapterNumber, 
      chapterTitle, 
      topic, 
      tableOfContents,
      isVisualTopic = false,
      targetPagesPerChapter = 6,
      language = 'en' 
    } = await req.json();

    if (!bookId || !chapterNumber || !chapterTitle || !topic) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: corsHeaders
      });
    }

    console.log(`[generate-chapter-blocks] Chapter ${chapterNumber}: "${chapterTitle}" for "${topic}"`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const prompt = `You are an elite "Luxury Book Architect." Generate structured page blocks for Chapter ${chapterNumber}: "${chapterTitle}" of the book "${topic}".

=== LUXURY ARCHITECT RULES ===

RULE 1: STRUCTURAL DEPTH (No Filler)
- Achieve page count through NEW insights, angles, and rich details.
- NEVER repeat facts, paragraphs, or filler content from other chapters.
- Each text block should provide unique, valuable information.

RULE 2: VISUAL BREATHING ROOM (Luxury Rhythm)
This chapter MUST follow this rhythm:
  1x Chapter Title Page (ALWAYS first block)
  1-2x Full-Page "Hero" Images (image_full blocks)
  4-6x Text Pages (text blocks, ~250 words each)
  1x Pro Tip or Quote Page
- BALANCE: Images must NOT exceed 30% of chapter pages.

RULE 3: NO FACES & HIGH AESTHETIC (Image Queries)
- For ALL image queries, prioritize: "Architecture," "Atmosphere," "Texture," "Macro," "Landscape," "Still Life."
- STRICTLY FORBIDDEN: human faces, people, portraits, crowds, selfies.
- VARY CAMERA ANGLES: Use Wide Shot, Macro/Close-Up, Action Shot, Aerial View, Detail Shot to avoid visual repetition.
- Append to ALL queries: "no people no faces atmospheric"

RULE 4: FULL PAGE TEXT DENSITY
- Each "text" block: TARGET 300-350 words for a full, legible page.
- Ensure each text page feels "full" but readable. Do NOT leave pages half-empty.
- Write with precision. Every word must earn its place.

RULE 5: CHAPTER BREAKER (Professional Offset)
- If this is NOT chapter 1 and the previous chapter may end on odd page, start with a "quote" block before "chapter_title".

RULE 6: MANDATORY STRUCTURE (No Wall-of-Text!)
- You MUST include at least 2 "heading" blocks per chapter to break up the content into logical sections.
- You MUST include at least 1 "list" block per chapter with bullet points or numbered items.
- NEVER write 3 consecutive "text" blocks in a row. Always interleave with headings, lists, images, or pro_tips.
- Use H2/H3 markdown headers within text blocks for additional structure.
- Structure the content for optimal readability and visual variety.
- CRITICAL: Format for maximum readability. No giant walls of text!

TOPIC TYPE: ${isVisualTopic ? 'VISUAL (Travel/Lifestyle/Art) - More hero images' : 'INFORMATIONAL (Business/Science/History) - More text depth'}
TARGET BLOCKS: ${targetPagesPerChapter}
BOOK CONTEXT: ${tableOfContents?.map((c: { title: string }) => c.title).join(', ') || ''}

Block types:
- "chapter_title": { "chapter_number": ${chapterNumber}, "title": "${chapterTitle}" } - ALWAYS included
- "text": { "text": "300-350 words for a full page" }
- "image_full": { "query": "search term no people", "caption": "Evocative caption" }
- "image_half": { "query": "search term no people", "caption": "Caption" }
- "pro_tip": { "text": "Expert insider advice" }
- "heading": { "level": 2, "text": "Section heading" } - REQUIRED: at least 2 per chapter
- "list": { "items": ["item 1", "item 2", "item 3"] } - REQUIRED: at least 1 per chapter
- "quote": { "text": "Inspirational quote", "attribution": "Author" }
- "divider": { "style": "minimal" }

REQUIREMENTS:
- First block MUST be "chapter_title" (or "quote" then "chapter_title" for offset)
- Include at least 1 "pro_tip" block
- Include at least 2 "heading" blocks (mandatory for structure)
- Include at least 1 "list" block (mandatory for variety)
- Each "text" block: 300-350 words for a full, dense page
- Total blocks: ${targetPagesPerChapter}
- Images ≤30% of blocks
- NEVER have 3 consecutive "text" blocks

Return ONLY valid JSON array:
[
  {"block_type": "chapter_title", "content": {"chapter_number": ${chapterNumber}, "title": "${chapterTitle}"}},
  {"block_type": "image_full", "content": {"query": "atmospheric scene", "caption": "Hero image"}},
  {"block_type": "heading", "content": {"level": 2, "text": "Section Title"}},
  {"block_type": "text", "content": {"text": "Rich content (~300 words)..."}},
  {"block_type": "list", "content": {"items": ["Key point 1", "Key point 2", "Key point 3"]}},
  {"block_type": "text", "content": {"text": "More content (~300 words)..."}},
  {"block_type": "heading", "content": {"level": 2, "text": "Another Section"}},
  {"block_type": "text", "content": {"text": "Additional insights (~300 words)..."}},
  {"block_type": "pro_tip", "content": {"text": "Expert advice"}},
  ...
]

Language: ${language}`;

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, response_mime_type: "application/json" },
        }),
      }
    );

    const geminiData = await response.json();
    
    if (geminiData.error) {
      console.error('Gemini API error:', geminiData.error);
      throw new Error(`Gemini API error: ${geminiData.error.message}`);
    }

    let text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Gemini Raw Output:", text);
      throw new Error("No JSON array found in AI response");
    }
    
    // Sanitize
    let cleanJson = jsonMatch[0]
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, (char: string) => {
        if (char === '\n' || char === '\r' || char === '\t') return char;
        return '';
      });
    
    cleanJson = cleanJson.replace(/"([^"]*?)"/g, (_match: string, content: string) => {
      const escaped = content
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${escaped}"`;
    });

    let blocksData;
    try {
      blocksData = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON Parse Failed:", cleanJson.substring(0, 500));
      throw new Error(`Failed to parse blocks: ${(e as Error).message}`);
    }

    if (!Array.isArray(blocksData) || blocksData.length === 0) {
      throw new Error('AI returned empty or invalid blocks array');
    }

    // Save to Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // First, delete any existing blocks for this chapter (in case of regeneration)
    await supabase
      .from('book_pages')
      .delete()
      .eq('book_id', bookId)
      .eq('chapter_number', chapterNumber);

    // Insert new blocks
    const blocks = blocksData.map((block: any, index: number) => ({
      book_id: bookId,
      chapter_number: chapterNumber,
      page_order: index + 1,
      block_type: block.block_type,
      content: block.content,
      image_url: null
    }));

    const { error: insertError } = await supabase
      .from('book_pages')
      .insert(blocks);

    if (insertError) {
      console.error('Blocks insert error:', insertError);
      throw new Error(`Failed to save blocks: ${insertError.message}`);
    }

    console.log(`[generate-chapter-blocks] Inserted ${blocks.length} blocks for chapter ${chapterNumber}`);

    return new Response(JSON.stringify({ 
      success: true,
      chapterNumber,
      blocks 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
