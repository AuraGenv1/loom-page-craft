import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Convert to Title Case
const toTitleCase = (str: string): string => {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

// Helper: Clean and parse JSON from AI response
const parseAIJson = (text: string): any => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in AI response");
  }
  let cleanJson = jsonMatch[0];

  // Aggressive JSON sanitization
  cleanJson = cleanJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, (char: string) => {
    if (char === '\n' || char === '\r' || char === '\t') return char;
    const code = char.charCodeAt(0);
    if (code === 10) return '\\n';
    if (code === 13) return '\\r';
    if (code === 9) return '\\t';
    return '';
  });
  
  cleanJson = cleanJson.replace(/"([^"]*?)"/g, (_match: string, content: string) => {
    const escaped = content
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  });

  return JSON.parse(cleanJson);
};

// Helper: Call Gemini API
const callGemini = async (prompt: string): Promise<string> => {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, response_mime_type: "application/json" },
    }),
  });

  const geminiData = await response.json();
  return geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode, topic, title, subtitle, sessionId, language = 'en', bookData } = body;

    // === KDP DESCRIPTION MODE ===
    if (mode === 'kdp-description') {
      if (!title) {
        return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: corsHeaders });
      }

      const prompt = `You are a bestselling Amazon book marketing expert. Write a compelling book description for Amazon KDP that will maximize sales.

Book Title: "${title}"
${subtitle ? `Subtitle: "${subtitle}"` : ''}
${topic ? `Topic: "${topic}"` : ''}

REQUIREMENTS:
1. Write 250-400 words of persuasive marketing copy
2. Use HTML formatting that Amazon KDP accepts:
   - <b>bold text</b> for emphasis
   - <i>italic text</i> for quotes or emphasis
   - <br> for line breaks
   - <ul><li>item</li></ul> for bullet lists
3. Structure:
   - Opening hook (1-2 sentences that grab attention)
   - Problem/pain point the reader faces
   - What this book offers (benefits, not features)
   - 3-5 bullet points of key takeaways
   - Closing call-to-action
4. Tone: Professional, enthusiastic, but not salesy
5. Include phrases that trigger buying: "discover", "transform", "secrets", "step-by-step"

Return ONLY valid JSON:
{
  "description": "Your HTML-formatted description here..."
}`;

      const text = await callGemini(prompt);
      const data = parseAIJson(text);
      
      return new Response(JSON.stringify({ 
        description: data.description || '' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === KDP SUBTITLE MODE ===
    if (mode === 'kdp-subtitle') {
      if (!title) {
        return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: corsHeaders });
      }

      const prompt = `You are a bestselling book marketing expert. Generate an intriguing subtitle for this book.

Book Title: "${title}"
${topic ? `Topic: "${topic}"` : ''}

REQUIREMENTS:
1. Maximum 8 words
2. Should complement the title, not repeat it
3. Hint at the value or transformation the reader will get
4. Use power words: secrets, discover, ultimate, essential, complete, master
5. Create curiosity or promise a benefit

Return ONLY valid JSON:
{
  "subtitle": "Your 8-word subtitle here"
}`;

      const text = await callGemini(prompt);
      const data = parseAIJson(text);
      
      return new Response(JSON.stringify({ 
        subtitle: data.subtitle || '' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === KDP KEYWORDS MODE ===
    if (mode === 'kdp-keywords') {
      if (!title) {
        return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: corsHeaders });
      }

      const prompt = `You are an Amazon KDP keyword research expert. Generate 7 unique long-tail keyword phrases for this book.

Book Title: "${title}"
${subtitle ? `Subtitle: "${subtitle}"` : ''}
${topic ? `Topic: "${topic}"` : ''}

CRITICAL CONSTRAINT - THE "NO-REPEAT" RULE:
You are STRICTLY FORBIDDEN from using any major words that already appear in the Book Title: "${title}"

Amazon penalizes repetitive keywords. Extract the main words from the title above and ensure NONE of them appear in your keywords.

Example:
- Title: "The Art of Digital Photography"
- BANNED words: art, digital, photography
- GOOD keyword: "beginner camera techniques"
- BAD keyword: "digital photography tips" (uses banned words)

REQUIREMENTS:
1. Generate exactly 7 keywords
2. Each keyword should be 3-5 words (long-tail phrases)
3. Focus on what readers would actually search for
4. Mix of:
   - Problem-based keywords ("how to...")
   - Topic-specific keywords
   - Benefit-based keywords
   - Audience-specific keywords
5. Avoid single words or very generic phrases
6. No trademark or competitor names
7. NEVER use words from the book title

Return ONLY valid JSON:
{
  "keywords": [
    "keyword phrase 1",
    "keyword phrase 2",
    "keyword phrase 3",
    "keyword phrase 4",
    "keyword phrase 5",
    "keyword phrase 6",
    "keyword phrase 7"
  ]
}`;

      const text = await callGemini(prompt);
      const data = parseAIJson(text);
      
      return new Response(JSON.stringify({ 
        keywords: data.keywords || [] 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === DEFAULT MODE: BOOK GENERATION ===
    if (!topic) {
      return new Response(JSON.stringify({ error: 'Missing topic' }), { status: 400, headers: corsHeaders });
    }

    const cleanTopic = topic.replace(/\b(travel )?guide\b/gi, '').trim();
    const topicTitleCase = toTitleCase(cleanTopic);

    const prompt = `You are an expert book author and publisher. Create a high-concept book outline and write Chapter 1 for the topic: "${cleanTopic}".

    STRICT COVER METADATA RULES:
    1. MAIN TITLE (Max 4 Words): Create a punchy, evocative, or abstract title. 
       - GOOD: "The Silent Ocean", "Digital Horizons", "Velvet & Steel".
       - BAD: "A Complete History of Oceanography".
    2. SUBTITLE (Max 8 Words): An intriguing, specific subtitle that hints at the value.
       - GOOD: "Uncovering the secrets of the deep blue."
       - BAD: "A comprehensive guide to everything about oceans."
    
    Return ONLY valid JSON in this exact format:
    {
      "main_title": "Your punchy 4-word title",
      "subtitle": "Your intriguing 8-word subtitle",
      "topic_name": "${topicTitleCase}",
      "chapters": [
        {"chapter_number": 1, "title": "Introduction"},
        {"chapter_number": 2, "title": "Chapter 2 Title"},
        {"chapter_number": 3, "title": "Chapter 3 Title"},
        {"chapter_number": 4, "title": "Chapter 4 Title"},
        {"chapter_number": 5, "title": "Chapter 5 Title"},
        {"chapter_number": 6, "title": "Chapter 6 Title"},
        {"chapter_number": 7, "title": "Chapter 7 Title"},
        {"chapter_number": 8, "title": "Chapter 8 Title"},
        {"chapter_number": 9, "title": "Chapter 9 Title"},
        {"chapter_number": 10, "title": "Conclusion"}
      ],
      "chapter_1_content": "Full markdown content here..."
    }

    CHAPTER 1 REQUIREMENTS:
    - Write approximately 1,500 words of high-quality, engaging content.
    - Start with ONE image immediately after the opening paragraph: ![descriptive alt text](placeholder)
    - MUST include EXACTLY ONE image per chapter (placed after intro paragraph).
    - MUST include at least one Pro-Tip using this EXACT format: > **Pro-Tip:** Your tip text here
    - Use proper markdown headings (## and ###).
    - Include bullet points and lists where appropriate.
    - Tone: Professional, knowledgeable, yet accessible (Magazine style).`;

    const text = await callGemini(prompt);

    let aiData;
    try {
      aiData = parseAIJson(text);
    } catch (e) {
      console.error("JSON Parse Failed. Raw text:", text.substring(0, 500));
      throw new Error(`Failed to parse book data: ${(e as Error).message}`);
    }

    // MAP RESPONSE: Use the new "main_title" for displayTitle
    return new Response(JSON.stringify({
      title: aiData.main_title || topicTitleCase,
      tableOfContents: aiData.chapters.map((ch: any) => ({ chapter: ch.chapter_number, title: ch.title })),
      chapter1Content: aiData.chapter_1_content,
      displayTitle: aiData.main_title || topicTitleCase,
      subtitle: aiData.subtitle || aiData.title,
      description: `A Comprehensive Guide to ${topicTitleCase}`,
      localResources: [],
      hasDisclaimer: false
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('generate-book-v2 error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
