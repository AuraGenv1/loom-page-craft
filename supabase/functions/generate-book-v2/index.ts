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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { topic, sessionId, language = 'en' } = await req.json();
    if (!topic) return new Response(JSON.stringify({ error: 'Missing topic' }), { status: 400, headers: corsHeaders });

    const cleanTopic = topic.replace(/\b(travel )?guide\b/gi, '').trim();
    const topicTitleCase = toTitleCase(cleanTopic);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const prompt = `You are an expert book author. Create a complete book outline and write Chapter 1 for: "${cleanTopic}".

TITLE FORMAT (STRICT - 3 LINES):
- Line 1 (Topic Name): "${topicTitleCase}" (Title Case, the location/topic name only)
- Line 2 (Subtitle): A unique, specific subtitle (NOT generic like "Your Complete Guide")
- Line 3 (Description): "A Comprehensive Guide to ${topicTitleCase}"

Return ONLY valid JSON in this exact format:
{
  "title": "The unique subtitle for line 2",
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
  "chapter_1_content": "Full markdown content here"
}

CHAPTER 1 REQUIREMENTS:
- Write approximately 1,500 words of high-quality, engaging content
- Start with ONE image immediately after the opening paragraph: ![descriptive alt text](placeholder)
- MUST include EXACTLY ONE image per chapter (placed after intro paragraph)
- MUST include at least one Pro-Tip using this EXACT format: > **Pro-Tip:** Your tip text here
- Use proper markdown headings (## and ###)
- Include bullet points and lists where appropriate`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, response_mime_type: "application/json" },
      }),
    });

    const geminiData = await response.json();
    let text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 1. Extract ONLY the JSON object (ignore markdown or intro text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Gemini Raw Output:", text);
      throw new Error("No JSON object found in AI response");
    }
    let cleanJson = jsonMatch[0];

    // 2. Sanitize: Remove bad control characters but KEEP formatting
    cleanJson = cleanJson.replace(/[\u0000-\u001F]+/g, (match: string) => {
      if (match === '\n' || match === '\r' || match === '\t') return match;
      return '';
    });

    let aiData;
    try {
      aiData = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON Parse Failed. Cleaned Text:", cleanJson);
      throw new Error(`Failed to parse book data: ${(e as Error).message}`);
    }

    return new Response(JSON.stringify({
      title: aiData.title,
      tableOfContents: aiData.chapters.map((ch: any) => ({ chapter: ch.chapter_number, title: ch.title })),
      chapter1Content: aiData.chapter_1_content,
      displayTitle: aiData.topic_name || topicTitleCase,
      subtitle: aiData.title,
      description: `A Comprehensive Guide to ${topicTitleCase}`,
      localResources: [],
      hasDisclaimer: false
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
