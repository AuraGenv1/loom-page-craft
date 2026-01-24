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

RULE 0: CHAPTER 1 IS NOT A SUMMARY!
- CRITICAL: Chapter 1 must be a FULL chapter with the SAME depth, headers, and word count as Chapter 2.
- Do NOT write thin introductions. Chapter 1 is substantive content, not a book overview.

RULE 1: EXTREME COMPACITY (6x9 Print Fit - NO SCROLLING!)
- CRITICAL: Each "text" block MUST contain **220-250 words MAXIMUM**. This is a 6x9 inch print book.
- 200 words is the MINIMUM. 250 words is the MAXIMUM. 300+ words causes overflow and scrolling.
- Be CONCISE. Every sentence must earn its place.

RULE 2: MANDATORY INLINE MARKDOWN (No Wall-of-Text!)
- Use Markdown INSIDE text blocks: "## Header", "### Subheader", "* Bullet"
- EVERY text block MUST start with a \`## Header\`. No exceptions.
- The FIRST text block of every chapter MUST start with a \`## Chapter Header\`.
- Use "### Subheader" to break up content within text blocks.

RULE 3: KEY TAKEAWAY (ONE per chapter, Plain Text, No Emoji!)
- Include EXACTLY ONE "Key Takeaway" section per chapter.
- Place it in the SECOND-TO-LAST text block, right before the "pro_tip" block.
- Use a standard subheader: \`### Key Takeaway\` - NO emojis (🔑), NO icons. Just plain text.
- Example: "### Key Takeaway\\n\\nThis is the single most important insight from this chapter."
- Do NOT use "key_takeaway" blocks - they are FORBIDDEN. Keep it inline in a text block.

RULE 4: BANNED CONTENT TYPES & FORMATTING
- Do NOT use blockquotes (>). They are FORBIDDEN.
- Do NOT use italics for summaries.
- Do NOT generate "quote" blocks. AI quotes are often inaccurate. Use "text" blocks ONLY.
- Do NOT use "heading", "list", "quote", or "key_takeaway" blocks - STRICTLY FORBIDDEN.

RULE 5: CHAPTER STRUCTURE (Strict Order)
This chapter MUST follow this structure:
  1. Chapter Title Page (ALWAYS first block)
  2. 1-2x Hero Images (image_full blocks)
  3. 3-5x Text Pages (text blocks, 220-250 words each, EACH starts with ## Header)
  4. Second-to-last text block: Contains the ### Key Takeaway section
  5. Pro Tip Page (ALWAYS last block of the chapter)
- BALANCE: Images must NOT exceed 30% of chapter pages.

RULE 6: NO FACES & VARIED CAMERA ANGLES (Image Queries)
- For ALL image queries, prioritize: "Architecture," "Atmosphere," "Texture," "Macro," "Landscape," "Still Life."
- STRICTLY FORBIDDEN: human faces, people, portraits, crowds, selfies.
- Append to ALL queries: "no people no faces atmospheric"

TOPIC TYPE: ${isVisualTopic ? 'VISUAL (Travel/Lifestyle/Art) - More hero images' : 'INFORMATIONAL (Business/Science/History) - More text depth'}
TARGET BLOCKS: ${targetPagesPerChapter}
BOOK CONTEXT: ${tableOfContents?.map((c: { title: string }) => c.title).join(', ') || ''}

Block types (ONLY use these - heading, list, quote, key_takeaway blocks are STRICTLY FORBIDDEN):
- "chapter_title": { "chapter_number": ${chapterNumber}, "title": "${chapterTitle}" } - ALWAYS first
- "text": { "text": "220-250 words MAX. MUST start with ## Header. Use ### Subheader inside. NO asterisks for emphasis." }
- "image_full": { "query": "search term no people atmospheric", "caption": "Evocative caption" }
- "image_half": { "query": "search term no people atmospheric", "caption": "Caption" }
- "pro_tip": { "text": "Expert insider advice - practical tips ONLY" } - ALWAYS last block
- "divider": { "style": "minimal" }

FORMATTING BANS:
- Do NOT use asterisks (*) for emphasis or bullet points. Use standard punctuation.
- Do NOT generate "quote" blocks. AI quotes are often inaccurate.
- Do NOT copy example placeholder text. Generate UNIQUE content for every block.

REQUIREMENTS:
- First block MUST be "chapter_title"
- Last block MUST be "pro_tip" (anchored to end)
- Second-to-last text block MUST contain \`### Key Takeaway\` (one per chapter, no emoji)
- EVERY "text" block MUST start with \`## Header\` - No exceptions
- Each "text" block: 220-250 words MAX with inline markdown
- Total blocks: ${targetPagesPerChapter}
- Images ≤30% of blocks
- NEVER use "heading", "list", "quote", or "key_takeaway" blocks!

Return ONLY valid JSON array (DO NOT copy these placeholders - write UNIQUE content):
[
  {"block_type": "chapter_title", "content": {"chapter_number": ${chapterNumber}, "title": "${chapterTitle}"}},
  {"block_type": "image_full", "content": {"query": "[unique search query] no people atmospheric", "caption": "[unique evocative caption]"}},
  {"block_type": "text", "content": {"text": "## [Unique Descriptive Header]\\n\\n[Write 220-250 words of original content here. Be specific and substantive.]\\n\\n### [Unique Subheader]\\n\\n[Continue with detailed, original content...]"}},
  {"block_type": "text", "content": {"text": "## [Another Unique Header]\\n\\n[More original content...]\\n\\n### Key Takeaway\\n\\n[The single most important insight from this chapter in 1-2 sentences.]"}},
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
