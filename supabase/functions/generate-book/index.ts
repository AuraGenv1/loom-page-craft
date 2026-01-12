import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Words to strip from image search queries
const CONFUSING_WORDS = [
  'guide', 'manual', 'learn', 'how to', 'tutorial', 'course', 'lesson',
  'beginner', 'advanced', 'complete', 'ultimate', 'best', 'pro', 'master',
  'tips', 'tricks', 'secrets', 'bible', 'handbook', 'introduction', 'intro'
];

// Wellness topics that are explicitly ALLOWED
const WELLNESS_ALLOWED = [
  'fasting', 'intermittent fasting', 'diet', 'nutrition', 'weight loss',
  'fitness', 'exercise', 'workout', 'yoga', 'meditation', 'mindfulness',
  'wellness', 'healthy eating', 'keto', 'paleo', 'vegan', 'vegetarian',
  'meal prep', 'calorie', 'protein', 'vitamins', 'supplements'
];

const SAFETY_ERROR = 'This topic does not meet our safety guidelines.';

// Strip confusing words from search query but keep location names
function cleanSearchQuery(query: string): string {
  let cleaned = query.toLowerCase();
  for (const word of CONFUSING_WORDS) {
    cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  // Clean up extra spaces
  return cleaned.replace(/\s+/g, ' ').trim();
}

// Build strict image search query: ${topic} ${chapterTitle} city landmark
function buildImageSearchQuery(topic: string, chapterTitle: string): string {
  const cleanedTopic = cleanSearchQuery(topic);
  const cleanedChapter = cleanSearchQuery(chapterTitle);
  return `${cleanedTopic} ${cleanedChapter} city landmark`.replace(/\s+/g, ' ').trim();
}

// Detect if topic is a skill/general topic (not location-based)
function isSkillBasedTopic(topic: string): boolean {
  const lower = topic.toLowerCase();
  
  // Skills and general topics that should NOT have local resources
  const skillPatterns = [
    /\b(cook|cooking|bak|baking|recipe|cuisine)\b/i,
    /\b(garden|gardening|plant|plants|growing)\b/i,
    /\b(knit|knitting|crochet|sewing|craft|crafts)\b/i,
    /\b(meditation|mindfulness|yoga|fitness|workout|exercise)\b/i,
    /\b(self-help|self help|personal development|motivation)\b/i,
    /\b(programming|coding|software|javascript|python)\b/i,
    /\b(photography|painting|drawing|art|music|guitar|piano)\b/i,
    /\b(writing|author|novel|poetry|blogging)\b/i,
    /\b(finance|investing|stock|crypto|budget)\b/i,
    /\b(parenting|relationship|dating|marriage)\b/i,
    /\b(productivity|time management|organization)\b/i,
    /\b(olive|tree|trees|farming|agriculture)\b/i,
    /\b(repair|fix|restore|build|diy|woodwork)\b/i,
    /\b(learn|learning|study|studying|education)\b/i,
  ];
  
  for (const pattern of skillPatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }
  
  return false;
}

// AI-based intent analysis for safety
async function analyzeTopicIntent(topic: string, geminiApiKey: string): Promise<{ safe: boolean; reason?: string }> {
  const safetyPrompt = `You are a content safety classifier. Analyze the following topic request and determine if it's safe to generate educational content about.

TOPIC: "${topic}"

REFUSE topics that involve:
- Creating weapons, explosives, or dangerous substances
- Violence, harm, or hurting others
- Illegal activities or how to commit crimes
- Self-harm, suicide methods, or eating disorders that promote harm
- Child exploitation or abuse
- Terrorism or extremist content
- Hacking or cyberattacks with malicious intent
- Drug manufacturing or trafficking
- Fraud, counterfeiting, or money laundering

ALLOW topics that are:
- Educational hobbies and skills (cooking, crafts, gardening, etc.)
- Health, fitness, and wellness (including fasting, diets, exercise)
- Business and entrepreneurship
- Arts, music, and creative pursuits
- Technology and programming (non-malicious)
- Home improvement and DIY
- Sports and recreation
- Academic subjects

Respond with ONLY a JSON object:
{"safe": true} if the topic is acceptable
{"safe": false, "reason": "brief explanation"} if the topic should be refused`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: safetyPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return { safe: result.safe === true, reason: result.reason };
          }
        } catch {
          console.error('Failed to parse safety response:', content);
        }
      }
    }
  } catch (error) {
    console.error('Safety analysis error:', error);
  }

  return { safe: true };
}

// BAKE IN IMAGES: Replace [IMAGE: prompt] markers with actual Pexels URLs
async function bakeInPexelsImages(
  content: string,
  topic: string,
  chapterTitle: string,
  pexelsApiKey: string,
  maxImages: number = 3
): Promise<string> {
  const imageMarkerRegex = /\[IMAGE:\s*([^\]]+)\]/gi;
  const matches = [...content.matchAll(imageMarkerRegex)];
  
  if (matches.length === 0) {
    console.log('[BakeImages] No [IMAGE:] markers found');
    return content;
  }
  
  console.log(`[BakeImages] Found ${matches.length} markers, processing up to ${maxImages}`);
  
  let processedContent = content;
  let imagesProcessed = 0;
  
  const FALLBACK_IMAGE = 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=800&h=400';
  
  for (const match of matches) {
    if (imagesProcessed >= maxImages) {
      processedContent = processedContent.replace(match[0], '');
      continue;
    }
    
    const fullMatch = match[0];
    
    try {
      // STRICT IMAGE QUERY: Use topic + chapterTitle + city landmark
      const searchQuery = buildImageSearchQuery(topic, chapterTitle);
      console.log(`[BakeImages] Pexels query: "${searchQuery}"`);
      
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=3&orientation=landscape`;
      
      const pexelsResponse = await fetch(pexelsUrl, {
        headers: { 'Authorization': pexelsApiKey },
      });
      
      if (pexelsResponse.ok) {
        const pexelsData = await pexelsResponse.json();
        const photo = pexelsData.photos?.[0];
        
        if (photo) {
          const imageUrl = photo.src?.landscape || photo.src?.large || photo.src?.original;
          const altText = `${topic} ${chapterTitle}`.slice(0, 80).replace(/[^\w\s]/g, '');
          
          const markdownImage = `![${altText}](${imageUrl})`;
          processedContent = processedContent.replace(fullMatch, markdownImage);
          imagesProcessed++;
          console.log(`[BakeImages] ✓ Image found`);
        } else {
          console.log(`[BakeImages] No results, using fallback`);
          processedContent = processedContent.replace(fullMatch, `![${topic}](${FALLBACK_IMAGE})`);
          imagesProcessed++;
        }
      } else {
        console.log(`[BakeImages] Pexels error ${pexelsResponse.status}, using fallback`);
        processedContent = processedContent.replace(fullMatch, `![${topic}](${FALLBACK_IMAGE})`);
        imagesProcessed++;
      }
    } catch (error) {
      console.error('[BakeImages] Error:', error);
      processedContent = processedContent.replace(fullMatch, `![${topic}](${FALLBACK_IMAGE})`);
      imagesProcessed++;
    }
  }
  
  return processedContent;
}

// JSON parsing helpers
function sanitizeJsonText(input: string): string {
  return input.replace(/\uFEFF/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function extractJsonObjectFromText(text: string): string | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

function extractJsonStringValue(src: string, key: string): string | null {
  const keyIdx = src.indexOf(`"${key}"`);
  if (keyIdx === -1) return null;
  const colonIdx = src.indexOf(':', keyIdx);
  if (colonIdx === -1) return null;

  let i = colonIdx + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '"') return null;
  i++;

  let raw = '';
  let escaped = false;

  for (; i < src.length; i++) {
    const ch = src[i];

    if (escaped) {
      raw += `\\${ch}`;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      try {
        return JSON.parse(`"${raw}"`);
      } catch {
        return raw;
      }
    }

    if (ch === '\n') raw += '\\n';
    else if (ch === '\r') raw += '\\r';
    else if (ch === '\t') raw += '\\t';
    else raw += ch;
  }

  return null;
}

function extractJsonArrayValue(src: string, key: string): unknown[] | null {
  const keyIdx = src.indexOf(`"${key}"`);
  if (keyIdx === -1) return null;
  const colonIdx = src.indexOf(':', keyIdx);
  if (colonIdx === -1) return null;

  let i = colonIdx + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '[') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let j = i; j < src.length; j++) {
    const ch = src[j];

    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }

    if (ch === '"') { inString = true; continue; }
    if (ch === '[') depth++;
    if (ch === ']') depth--;

    if (depth === 0) {
      const slice = src.slice(i, j + 1);
      try {
        return JSON.parse(sanitizeJsonText(slice));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function parseBookDataFromModelText(text: string, topic: string): { bookData: any; warnings: string[] } {
  const warnings: string[] = [];

  const extracted = extractJsonObjectFromText(text);
  if (!extracted) warnings.push('no_brace_delimited_json_found');

  const candidate = sanitizeJsonText(extracted ?? text);

  try {
    const parsed = JSON.parse(candidate);
    return { bookData: parsed, warnings };
  } catch {
    warnings.push('json_parse_failed');
    
    // Partial parse fallback
    const bookData: any = {
      title: extractJsonStringValue(candidate, 'title') ?? `Guide to ${topic}`,
      displayTitle: extractJsonStringValue(candidate, 'displayTitle') ?? topic.split(' ').slice(0, 5).join(' '),
      subtitle: extractJsonStringValue(candidate, 'subtitle') ?? 'A Curated Guide',
      tableOfContents: extractJsonArrayValue(candidate, 'tableOfContents') ?? [],
      chapter1Content: extractJsonStringValue(candidate, 'chapter1Content') ?? '',
      localResources: extractJsonArrayValue(candidate, 'localResources') ?? [],
    };
    
    return { bookData, warnings };
  }
}

// Subtitle translations
const subtitleTranslations: Record<string, { technical: string; academic: string; lifestyle: string }> = {
  en: { technical: 'A Technical Manual', academic: 'An Educational Series', lifestyle: 'A Curated Guide' },
  es: { technical: 'Un Manual Técnico', academic: 'Una Serie Educativa', lifestyle: 'La Guía Esencial' },
  fr: { technical: 'Un Manuel Technique', academic: 'Une Série Éducative', lifestyle: 'Le Guide Essentiel' },
  de: { technical: 'Ein Technisches Handbuch', academic: 'Eine Bildungsreihe', lifestyle: 'Der Wesentliche Leitfaden' },
  it: { technical: 'Un Manuale Tecnico', academic: 'Una Serie Educativa', lifestyle: 'La Guida Essenziale' },
  pt: { technical: 'Um Manual Técnico', academic: 'Uma Série Educacional', lifestyle: 'O Guia Essencial' },
  zh: { technical: '技术手册', academic: '教育系列', lifestyle: '精选指南' },
  ja: { technical: '技術マニュアル', academic: '教育シリーズ', lifestyle: 'エッセンシャルガイド' },
};

// Classify topic type
function classifyTopicType(topicText: string, language: string = 'en'): { type: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC'; subtitle: string } {
  const lower = topicText.toLowerCase();
  const translations = subtitleTranslations[language] || subtitleTranslations.en;
  
  const technicalPatterns = /\b(repair|fix|restore|build|construct|mechanic|engine|plumbing|electrical|wiring|carpentry|woodwork|metalwork|welding|circuit|watch|clock|automotive)\b/i;
  const academicPatterns = /\b(history|theory|philosophy|science|scientific|study|research|analysis|psychology|sociology|economics|politic|literature|academic)\b/i;
  const lifestylePatterns = /\b(travel|trip|vacation|tour|visit|cuisine|cook|recipe|food|restaurant|hotel|wellness|fitness|yoga|meditation|garden|photography|art|craft|hobby)\b/i;
  
  if (technicalPatterns.test(lower)) return { type: 'TECHNICAL', subtitle: translations.technical };
  if (academicPatterns.test(lower)) return { type: 'ACADEMIC', subtitle: translations.academic };
  if (lifestylePatterns.test(lower)) return { type: 'LIFESTYLE', subtitle: translations.lifestyle };
  
  return { type: 'LIFESTYLE', subtitle: translations.lifestyle };
}

// Generate single chapter
async function generateSingleChapter(
  chapterNumber: number,
  chapterTitle: string,
  topic: string,
  topicType: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC',
  geminiApiKey: string
): Promise<string | null> {
  const systemPrompt = `You are an expert author. Write comprehensive, specific content with real data and recommendations.

TOPIC TYPE: ${topicType}

RULES:
- Never say "research online" or "consult a professional" - YOU are the expert
- Provide SPECIFIC names, prices (2026), and recommendations
- Write in first-person plural ("we", "our")
- Minimum 2000 words
- Include 4-5 ## section headers
- Include "Common Mistakes" with ### subheaders and **Solution:** format
- Include "Pro Tips" section
- End with "Key Takeaways"
${topicType === 'LIFESTYLE' ? '- Include ONE [IMAGE: prompt] marker' : '- NO images'}`;

  const userPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for a guide on "${topic}".

Include:
1. Engaging introduction (150+ words)
2. 4-5 major sections with ## headers
3. Step-by-step instructions with specific recommendations
4. 2 real-world examples with actual names and prices
5. "Common Mistakes" section
6. "Pro Tips" section
7. "Key Takeaways" summary
${topicType === 'LIFESTYLE' ? '8. ONE [IMAGE: prompt]' : ''}

MINIMUM 2000 WORDS.`;

  const maxRetries = 5;
  const baseWaitMs = 10000;

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      console.log(`[Chapter ${chapterNumber}] Attempt ${retry + 1}/${maxRetries + 1}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4000,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          console.log(`[Chapter ${chapterNumber}] Generated successfully`);
          return content.replace(/^```(?:markdown|json)?\n?/gi, '').replace(/\n?```$/gi, '').trim();
        }
      }

      if (response.status === 429 && retry < maxRetries) {
        const waitTimeMs = baseWaitMs * Math.pow(2, retry);
        console.log(`[Chapter ${chapterNumber}] Rate limited. Waiting ${waitTimeMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        continue;
      }

      console.error(`[Chapter ${chapterNumber}] Failed: ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError' && retry < maxRetries) {
        console.log(`[Chapter ${chapterNumber}] Timeout, retrying...`);
        await new Promise(resolve => setTimeout(resolve, baseWaitMs * Math.pow(2, retry)));
        continue;
      }
      console.error(`[Chapter ${chapterNumber}] Error:`, error);
    }
  }

  return null;
}

// Atomic chapter generation and save
async function generateAndSaveChapterAtomically(
  chapterNum: number,
  chapterTitle: string,
  topic: string,
  topicType: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC',
  bookId: string,
  geminiApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  pexelsApiKey?: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`[ATOMIC ${chapterNum}] Starting: ${chapterTitle}`);
  
  try {
    let content = await generateSingleChapter(chapterNum, chapterTitle, topic, topicType, geminiApiKey);
    
    if (content) {
      if (pexelsApiKey && topicType === 'LIFESTYLE') {
        console.log(`[ATOMIC ${chapterNum}] Baking images...`);
        content = await bakeInPexelsImages(content, topic, chapterTitle, pexelsApiKey, 1);
      }
      
      const columnName = `chapter${chapterNum}_content`;
      const { error } = await supabase
        .from('books')
        .update({ [columnName]: content })
        .eq('id', bookId);
      
      if (error) {
        console.error(`[ATOMIC ${chapterNum}] Save failed:`, error);
      } else {
        console.log(`[ATOMIC ${chapterNum}] ✓ SAVED - ${content.length} chars`);
      }
    }
  } catch (err) {
    console.error(`[ATOMIC ${chapterNum}] Error:`, err);
  }
}

// Fetch cover image from Pexels
async function fetchCoverImage(topic: string, pexelsApiKey: string): Promise<string[]> {
  const searchQuery = buildImageSearchQuery(topic, 'cover');
  console.log(`[Cover] Pexels query: "${searchQuery}"`);
  
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=portrait`,
      { headers: { 'Authorization': pexelsApiKey } }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.photos?.length > 0) {
        return data.photos.slice(0, 3).map((p: any) => p.src?.large2x || p.src?.large || p.src?.original);
      }
    }
  } catch (error) {
    console.error('[Cover] Pexels error:', error);
  }
  
  return ['https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg'];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, topic, fullBook = false, language = 'en' } = await req.json();

    // Validate inputs
    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing session ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: 'Topic must be at least 3 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (topic.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Topic is too long (max 200 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API keys
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Safety check (skip for wellness topics)
    const lowerTopic = topic.toLowerCase();
    const isWellnessAllowed = WELLNESS_ALLOWED.some(w => lowerTopic.includes(w));
    
    if (!isWellnessAllowed) {
      const safetyResult = await analyzeTopicIntent(topic, GEMINI_API_KEY);
      if (!safetyResult.safe) {
        return new Response(
          JSON.stringify({ error: SAFETY_ERROR }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Classify topic
    const { type: topicType, subtitle: classifiedSubtitle } = classifyTopicType(topic, language);
    console.log(`Topic: "${topic}" -> Type: ${topicType}, Subtitle: "${classifiedSubtitle}"`);
    
    // Check if skill-based (no local resources)
    const isSkillBased = isSkillBasedTopic(topic);
    console.log(`Skill-based topic: ${isSkillBased}`);

    // Language names for prompt
    const languageNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    };
    const targetLanguage = languageNames[language] || 'English';

    // Build prompt
    const systemPrompt = `You are an expert author and travel journalist. Generate a comprehensive guide.

LANGUAGE: Write ENTIRELY in ${targetLanguage}.
TOPIC TYPE: ${topicType}
SUBTITLE: "${classifiedSubtitle}"

CRITICAL RULES:
- Be the expert - provide SPECIFIC names, prices (2026), recommendations
- Never say "research online" or "consult a professional"
- Use first-person plural ("we", "our")
${topicType === 'LIFESTYLE' ? '- Include ONE [IMAGE: prompt] at the start of Chapter 1' : '- NO images'}

LOCAL RESOURCES RULES (CRITICAL):
${isSkillBased ? '- This is a SKILL-BASED topic. Return "localResources": [] (empty array)' : '- Include 3-5 real local businesses with name, type, and rating (1-5 scale)'}

Respond with STRICT JSON:
{
  "title": "Full title with subtitle",
  "displayTitle": "Short title (max 5 words)",
  "subtitle": "${classifiedSubtitle}",
  "tableOfContents": [
    {"chapter": 1, "title": "Chapter Title", "imageSearchQuery": "specific search query"}
  ],
  "chapter1Content": "Full markdown content (800-1000 words)...",
  "localResources": ${isSkillBased ? '[]' : '[{"name": "Business", "type": "Type", "rating": 4.5}]'}
}`;

    const userPrompt = `Create a guide on: "${topic}"

Chapter 1 must include:
1. ${topicType === 'LIFESTYLE' ? 'ONE [IMAGE: prompt] at the top' : 'NO images'}
2. Engaging introduction (150+ words)
3. 4-5 sections with ## headers
4. Real examples with specific names and prices
5. "Common Mistakes" section with **Solution:** format
6. [PRO-TIP: expert advice] callout

Generate 10 chapters in tableOfContents.
${isSkillBased ? 'localResources MUST be empty array []' : 'Include 3-5 real local resources with ratings'}`;

    console.log('Calling Gemini API...');

    // Call Gemini with retry logic
    const maxRetries = 3;
    const baseWaitMs = 5000;
    let response: Response | null = null;

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 16384,
              },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) break;

        if (response.status === 429 && retry < maxRetries) {
          const waitTimeMs = baseWaitMs * Math.pow(2, retry);
          console.log(`Rate limited. Waiting ${waitTimeMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTimeMs));
          continue;
        }

        throw new Error(`Gemini API error: ${response.status}`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError' && retry < maxRetries) {
          console.log('Timeout, retrying...');
          await new Promise(resolve => setTimeout(resolve, baseWaitMs * Math.pow(2, retry)));
          continue;
        }
        throw error;
      }
    }

    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({ error: 'The Loom is busy. Please try again in 30 seconds.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content generated');
    }

    // Parse response
    const { bookData, warnings } = parseBookDataFromModelText(content, topic);
    if (warnings.length) console.log('Parse warnings:', warnings);

    // Normalize fields
    if (!bookData.title) bookData.title = `The Complete Guide to ${topic}`;
    if (!bookData.displayTitle) bookData.displayTitle = topic.split(' ').slice(0, 5).join(' ');
    bookData.subtitle = classifiedSubtitle;

    if (!Array.isArray(bookData.tableOfContents) || bookData.tableOfContents.length === 0) {
      bookData.tableOfContents = Array.from({ length: 10 }, (_, i) => ({
        chapter: i + 1,
        title: `Chapter ${i + 1}`,
        imageSearchQuery: buildImageSearchQuery(topic, `chapter ${i + 1}`),
      }));
    }

    // FORCE empty localResources for skill-based topics
    if (isSkillBased) {
      bookData.localResources = [];
      console.log('Skill-based topic: forcing empty localResources');
    } else if (!Array.isArray(bookData.localResources)) {
      bookData.localResources = [];
    }

    // Clean chapter 1 content
    if (bookData.chapter1Content) {
      bookData.chapter1Content = bookData.chapter1Content
        .replace(/^```(?:markdown|json)?\s*$/gim, '')
        .replace(/```$/gim, '')
        .trim();
    }

    // Bake images for Chapter 1
    if (PEXELS_API_KEY && topicType === 'LIFESTYLE' && bookData.chapter1Content) {
      const ch1Title = bookData.tableOfContents[0]?.title || 'Introduction';
      bookData.chapter1Content = await bakeInPexelsImages(
        bookData.chapter1Content,
        topic,
        ch1Title,
        PEXELS_API_KEY,
        fullBook ? 2 : 1
      );
    }

    // Fetch cover images
    let coverImages: string[] = [];
    if (PEXELS_API_KEY) {
      coverImages = await fetchCoverImage(topic, PEXELS_API_KEY);
    }

    // Prepare response
    const responseData = {
      title: bookData.title,
      displayTitle: bookData.displayTitle,
      subtitle: bookData.subtitle,
      tableOfContents: bookData.tableOfContents,
      chapter1Content: bookData.chapter1Content || '',
      localResources: bookData.localResources,
      coverImageUrl: coverImages,
      hasDisclaimer: false,
      editionYear: new Date().getFullYear(),
    };

    // Save to database
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: bookRecord, error: insertError } = await supabase
        .from('books')
        .insert({
          session_id: sessionId,
          topic: topic,
          title: responseData.title,
          table_of_contents: responseData.tableOfContents,
          chapter1_content: responseData.chapter1Content,
          local_resources: responseData.localResources,
          cover_image_url: responseData.coverImageUrl,
          has_disclaimer: responseData.hasDisclaimer,
          edition_year: responseData.editionYear,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database insert error:', insertError);
      } else {
        console.log('Book saved with ID:', bookRecord?.id);

        // Generate remaining chapters for full book
        if (fullBook && bookRecord?.id && GEMINI_API_KEY) {
          console.log('Starting full book generation...');
          
          const toc = responseData.tableOfContents;
          for (let i = 1; i < Math.min(toc.length, 10); i++) {
            const chapter = toc[i];
            if (chapter?.title) {
              generateAndSaveChapterAtomically(
                i + 1,
                chapter.title,
                topic,
                topicType,
                bookRecord.id,
                GEMINI_API_KEY,
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY,
                PEXELS_API_KEY
              );
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate book error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate book. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
