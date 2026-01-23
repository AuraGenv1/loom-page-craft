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

const toTitleCase = (str: string): string => {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
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
    const { topic, sessionId, language = 'en' } = await req.json();
    if (!topic) {
      return new Response(JSON.stringify({ error: 'Missing topic' }), { 
        status: 400, headers: corsHeaders 
      });
    }

    const cleanTopic = topic.replace(/\b(travel )?guide\b/gi, '').trim();
    const topicTitleCase = toTitleCase(cleanTopic);
    const isVisual = isVisualTopic(cleanTopic);
    
    console.log(`[generate-book-blocks] Topic: "${cleanTopic}", Visual: ${isVisual}`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    // STEP 1: Generate book outline and Chapter 1 blocks
    const pagesPerChapter = isVisual ? 12 : 6;
    
    const prompt = `You are an expert book architect. Create a structured book outline and Chapter 1 content for: "${cleanTopic}".

TOPIC TYPE: ${isVisual ? 'VISUAL (Travel/Cooking/Art)' : 'INFORMATIONAL (Business/Science/History)'}
TARGET PAGES PER CHAPTER: ${pagesPerChapter}

STRICT RULES:
1. MAIN TITLE (Max 4 Words): Punchy, evocative title.
2. SUBTITLE (Max 8 Words): Intriguing subtitle.
3. CHAPTERS: Exactly 10 chapters with compelling titles.

CHAPTER 1 BLOCKS:
Generate an array of "page blocks" for Chapter 1. Each block = 1 physical page in the printed book.

Block types:
- "chapter_title": { "title": "Chapter Title" }
- "text": { "text": "~250 words of content" } 
- "image_full": { "query": "search term for image", "caption": "Photo caption" }
- "image_half": { "query": "search term", "caption": "Caption" } (paired with short text)
- "pro_tip": { "text": "Expert advice" }
- "heading": { "level": 2, "text": "Section heading" }
- "list": { "items": ["item 1", "item 2", "item 3"] }

${isVisual ? 
  'For VISUAL topics: Include 3-4 image_full blocks and 2-3 image_half blocks per chapter.' : 
  'For INFORMATIONAL topics: Include 1-2 image_half blocks max. Focus on text and lists.'}

Return ONLY valid JSON:
{
  "main_title": "4-word title",
  "subtitle": "8-word subtitle",
  "topic_name": "${topicTitleCase}",
  "chapters": [
    {"chapter_number": 1, "title": "Introduction"},
    {"chapter_number": 2, "title": "..."},
    ... (10 total)
  ],
  "chapter_1_blocks": [
    {"block_type": "chapter_title", "content": {"chapter_number": 1, "title": "Introduction"}},
    {"block_type": "text", "content": {"text": "Opening paragraph..."}},
    {"block_type": "image_full", "content": {"query": "beautiful landscape", "caption": "The view"}},
    {"block_type": "text", "content": {"text": "More content..."}},
    {"block_type": "pro_tip", "content": {"text": "Expert advice here"}},
    ... (${pagesPerChapter} blocks total)
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

    // Insert page blocks for Chapter 1
    const blocks = (aiData.chapter_1_blocks || []).map((block: any, index: number) => ({
      book_id: book.id,
      chapter_number: 1,
      page_order: index + 1,
      block_type: block.block_type,
      content: block.content,
      image_url: null
    }));

    if (blocks.length > 0) {
      const { error: blocksError } = await supabase
        .from('book_pages')
        .insert(blocks);

      if (blocksError) {
        console.error('Blocks insert error:', blocksError);
        // Don't throw - book was created, blocks can be retried
      } else {
        console.log(`[generate-book-blocks] Inserted ${blocks.length} blocks for chapter 1`);
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
      chapter1Blocks: blocks,
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
