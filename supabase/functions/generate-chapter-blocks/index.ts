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

RULE 0: FORCE HEADERS (AGGRESSIVE!)
- Chapter 1 MUST start with \`## Chapter 1\` or a similar descriptive header.
- EVERY SINGLE text block MUST have a \`## Header\` or \`### Subheader\` to break up the wall of text.
- Do NOT write a plain introduction paragraph. Treat Chapter 1 EXACTLY like Chapter 5.
- Chapter 1 is NOT a summary. It must contain full-density text blocks with explicit headers.
- No blocks of just plain text. Headers are MANDATORY.

RULE 1: GOLDILOCKS DENSITY (300-320 Words)
- TARGET: Each "text" block must be **300-320 words**. This is the Goldilocks zone for 6x9 pages—dense enough to fill the page, but short enough to avoid scrolling.
- Target exactly 310 words per text block to perfectly fill the layout without overflow.
- Be substantive. Every paragraph must add value and depth.

RULE 2: MANDATORY INLINE MARKDOWN (No Wall-of-Text!)
- Use Markdown INSIDE text blocks: "## Header", "### Subheader"
- EVERY text block MUST start with a \`## Header\`. No exceptions.
- Use "### Subheader" to break up content within text blocks.
- No plain text paragraphs without headers.

RULE 3: KEY TAKEAWAY (ONE per chapter, Plain Text, No Emoji!)
- Include EXACTLY ONE "Key Takeaway" section per chapter.
- Place it in the SECOND-TO-LAST text block, right before the "pro_tip" block.
- Use a standard subheader: \`### Key Takeaway\` - NO emojis, NO icons. Just plain text.
- Keep it inline in a text block.

RULE 4: BANNED CONTENT TYPES & FORMATTING
- Do NOT use blockquotes (>). They are FORBIDDEN.
- Do NOT use italics or asterisks (*) for emphasis.
- Do NOT use "heading", "list", "quote", or "key_takeaway" block types - STRICTLY FORBIDDEN.

RULE 5: CHAPTER STRUCTURE (Strict Order)
This chapter MUST follow this structure:
  1. Chapter Title Page (ALWAYS first block)
  2. 1-2x Hero Images (image_full blocks)
  3. 5-7x Text Pages (text blocks, 350-400 words each, EACH starts with ## Header)
  4. Second-to-last text block: Contains the ### Key Takeaway section
  5. Pro Tip Page (ALWAYS last block of the chapter)
- BALANCE: Images must NOT exceed 30% of chapter pages.

RULE 6: LITERAL VISUAL QUERIES (Image Queries)
- Image queries must be physical descriptions of objects or places, NOT abstract concepts.
- BAD: "The concept of freedom" → GOOD: "A soaring eagle against a blue sky"
- BAD: "Business success" → GOOD: "A modern glass skyscraper from below"
- BAD: "History forged in sand" → GOOD: "Ancient desert ruins at sunset"
- Do NOT append "no people" manually. Just describe a scene that naturally lacks people (e.g., "Empty desk", "Lonely road", "Abandoned building interior").

TOPIC TYPE: ${isVisualTopic ? 'VISUAL (Travel/Lifestyle/Art) - More hero images' : 'INFORMATIONAL (Business/Science/History) - More text depth'}
TARGET BLOCKS: ${targetPagesPerChapter}
BOOK CONTEXT: ${tableOfContents?.map((c: { title: string }) => c.title).join(', ') || ''}

Block types (ONLY use these four types - NO quote blocks!):
- "chapter_title": { "chapter_number": ${chapterNumber}, "title": "${chapterTitle}" } - ALWAYS first
- "text": { "text": "300-320 words. MUST start with ## Header. Use ### Subheader inside." }
- "image_full": { "query": "Literal visual description of scene (e.g., 'Modern skyscraper reflecting sunset')", "caption": "Evocative caption" }
- "image_half": { "query": "Literal visual description of scene", "caption": "Caption" }
- "pro_tip": { "text": "Expert insider advice - practical tips ONLY" } - ALWAYS last block

FORMATTING BANS:
- Do NOT use asterisks (*) for emphasis or bullet points. Use standard punctuation.
- Do NOT generate "quote" blocks. AI quotes are often inaccurate.
- Do NOT copy example placeholder text. Generate UNIQUE content for every block.
- JSON SAFETY RULE: You MUST escape all double quotes inside string values. Example: write \\"quote\\" instead of "quote". Do NOT use unescaped double quotes inside text fields.

REQUIREMENTS:
- First block MUST be "chapter_title"
- Last block MUST be "pro_tip" (anchored to end)
- Second-to-last text block MUST contain \`### Key Takeaway\` (one per chapter, no emoji)
- EVERY "text" block MUST start with \`## Header\` - No exceptions
- Each "text" block: 300-320 words with inline markdown (target 310 words)
- Total blocks: ${targetPagesPerChapter}
- Images ≤30% of blocks
- NEVER use "heading", "list", "quote", or "key_takeaway" blocks! Only: chapter_title, text, image_full, image_half, pro_tip.

Return ONLY valid JSON array (DO NOT copy these placeholders - write UNIQUE content):
[
  {"block_type": "chapter_title", "content": {"chapter_number": ${chapterNumber}, "title": "${chapterTitle}"}},
  {"block_type": "image_full", "content": {"query": "[unique search query - literal visual description]", "caption": "[unique evocative caption]"}},
  {"block_type": "text", "content": {"text": "## [Unique Descriptive Header]\\n\\n[Write 300-320 words of original content here. Target exactly 310 words.]\\n\\n### [Unique Subheader]\\n\\n[Continue with detailed, original content...]"}},
  {"block_type": "text", "content": {"text": "## [Another Unique Header]\\n\\n[More original content - 300-320 words...]\\n\\n### Key Takeaway\\n\\n[The single most important insight from this chapter in 1-2 sentences.]"}},
  {"block_type": "pro_tip", "content": {"text": "[Unique practical expert advice]"}}
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
    
    // === ROBUST JSON CLEANING ===
    
    // Step 1: Strip Markdown code fences (```json ... ``` or ``` ... ```)
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Step 2: Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[generate-chapter-blocks] No JSON array found. Raw output (first 1000 chars):", text.substring(0, 1000));
      throw new Error("No JSON array found in AI response");
    }
    
    let cleanJson = jsonMatch[0];
    
    // Step 3: Aggressive sanitization
    // 3a: Remove invisible control characters (except standard whitespace)
    cleanJson = cleanJson.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
    
    // 3b: Fix unescaped newlines/tabs INSIDE string values
    // This regex finds content between quotes and escapes internal newlines/tabs
    cleanJson = cleanJson.replace(/"((?:[^"\\]|\\.)*)"/g, (_match: string, content: string) => {
      // Escape literal newlines, carriage returns, and tabs that weren't already escaped
      const escaped = content
        .replace(/(?<!\\)\n/g, '\\n')
        .replace(/(?<!\\)\r/g, '\\r')
        .replace(/(?<!\\)\t/g, '\\t');
      return `"${escaped}"`;
    });
    
    // 3c: Fix common AI mistakes: trailing commas before ] or }
    cleanJson = cleanJson.replace(/,\s*([\]}])/g, '$1');
    
    // Step 4: Parse with fallbacks
    // Common failure mode: model returns an *escaped JSON string* (e.g. [{\"block_type\": ...}])
    // We try multiple decoding strategies before giving up.
    const parseAttempts: Array<{ label: string; value: string }> = [
      { label: 'clean', value: cleanJson },
      // If the model escaped structural quotes, remove escaping (best-effort)
      { label: 'unescape-structural-quotes', value: cleanJson.replace(/\\\\/g, '\\').replace(/\\"/g, '"') },
    ];

    let blocksData: unknown = null;
    let lastError: Error | null = null;

    for (const attempt of parseAttempts) {
      try {
        const parsed = JSON.parse(attempt.value);

        // If parsed is a JSON string containing the array, parse again.
        const maybeDoubleParsed = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;

        blocksData = maybeDoubleParsed;
        lastError = null;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error('Unknown JSON parse error');
        console.error(`[generate-chapter-blocks] JSON parse attempt failed (${attempt.label}):`, lastError.message);
      }
    }

    if (!blocksData) {
      console.error('[generate-chapter-blocks] JSON Parse Failed (all attempts).');
      console.error('[generate-chapter-blocks] Cleaned JSON (first 2000 chars):', cleanJson.substring(0, 2000));
      console.error('[generate-chapter-blocks] Raw AI output (first 2000 chars):', text.substring(0, 2000));
      throw new Error(`Failed to parse blocks: ${lastError?.message || 'Unknown parse error'}`);
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
    const blocksArray = blocksData as any[];
    const blocks = blocksArray.map((block: any, index: number) => ({
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
