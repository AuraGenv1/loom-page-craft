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
    
    // UPDATED PROMPT: Enforcing strict word counts for Title/Subtitle
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

    // 2. Aggressive JSON sanitization to handle control characters in strings
    // First, escape unescaped control characters within string values
    cleanJson = cleanJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, (char: string) => {
      // Allow actual newlines/tabs that are part of JSON structure
      if (char === '\n' || char === '\r' || char === '\t') return char;
      // Convert control chars to their escaped form or remove
      const code = char.charCodeAt(0);
      if (code === 10) return '\\n';  // newline
      if (code === 13) return '\\r';  // carriage return
      if (code === 9) return '\\t';   // tab
      return ''; // Remove other control characters
    });
    
    // 3. Fix common JSON issues: unescaped quotes within strings
    // Replace literal newlines inside JSON string values with \n
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
      console.error("JSON Parse Failed. Cleaned Text:", cleanJson.substring(0, 500));
      throw new Error(`Failed to parse book data: ${(e as Error).message}`);
    }

    // MAP RESPONSE: Use the new "main_title" for displayTitle
    return new Response(JSON.stringify({
      title: aiData.main_title || topicTitleCase,
      tableOfContents: aiData.chapters.map((ch: any) => ({ chapter: ch.chapter_number, title: ch.title })),
      chapter1Content: aiData.chapter_1_content,
      displayTitle: aiData.main_title || topicTitleCase, // Used for Book Cover Title
      subtitle: aiData.subtitle || aiData.title,          // Used for Book Cover Subtitle
      description: `A Comprehensive Guide to ${topicTitleCase}`,
      localResources: [],
      hasDisclaimer: false
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
