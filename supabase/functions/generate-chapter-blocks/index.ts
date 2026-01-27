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
- NEVER use "heading", "list", "quote", "key_takeaway", or "image_half" blocks! Only: chapter_title, text, image_full, pro_tip.

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
    
    // Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Gemini Raw Output:", text);
      throw new Error("No JSON array found in AI response");
    }
    
    // Robust JSON sanitization with multiple strategies
    function sanitizeJsonString(raw: string): string {
      // Step 1: Remove dangerous control characters but keep whitespace
      let clean = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
      
      // Step 2: Fix common AI escape issues inside string values
      // Match string contents between quotes (handling escaped quotes)
      clean = clean.replace(/"((?:[^"\\]|\\.)*)"/g, (_match: string, content: string) => {
        let fixed = content
          // Fix unescaped newlines/tabs inside strings
          .replace(/(?<!\\)\n/g, '\\n')
          .replace(/(?<!\\)\r/g, '\\r')
          .replace(/(?<!\\)\t/g, '\\t')
          // Fix double-escaped sequences (\\n -> \n is fine, but \\\n is bad)
          .replace(/\\{3,}([nrt"])/g, '\\$1');
        return `"${fixed}"`;
      });
      
      return clean;
    }
    
    function tryParseJson(jsonStr: string): any {
      // Strategy 1: Direct parse after sanitization
      try {
        return JSON.parse(jsonStr);
      } catch (_e1) {
        // Strategy 2: More aggressive cleanup - fix bad escape sequences
        try {
          const aggressive = jsonStr
            // Remove any backslash not followed by valid escape char
            .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
            // Fix truncated unicode escapes
            .replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
          return JSON.parse(aggressive);
        } catch (_e2) {
          // Strategy 3: Extract and rebuild block by block
          try {
            const blockMatches = jsonStr.match(/\{[^{}]*"block_type"[^{}]*\}/g);
            if (blockMatches && blockMatches.length > 0) {
              const blocks = blockMatches.map(block => {
                try {
                  return JSON.parse(block);
                } catch {
                  // Try to extract essential fields manually
                  const typeMatch = block.match(/"block_type"\s*:\s*"([^"]+)"/);
                  const type = typeMatch ? typeMatch[1] : 'text';
                  return { block_type: type, content: { text: 'Content parsing failed' } };
                }
              });
              return blocks;
            }
          } catch (_e3) {
            // All strategies failed
          }
          return null;
        }
      }
    }
    
    const cleanJson = sanitizeJsonString(jsonMatch[0]);
    let blocksData = tryParseJson(cleanJson);
    
    if (!blocksData) {
      console.error("JSON Parse Failed (all strategies):", cleanJson.substring(0, 1000));
      // Return graceful failure instead of 500
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to parse AI response - please retry',
        chapterNumber,
        rawPreview: cleanJson.substring(0, 500)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    // Insert new blocks (force image_half -> image_full)
    const blocksToInsert = blocksData.map((block: any, index: number) => ({
      book_id: bookId,
      chapter_number: chapterNumber,
      page_order: index + 1,
      block_type: block.block_type === 'image_half' ? 'image_full' : block.block_type,
      content: block.content,
      image_url: null
    }));

    const { data: insertedBlocks, error: insertError } = await supabase
      .from('book_pages')
      .insert(blocksToInsert)
      .select('*');

    if (insertError) {
      console.error('Blocks insert error:', insertError);
      throw new Error(`Failed to save blocks: ${insertError.message}`);
    }

    console.log(`[generate-chapter-blocks] Inserted ${blocksToInsert.length} blocks for chapter ${chapterNumber}`);

    return new Response(JSON.stringify({ 
      success: true,
      chapterNumber,
      blocks: insertedBlocks ?? []
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
