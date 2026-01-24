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

RULE 1: PRECISE TEXT DENSITY (6x9 Print Fit)
- CRITICAL: Each "text" block MUST contain **250-280 words**. This is a 6x9 inch print book.
- 200 words is TOO SHORT (leaves empty space). 300+ words is TOO LONG (causes scrolling).
- Be PRECISE. Count your words. Target 250-280 words per text block.

RULE 2: MANDATORY INLINE MARKDOWN (No Wall-of-Text!)
- Use Markdown INSIDE text blocks: "## Header", "### Subheader", "* Bullet"
- Do NOT create separate "heading", "list", "quote", or "key_takeaway" blocks - they are FORBIDDEN.
- The FIRST text block of every chapter MUST start with a \`## Chapter Header\`.
- Every text block MUST have at least one "## Header" or "### Subheader" to break up content.
- NEVER write 3+ consecutive plain paragraphs without headers or bullets.

RULE 3: KEY TAKEAWAYS (Inline Only!)
- Do NOT use "key_takeaway" blocks. They are FORBIDDEN.
- Instead, write a \`### 🔑 Key Takeaway\` subheader INSIDE the text block at the end of a section.
- Example: "### 🔑 Key Takeaway\\n\\nThis is the main point of this section."

RULE 4: BANNED FORMATTING
- Do NOT use blockquotes (>). They are FORBIDDEN.
- Do NOT use italics for summaries.
- Do NOT use "quote" blocks. They cause rendering errors.

RULE 5: VISUAL BREATHING ROOM (Luxury Rhythm)
This chapter MUST follow this rhythm:
  1x Chapter Title Page (ALWAYS first block)
  1-2x Full-Page "Hero" Images (image_full blocks)
  4-6x Text Pages (text blocks, ~250-280 words each with inline markdown)
  1x Pro Tip Page
- BALANCE: Images must NOT exceed 30% of chapter pages.

RULE 6: NO FACES & VARIED CAMERA ANGLES (Image Queries)
- For ALL image queries, prioritize: "Architecture," "Atmosphere," "Texture," "Macro," "Landscape," "Still Life."
- STRICTLY FORBIDDEN: human faces, people, portraits, crowds, selfies.
- VARY CAMERA ANGLES: Use Wide Shot, Macro/Close-Up, Action Shot, Aerial View, Detail Shot.
- Append to ALL queries: "no people no faces atmospheric"

TOPIC TYPE: ${isVisualTopic ? 'VISUAL (Travel/Lifestyle/Art) - More hero images' : 'INFORMATIONAL (Business/Science/History) - More text depth'}
TARGET BLOCKS: ${targetPagesPerChapter}
BOOK CONTEXT: ${tableOfContents?.map((c: { title: string }) => c.title).join(', ') || ''}

Block types (ONLY use these - heading, list, quote, key_takeaway blocks are STRICTLY FORBIDDEN):
- "chapter_title": { "chapter_number": ${chapterNumber}, "title": "${chapterTitle}" } - ALWAYS first
- "text": { "text": "250-280 words. Use ## Header, ### Subheader, ### 🔑 Key Takeaway, * Bullet INSIDE. First text block MUST start with ## Header." }
- "image_full": { "query": "search term no people varied angle atmospheric", "caption": "Evocative caption" }
- "image_half": { "query": "search term no people atmospheric", "caption": "Caption" }
- "pro_tip": { "text": "Expert insider advice - practical tips ONLY" }
- "divider": { "style": "minimal" }

REQUIREMENTS:
- First block MUST be "chapter_title"
- Include exactly 1 "pro_tip" block per chapter
- Each "text" block: 250-280 words with inline markdown (first text block MUST start with ## Header)
- Use \`### 🔑 Key Takeaway\` subheader INSIDE text blocks instead of separate key_takeaway blocks
- Total blocks: ${targetPagesPerChapter}
- Images ≤30% of blocks
- NEVER use "heading", "list", "quote", or "key_takeaway" blocks!

Return ONLY valid JSON array:
[
  {"block_type": "chapter_title", "content": {"chapter_number": ${chapterNumber}, "title": "${chapterTitle}"}},
  {"block_type": "image_full", "content": {"query": "atmospheric wide shot scene no people", "caption": "Hero image"}},
  {"block_type": "text", "content": {"text": "## Opening Section Header\\n\\nRich content paragraph with 250-280 words...\\n\\n### Subsection\\n\\nMore detailed content...\\n\\n### 🔑 Key Takeaway\\n\\nThe main insight from this section."}},
  {"block_type": "text", "content": {"text": "## Another Section\\n\\nMore content with bullets...\\n\\n* Takeaway 1\\n* Takeaway 2\\n* Takeaway 3"}},
  {"block_type": "pro_tip", "content": {"text": "Expert practical advice"}},
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
