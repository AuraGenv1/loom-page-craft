import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Visual topics get more image-heavy layouts
const VISUAL_KEYWORDS = [
  'travel', 'trip', 'vacation', 'destination', 'tour', 'paris', 'rome', 'tokyo',
  'cooking', 'recipe', 'food', 'cuisine', 'baking',
  'photography', 'photo', 'camera',
  'art', 'painting', 'drawing', 'design',
  'architecture', 'building', 'interior',
  'nature', 'wildlife', 'garden', 'landscape',
  'fashion', 'style', 'diy', 'craft'
];

const isVisualTopic = (topic: string): boolean => {
  const lower = topic.toLowerCase();
  return VISUAL_KEYWORDS.some(kw => lower.includes(kw));
};

// Assess topic breadth to allow flexible chapter counts
const assessTopicBreadth = (topic: string): 'narrow' | 'broad' => {
  const words = topic.split(/\s+/).length;
  const hasSpecificLocation = /resort|hotel|village|neighborhood|restaurant|spa|museum|gallery/i.test(topic);
  const isNiche = words <= 4 && hasSpecificLocation;
  return isNiche ? 'narrow' : 'broad';
};

const toTitleCase = (str: string): string => {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

// Voice-to-instruction mapping for Gemini prompts
const VOICE_INSTRUCTIONS: Record<string, string> = {
  insider: 'Write with high taste and authority. Avoid tourist clichés. Use an "IYKYK" (If you know, you know) tone. Focus on hidden gems and insider knowledge.',
  bestie: 'Write in a confident, sassy, female-forward voice. Treat the reader like a close friend. Use punchy, witty language and share genuine excitement.',
  poet: 'Use evocative, sensory-rich language. Focus on atmosphere, emotion, and beauty. Paint vivid word pictures that transport the reader.',
  professor: 'Write with academic authority and educational clarity. Use structured explanations, cite relevant background, and maintain an informative tone.',
};

// Structure-to-instruction mapping for Gemini prompts
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

// Retry helper
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
      topic, 
      sessionId, 
      language = 'en',
      voice = 'insider',
      structure = 'balanced',
      focusAreas = []
    } = await req.json();
    
    if (!topic) {
      return new Response(JSON.stringify({ error: 'Missing topic' }), { 
        status: 400, headers: corsHeaders 
      });
    }

    const cleanTopic = topic.replace(/\b(travel )?guide\b/gi, '').trim();
    const topicTitleCase = toTitleCase(cleanTopic);
    const isVisual = isVisualTopic(cleanTopic);
    
    // Get voice and structure instructions
    const voiceInstruction = VOICE_INSTRUCTIONS[voice] || VOICE_INSTRUCTIONS.insider;
    const structureInstruction = STRUCTURE_INSTRUCTIONS[structure] || STRUCTURE_INSTRUCTIONS.balanced;
    const focusInstruction = focusAreas.length > 0 
      ? `\n=== FOCUS AREAS ===\nEmphasize these topics throughout the book: ${focusAreas.join(', ')}`
      : '';
    
    // Get language name for explicit instruction
    const languageName = LANGUAGE_NAMES[language] || 'English';
    
    // Critical language instruction for non-English content
    const languageInstruction = language !== 'en' 
      ? `
=== CRITICAL: LANGUAGE REQUIREMENT ===
You MUST write ALL content in ${languageName}. This is MANDATORY.
- main_title: Write in ${languageName}
- subtitle: Write in ${languageName}
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
    
    console.log(`[generate-book-blocks] Topic: "${cleanTopic}", Visual: ${isVisual}, Voice: ${voice}, Structure: ${structure}, Language: ${language}`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    // STEP 1: Generate book outline and Chapter 1 blocks using Luxury Architect Rules
    // Flexible chapter counts based on topic breadth to prevent filler content
    const topicBreadth = assessTopicBreadth(cleanTopic);
    const pagesPerChapter = isVisual ? 12 : 10;
    const minChapters = isVisual 
      ? (topicBreadth === 'narrow' ? 8 : 12)  // Narrow topics can have fewer chapters
      : 10;
    const targetTotalPages = topicBreadth === 'narrow' ? 100 : 140;
    
    const prompt = `You are an elite "Luxury Book Architect." Create a structured book outline and Chapter 1 content for: "${cleanTopic}".
${languageInstruction}
=== NARRATIVE VOICE ===
${voiceInstruction}

=== BOOK STRUCTURE ===
${structureInstruction}
${focusInstruction}

=== LUXURY ARCHITECT RULES ===

RULE 0: FORCE HEADERS (AGGRESSIVE!)
- Chapter 1 MUST start with a \`## Header\` (e.g., "## Welcome to ${topicTitleCase}").
- EVERY SINGLE text block MUST contain at least one \`## Header\` or \`### Subheader\`.
- Do NOT write plain text blocks without headers. Headers are MANDATORY.

RULE 1: STRICT PAGE FIT (200-230 Words MAXIMUM)
- CRITICAL: Each "text" block must be **200-230 words MAXIMUM**. This is essential for Amazon KDP 6x9 pages—content MUST fit without overflow.
- Target exactly 215 words per text block. NEVER exceed 230 words.
- Pages that overflow ruin the print layout. Count your words before outputting.
- Be focused and substantive within the word limit.

RULE 2: VISUAL BREATHING ROOM (Luxury Rhythm)
Each chapter MUST follow this rhythm:
  1x Chapter Title Page (ALWAYS first)
  1-2x Full-Page "Hero" Images (image_full blocks)
  4-6x Text Pages (text blocks, 200-230 words each, EACH starts with ## Header)
  1x Pro Tip Page (ALWAYS last block)
- BALANCE: Images must NOT exceed 30% of chapter pages.

RULE 3: NO FACES & HIGH AESTHETIC (Image Queries)
- For ALL image queries, prioritize: "Architecture," "Atmosphere," "Texture," "Macro," "Landscape," "Still Life."
- STRICTLY FORBIDDEN in image queries: human faces, people, portraits, crowds, selfies.
- Do NOT append "no people" manually. Just describe a scene that naturally lacks people.

RULE 4: STRUCTURAL DEPTH (Spine Compliance)
- TARGET: ${targetTotalPages}+ total pages across all chapters.
- If the topic is COMPLEX: Use 12-15 chapters with focused subtopics.
- If the topic is NARROW: Use ${minChapters} chapters but include "Deep Dive" sub-pages.
- CONSTRAINT: NEVER repeat facts, paragraphs, or filler content.

TOPIC TYPE: ${isVisual ? 'VISUAL (Travel/Lifestyle/Art) - More hero images, atmospheric' : 'INFORMATIONAL (Business/Science/History) - More text depth, fewer images'}
TARGET PAGES PER CHAPTER: ${pagesPerChapter}
MINIMUM CHAPTERS: ${minChapters}

Block types available (ONLY use these):
- "chapter_title": { "chapter_number": N, "title": "Chapter Title" } - ALWAYS first
- "text": { "text": "200-230 words MAX. MUST start with ## Header. Use ### Subheader inside." }
- "image_full": { "query": "Literal visual description (e.g., 'Modern skyscraper reflecting sunset')", "caption": "Evocative caption" }
- "key_takeaway": { "text": "The key insight - DO NOT include 'Key Takeaway' in the text" } - SECOND-TO-LAST block
- "pro_tip": { "text": "Expert insider advice - practical tips ONLY" } - ALWAYS last block
- "heading": { "level": 2, "text": "Section heading" }
- "list": { "items": ["item 1", "item 2", "item 3"] }
- "divider": { "style": "minimal" } - Use for visual breaks

IMPORTANT: Use "key_takeaway" as a block type, NOT as a heading. The UI displays the translated label.

Return ONLY valid JSON:
{
  "main_title": "4-word evocative title",
  "subtitle": "8-word compelling subtitle",
  "topic_name": "${topicTitleCase}",
  "total_planned_pages": ${targetTotalPages},
  "chapters": [
    {"chapter_number": 1, "title": "Compelling Chapter Title", "planned_pages": ${pagesPerChapter}},
    {"chapter_number": 2, "title": "..."},
    ... (${minChapters}-15 chapters based on topic complexity)
  ],
  "chapter_1_blocks": [
    {"block_type": "chapter_title", "content": {"chapter_number": 1, "title": "Introduction"}},
    {"block_type": "image_full", "content": {"query": "atmospheric landscape scene", "caption": "Setting the scene"}},
    {"block_type": "text", "content": {"text": "## [Header]\\n\\n[200-230 words MAX of opening content...]"}},
    {"block_type": "text", "content": {"text": "## [Header]\\n\\n[200-230 words MAX of continued content...]"}},
    {"block_type": "image_full", "content": {"query": "architectural detail texture", "caption": "Detail shot"}},
    {"block_type": "text", "content": {"text": "## [Header]\\n\\n[200-230 words MAX of content...]"}},
    {"block_type": "key_takeaway", "content": {"text": "The most important insight from this chapter."}},
    {"block_type": "pro_tip", "content": {"text": "Expert advice"}}
  ]
}

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
    
    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Gemini Raw Output:", text);
      throw new Error("No JSON object found in AI response");
    }
    
    // Sanitize JSON
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

    let aiData;
    try {
      aiData = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON Parse Failed:", cleanJson.substring(0, 500));
      throw new Error(`Failed to parse book data: ${(e as Error).message}`);
    }

    // STEP 2: Save to Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create book record (with empty chapter content for backward compat)
    const bookRecord = {
      topic: cleanTopic,
      title: aiData.main_title || topicTitleCase,
      session_id: sessionId,
      table_of_contents: aiData.chapters.map((ch: any) => ({ 
        chapter: ch.chapter_number, 
        title: ch.title 
      })),
      chapter1_content: '', // No longer using markdown blobs
      local_resources: [],
      has_disclaimer: false
    };

    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert(bookRecord)
      .select()
      .single();

    if (bookError) {
      console.error('Book insert error:', bookError);
      throw new Error(`Failed to create book: ${bookError.message}`);
    }

    console.log(`[generate-book-blocks] Created book: ${book.id}`);

    // Insert page blocks for Chapter 1 (force image_half -> image_full)
    const blocksToInsert = (aiData.chapter_1_blocks || []).map((block: any, index: number) => ({
      book_id: book.id,
      chapter_number: 1,
      page_order: index + 1,
      block_type: block.block_type === 'image_half' ? 'image_full' : block.block_type,
      content: block.content,
      image_url: null
    }));

    let insertedBlocks: any[] = [];
    if (blocksToInsert.length > 0) {
      const { data, error: blocksError } = await supabase
        .from('book_pages')
        .insert(blocksToInsert)
        .select('*');

      if (blocksError) {
        console.error('Blocks insert error:', blocksError);
        // Don't throw - book was created, blocks can be retried
      } else {
        insertedBlocks = data ?? [];
        console.log(`[generate-book-blocks] Inserted ${blocksToInsert.length} blocks for chapter 1`);
      }
    }

    // Return response
    return new Response(JSON.stringify({
      bookId: book.id,
      title: aiData.main_title || topicTitleCase,
      displayTitle: aiData.main_title || topicTitleCase,
      subtitle: aiData.subtitle || `A Comprehensive Guide to ${topicTitleCase}`,
      tableOfContents: aiData.chapters.map((ch: any) => ({ 
        chapter: ch.chapter_number, 
        title: ch.title 
      })),
      chapter1Blocks: insertedBlocks,
      isVisualTopic: isVisual,
      targetPagesPerChapter: pagesPerChapter
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
