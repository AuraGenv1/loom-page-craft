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
      targetPagesPerChapter = 10,
      language = 'en',
      voice = 'insider',
      structure = 'balanced',
      focusAreas = []
    } = await req.json();

    if (!bookId || !chapterNumber || !chapterTitle || !topic) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: corsHeaders
      });
    }

    console.log(`[generate-chapter-blocks] Chapter ${chapterNumber}: "${chapterTitle}" for "${topic}" (Voice: ${voice}, Structure: ${structure})`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    // Voice-to-instruction mapping
    const VOICE_INSTRUCTIONS: Record<string, string> = {
      insider: 'Write with high taste and authority. Avoid tourist clichés. Use an "IYKYK" (If you know, you know) tone. Focus on hidden gems and insider knowledge.',
      bestie: 'Write in a confident, sassy, female-forward voice. Treat the reader like a close friend. Use punchy, witty language and share genuine excitement.',
      poet: 'Use evocative, sensory-rich language. Focus on atmosphere, emotion, and beauty. Paint vivid word pictures that transport the reader.',
      professor: 'Write with academic authority and educational clarity. Use structured explanations, cite relevant background, and maintain an informative tone.',
    };

    // Structure-to-instruction mapping
    const STRUCTURE_INSTRUCTIONS: Record<string, string> = {
      curated: 'Structure the content as a curated directory. Prioritize specific venues (Hotels, Restaurants, Shops) with address details, vibe checks, and insider recommendations.',
      playbook: 'Structure the content as an educational manual. Use clear steps, bullet points for "How-to" sections, and focus on practical, actionable instructions.',
      balanced: 'Balance educational content with curated recommendations. Mix teaching moments with specific venue suggestions for a well-rounded guide.',
    };

    // Language name mapping for explicit AI instructions
    const LANGUAGE_NAMES: Record<string, string> = {
      en: 'English',
      es: 'Spanish (Español)',
      fr: 'French (Français)',
      de: 'German (Deutsch)',
      it: 'Italian (Italiano)',
      pt: 'Portuguese (Português)',
      zh: 'Chinese (中文)',
      ja: 'Japanese (日本語)',
    };

    const languageName = LANGUAGE_NAMES[language] || 'English';

    // Critical language instruction for non-English content
    const languageInstruction = language !== 'en' 
      ? `
=== CRITICAL: LANGUAGE REQUIREMENT ===
You MUST write ALL content in ${languageName}. This is MANDATORY.
- All chapter titles: Write in ${languageName}
- All text block content: Write in ${languageName}  
- All image captions: Write in ${languageName}
- All pro_tip content: Write in ${languageName}

The ONLY exceptions are:
- Proper nouns (hotel names, restaurant names, landmark names) - keep in original form
- Technical terms with no good translation

DO NOT default to English. The reader speaks ${languageName}.
`
      : '';

    const voiceInstruction = VOICE_INSTRUCTIONS[voice] || VOICE_INSTRUCTIONS.insider;
    const structureInstruction = STRUCTURE_INSTRUCTIONS[structure] || STRUCTURE_INSTRUCTIONS.balanced;
    const focusInstruction = focusAreas.length > 0 
      ? `\n=== FOCUS AREAS ===\nEmphasize these topics: ${focusAreas.join(', ')}`
      : '';

    const prompt = `You are an elite "Luxury Book Architect." Generate structured page blocks for Chapter ${chapterNumber}: "${chapterTitle}" of the book "${topic}".
${languageInstruction}
=== NARRATIVE VOICE ===
${voiceInstruction}

=== BOOK STRUCTURE ===
${structureInstruction}
${focusInstruction}

=== LUXURY ARCHITECT RULES ===

RULE 0: FORCE HEADERS (AGGRESSIVE!)
- Chapter 1 MUST start with \`## Chapter 1\` or a similar descriptive header.
- EVERY SINGLE text block MUST have a \`## Header\` or \`### Subheader\` to break up the wall of text.
- Do NOT write a plain introduction paragraph. Treat Chapter 1 EXACTLY like Chapter 5.
- Chapter 1 is NOT a summary. It must contain full-density text blocks with explicit headers.
- No blocks of just plain text. Headers are MANDATORY.

RULE 1: STRICT PAGE FIT (200-230 Words MAXIMUM)
- CRITICAL: Each "text" block must be **200-230 words MAXIMUM**. This is essential for Amazon KDP 6x9 pages—content MUST fit without overflow.
- Target exactly 215 words per text block. NEVER exceed 230 words.
- Count your words before outputting. Pages that overflow ruin the print layout.
- Be focused and substantive within the word limit.

RULE 2: MANDATORY INLINE MARKDOWN (No Wall-of-Text!)
- Use Markdown INSIDE text blocks: "## Header", "### Subheader"
- EVERY text block MUST start with a \`## Header\`. No exceptions.
- Use "### Subheader" to break up content within text blocks.
- No plain text paragraphs without headers.

RULE 3: KEY TAKEAWAY (Use key_takeaway BLOCK TYPE - CRITICAL!)
- Include EXACTLY ONE "key_takeaway" block per chapter - NOT a heading, a DEDICATED BLOCK TYPE.
- Place it as the SECOND-TO-LAST block, right before the "pro_tip" block.
- Use: {"block_type": "key_takeaway", "content": {"text": "The actual takeaway text..."}}
- NEVER use "### Key Takeaway" as a text heading. The UI renders the label automatically.
- NEVER include the words "Key Takeaway" in the content text itself.
- The UI will display the translated label (e.g., "POINT CLÉ" in French).

RULE 4: BANNED CONTENT TYPES & FORMATTING
- Do NOT use blockquotes (>). They are FORBIDDEN.
- Do NOT use italics or asterisks (*) for emphasis.
- Do NOT use "heading", "list", "quote" block types - STRICTLY FORBIDDEN.
- "key_takeaway" IS allowed as a block type.

RULE 5: CHAPTER STRUCTURE (Strict Order with Image Spacing)
This chapter MUST follow this structure:
  1. Chapter Title Page (ALWAYS first block)
  2. 1x Hero Image (image_full block)
  3. 2-3x Text Pages (text blocks)
  4. 1x Image (if needed - NEVER consecutive with another image!)
  5. 2-3x Text Pages
  6. key_takeaway block (SECOND-TO-LAST - use the block type, NOT a heading!)
  7. Pro Tip Page (ALWAYS last block of the chapter)
- BALANCE: Images must NOT exceed 30% of chapter pages.
- BALANCE: Images must NOT exceed 30% of chapter pages.
- **CRITICAL IMAGE SPACING RULE**: NEVER place two image blocks consecutively. There MUST be at least ONE text block between ANY two images.

RULE 6: LITERAL VISUAL QUERIES - CAPTION-TO-QUERY MATCHING
- CRITICAL: The image query MUST describe EXACTLY what the caption says. If the caption mentions "Hotel Jerome", the query MUST be "Hotel Jerome Aspen Colorado exterior" - not a generic "luxury hotel".
- NEVER use a generic building/scene when the caption references a specific named place, hotel, restaurant, or landmark.
- ALWAYS include the book's primary location (city/region) at the START of the query.
- For a caption "Hotel Jerome, a landmark of luxury", use query: "Hotel Jerome Aspen Colorado historic hotel exterior"
- For a caption "The Shard towers over the Thames", use query: "The Shard London skyscraper Thames river view"
- For a caption "Maroon Bells at sunrise", use query: "Maroon Bells Aspen Colorado mountain lake reflection sunrise"
- Image queries must be specific physical descriptions that will return the EXACT subject mentioned in the caption.
- BAD: Generic caption "Luxury accommodations" with query "hotel lobby" → GOOD: Specific caption "The Little Nell hotel lobby" with query "The Little Nell Aspen Colorado hotel lobby interior"
- Do NOT write vague queries like "mountain scenery" or "fine dining restaurant" - ALWAYS include the specific name from the caption.

RULE 7: NO BACK-TO-BACK IMAGES (MANDATORY LAYOUT RULE)
- **ABSOLUTE RULE**: After any "image_full" block, the NEXT block MUST be a "text" block.
- **NEVER** generate two consecutive "image_full" blocks.
- If you want 2 images in a chapter, they MUST be separated by at least 1 text block.
- This creates professional pacing and prevents visual overload.

TOPIC TYPE: ${isVisualTopic ? 'VISUAL (Travel/Lifestyle/Art) - More hero images' : 'INFORMATIONAL (Business/Science/History) - More text depth'}
TARGET BLOCKS: ${targetPagesPerChapter}
BOOK CONTEXT: ${tableOfContents?.map((c: { title: string }) => c.title).join(', ') || ''}

Block types (ONLY use these five types):
- "chapter_title": { "chapter_number": ${chapterNumber}, "title": "${chapterTitle}" } - ALWAYS first
- "text": { "text": "200-230 words MAX. MUST start with ## Header. Use ### Subheader inside." }
- "image_full": { "query": "Literal visual description of scene (e.g., 'Modern skyscraper reflecting sunset')", "caption": "Evocative caption" }
- "key_takeaway": { "text": "The key insight from this chapter - DO NOT include 'Key Takeaway' in the text" } - SECOND-TO-LAST block
- "pro_tip": { "text": "Expert insider advice - practical tips ONLY" } - ALWAYS last block

FORMATTING BANS:
- Do NOT use asterisks (*) for emphasis or bullet points. Use standard punctuation.
- Do NOT generate "quote" blocks. AI quotes are often inaccurate.
- Do NOT copy example placeholder text. Generate UNIQUE content for every block.
- JSON SAFETY RULE: You MUST escape all double quotes inside string values. Example: write \\"quote\\" instead of "quote". Do NOT use unescaped double quotes inside text fields.

REQUIREMENTS:
- First block MUST be "chapter_title"
- Last block MUST be "pro_tip" (anchored to end)
- Second-to-last block MUST be "key_takeaway" (use the block type, NOT a heading!)
- NEVER include "Key Takeaway" as text content - the UI displays the translated label
- EVERY "text" block MUST start with \`## Header\` - No exceptions
- Each "text" block: 200-230 words MAX with inline markdown (target 215 words, NEVER over 230)
- Total blocks: ${targetPagesPerChapter}
- Images ≤30% of blocks
- **NO CONSECUTIVE IMAGES** - Always separate images with at least one text block
- NEVER use "heading", "list", "quote", or "image_half" blocks! Only: chapter_title, text, image_full, key_takeaway, pro_tip.

Return ONLY valid JSON array (DO NOT copy these placeholders - write UNIQUE content):
[
  {"block_type": "chapter_title", "content": {"chapter_number": ${chapterNumber}, "title": "${chapterTitle}"}},
  {"block_type": "image_full", "content": {"query": "[unique search query - literal visual description]", "caption": "[unique evocative caption]"}},
  {"block_type": "text", "content": {"text": "## [Unique Descriptive Header]\\n\\n[Write 200-230 words MAX. Count your words! Keep it tight and focused.]\\n\\n### [Unique Subheader]\\n\\n[Continue with focused content...]"}},
  {"block_type": "text", "content": {"text": "## [Another Unique Header]\\n\\n[More original content - 200-230 words MAX. Never exceed 230 words.]"}},
  {"block_type": "key_takeaway", "content": {"text": "[The single most important insight from this chapter in 1-2 sentences. DO NOT include 'Key Takeaway' in this text.]"}},
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
          generationConfig: { 
            temperature: 0.7, 
            response_mime_type: "application/json",
            maxOutputTokens: 8192, // Prevent truncation on longer chapters
          },
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

    // Strengthen caption-to-query correlation for named places.
    // If the caption contains a proper noun like "Hotel Jerome" but the query
    // doesn't, prepend it so the image fetcher searches the literal subject.
    const enforceCaptionEntitiesInQueries = (blocks: any[]) => {
      const multiWordEntityRegex = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
      return blocks.map((block) => {
        if (block?.block_type !== 'image_full') return block;
        const content = block?.content ?? {};
        const caption = typeof content.caption === 'string' ? content.caption : '';
        const query = typeof content.query === 'string' ? content.query : '';
        if (!caption || !query) return block;

        const entities = (caption.match(multiWordEntityRegex) || [])
          .map((e: string) => e.trim())
          // avoid very short / generic phrases
          .filter((e: string) => e.length >= 6)
          .slice(0, 2);

        if (entities.length === 0) return block;

        let nextQuery = query;
        for (const ent of entities) {
          if (!nextQuery.toLowerCase().includes(ent.toLowerCase())) {
            nextQuery = `${ent} ${nextQuery}`;
          }
        }

        if (nextQuery === query) return block;
        return { ...block, content: { ...content, query: nextQuery } };
      });
    };

    blocksData = enforceCaptionEntitiesInQueries(blocksData);

    // ==== BUSINESS RULE 4: NO BACK-TO-BACK IMAGES ====
    // Post-process to ensure no consecutive image blocks (safety net)
    const enforceImageSpacing = (blocks: any[]) => {
      const result: any[] = [];
      let lastWasImage = false;
      
      for (const block of blocks) {
        const isImage = block?.block_type === 'image_full' || block?.block_type === 'image_half';
        
        if (isImage && lastWasImage) {
          // Skip this consecutive image - we'll keep the first one
          console.log('[ImageSpacing] Removing consecutive image block to enforce spacing rule');
          continue;
        }
        
        result.push(block);
        lastWasImage = isImage;
      }
      
      return result;
    };

    blocksData = enforceImageSpacing(blocksData);

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
