import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HIGH_RISK_KEYWORDS = [
  'medical', 'health', 'doctor', 'medicine', 'treatment', 'diagnosis', 'symptom',
  'legal', 'law', 'attorney', 'lawyer', 'court', 'lawsuit', 'contract', 'sue'
];

// Wellness topics that are explicitly ALLOWED
const WELLNESS_ALLOWED = [
  'fasting', 'intermittent fasting', 'diet', 'nutrition', 'weight loss',
  'fitness', 'exercise', 'workout', 'yoga', 'meditation', 'mindfulness',
  'wellness', 'healthy eating', 'keto', 'paleo', 'vegan', 'vegetarian',
  'meal prep', 'calorie', 'protein', 'vitamins', 'supplements'
];

const SAFETY_ERROR = 'This topic does not meet our safety guidelines.';

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: safetyPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
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
          const result = JSON.parse(content);
          return { safe: result.safe === true, reason: result.reason };
        } catch {
          console.error('Failed to parse safety response:', content);
        }
      }
    }
  } catch (error) {
    console.error('Safety analysis error:', error);
  }

  // Default to allowing if safety check fails (better UX, still have keyword fallback)
  return { safe: true };
}

// Fetch local resources using Google Places API (New) with fallback to Legacy
async function fetchLocalResources(topic: string, apiKey: string): Promise<Array<{ name: string; type: string; description: string }>> {
  const searchQuery = `${topic} supplies store`;
  
  // Try Places API (New) first - more cost effective
  try {
    console.log('Attempting Places API (New) text search...');
    const newApiResponse = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.formattedAddress,places.rating',
        },
        body: JSON.stringify({
          textQuery: searchQuery,
          maxResultCount: 3,
        }),
      }
    );

    if (newApiResponse.ok) {
      const data = await newApiResponse.json();
      if (data.places && data.places.length > 0) {
        console.log(`Places API (New) returned ${data.places.length} results`);
        return data.places.slice(0, 3).map((place: {
          displayName?: { text?: string };
          primaryType?: string;
          formattedAddress?: string;
          rating?: number;
        }) => ({
          name: place.displayName?.text || 'Local Business',
          type: place.primaryType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Retail Store',
          description: place.formattedAddress || 'Local provider for your project needs.',
        }));
      }
      console.log('Places API (New) returned no results, falling back to legacy...');
    } else {
      const errorText = await newApiResponse.text();
      console.log('Places API (New) failed:', newApiResponse.status, errorText, '- falling back to legacy...');
    }
  } catch (error) {
    console.error('Places API (New) error:', error, '- falling back to legacy...');
  }

  // Fallback to Legacy Places API
  try {
    console.log('Attempting Legacy Places API text search...');
    const legacyResponse = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`
    );

    if (legacyResponse.ok) {
      const data = await legacyResponse.json();
      if (data.results && data.results.length > 0) {
        console.log(`Legacy Places API returned ${data.results.length} results`);
        return data.results.slice(0, 3).map((place: {
          name?: string;
          types?: string[];
          formatted_address?: string;
        }) => ({
          name: place.name || 'Local Business',
          type: place.types?.[0]?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Retail Store',
          description: place.formatted_address || 'Local provider for your project needs.',
        }));
      }
      console.log('Legacy Places API returned no results');
    } else {
      const errorText = await legacyResponse.text();
      console.error('Legacy Places API failed:', legacyResponse.status, errorText);
    }
  } catch (error) {
    console.error('Legacy Places API error:', error);
  }

  // Return empty array if both APIs fail - AI-generated fallback will be used
  console.log('Both Places APIs returned no results, using AI-generated resources');
  return [];
}

// ---- Robust JSON extraction/parsing helpers (Deno-safe) ----
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sanitizeJsonText(input: string): string {
  return input.replace(/\uFEFF/g, '').replace(CONTROL_CHARS_REGEX, '');
}

function extractJsonObjectFromText(text: string): string | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

function sliceBalanced(
  src: string,
  startIdx: number,
  openChar: string,
  closeChar: string
): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;

    if (depth === 0) {
      return src.slice(startIdx, i + 1);
    }
  }

  return null;
}

function extractJsonStringValue(src: string, key: string): string | null {
  const keyIdx = src.indexOf(`"${key}"`);
  if (keyIdx === -1) return null;
  const colonIdx = src.indexOf(':', keyIdx);
  if (colonIdx === -1) return null;

  let i = colonIdx + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '"') return null;
  i++; // after opening quote

  let raw = '';
  let escaped = false;

  for (; i < src.length; i++) {
    const ch = src[i];

    if (escaped) {
      // preserve escape sequences as-is
      raw += `\\${ch}`;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      // end of string
      try {
        return JSON.parse(`"${raw}"`);
      } catch {
        return raw;
      }
    }

    // Fix unescaped newlines inside strings
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

  const slice = sliceBalanced(src, i, '[', ']');
  if (!slice) return null;

  try {
    return JSON.parse(sanitizeJsonText(slice));
  } catch {
    return null;
  }
}

function partialParseBookData(src: string, topic: string): { bookData: any; warnings: string[] } {
  const warnings: string[] = ['partial_parse_used'];

  const title = extractJsonStringValue(src, 'title');
  const displayTitle = extractJsonStringValue(src, 'displayTitle');
  const subtitle = extractJsonStringValue(src, 'subtitle');

  const tableOfContents = extractJsonArrayValue(src, 'tableOfContents');

  const bookData: any = {
    title: title ?? `Guide to ${topic}`,
    displayTitle: displayTitle ?? (title ? title.split(' ').slice(0, 5).join(' ') : `Guide to ${topic}`.split(' ').slice(0, 5).join(' ')),
    subtitle: subtitle ?? `A Comprehensive Guide to ${topic}`,
    tableOfContents: Array.isArray(tableOfContents) ? tableOfContents : Array.from({ length: 10 }, (_, i) => ({
      chapter: i + 1,
      title: `Chapter ${i + 1}`,
      imageDescription: `A minimalist diagram illustrating core concepts of ${topic}.`,
    })),
    chapter1Content: extractJsonStringValue(src, 'chapter1Content') ?? '',
    localResources: extractJsonArrayValue(src, 'localResources') ?? [],
  };

  // Recover as many chapters as we can (if present)
  for (let n = 2; n <= 12; n++) {
    const key = `chapter${n}Content`;
    const val = extractJsonStringValue(src, key);
    if (val) bookData[key] = val;
  }

  // If chapter1 still missing, fall back to a trimmed version of the raw AI output
  if (!bookData.chapter1Content) {
    warnings.push('chapter1_fallback_from_raw');
    bookData.chapter1Content = `## Draft Output\n\n${src.slice(0, 12000)}`;
  }

  return { bookData, warnings };
}

function parseBookDataFromModelText(text: string, topic: string): { bookData: any; warnings: string[] } {
  const warnings: string[] = [];

  const extracted = extractJsonObjectFromText(text);
  if (!extracted) warnings.push('no_brace_delimited_json_found');

  const candidate = sanitizeJsonText(extracted ?? text);

  try {
    const parsed = JSON.parse(candidate);
    return { bookData: parsed, warnings };
  } catch (e) {
    warnings.push('json_parse_failed');
    console.error('JSON.parse failed:', e);
    return partialParseBookData(candidate, topic);
  }
}

// Helper to generate a single chapter with retry logic
async function generateChapterContent(
  chapterNumber: number,
  chapterTitle: string,
  topic: string,
  geminiApiKey: string,
  imageDescription?: string
): Promise<string | null> {
  const minWordsPerChapter = 2000;
  
  // MANDATORY VISUAL requirement in prompt (unified marker system)
  const visualInstruction = imageDescription 
    ? `\n\nMANDATORY VISUAL: You are REQUIRED to include one visual marker in every chapter using the syntax: [VISUAL: ${imageDescription}] - This universal marker works for maps, diagrams, illustrations, or any visual aid.`
    : `\n\nMANDATORY VISUAL: You are REQUIRED to include one visual marker in every chapter using the syntax: [VISUAL: descriptive prompt]. This universal marker works for maps, diagrams, illustrations, or any visual aid.`;
  
const systemPrompt = `You are a prolific author at Loom & Page. Write comprehensive, textbook-quality chapter content.

CRITICAL RULES:
- Never say "Sure", "Here is", or any conversational filler
- Output ONLY the markdown content for this chapter
- Write in first-person plural ("we", "our") with an academic yet accessible tone
- Minimum ${minWordsPerChapter} words of substantive instructional content
- Include 4-5 section headers using ## markdown syntax
- Include at least 2 detailed case studies or examples
- Include numbered step-by-step instructions where applicable
- Include a "Common Mistakes" section
- Include a "Pro Tips" section
- End with "Key Takeaways" summary
- MANDATORY: You are REQUIRED to include exactly ONE visual placeholder using [VISUAL: description] format - this is non-negotiable
- CRITICAL FORMATTING: DO NOT use double asterisks (**) for emphasis at the end of sentences or paragraphs. Use plain text only. NEVER end a line with asterisks.${visualInstruction}`;

  const userPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for a comprehensive guide on "${topic}".

REQUIRED ELEMENTS (ALL MANDATORY):
1. Engaging introduction (150+ words)
2. At least 4-5 major sections with ## headers
3. Detailed step-by-step instructions
4. 2 real-world case studies or examples (300+ words each)
5. "Common Mistakes" section with problems and solutions
6. "Pro Tips" section with advanced techniques
7. "Key Takeaways" summary
8. MANDATORY: Include exactly ONE [VISUAL: description] marker - this universal marker works for maps, diagrams, illustrations, etc.

MINIMUM ${minWordsPerChapter} WORDS. Write the full chapter content in markdown format.`;

  // More aggressive retry with longer waits for rate limits
  const maxRetries = 5;
  const baseWaitMs = 10000; // Start with 10 seconds

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      console.log(`[Chapter ${chapterNumber}] Attempt ${retry + 1}/${maxRetries + 1}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 4000, // Optimized for speed while maintaining depth
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
          // Clean up any code blocks wrapping
          return content.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
        }
      }

      if (response.status === 429 && retry < maxRetries) {
        // Exponential backoff: 10s, 20s, 40s, 80s, 160s
        const waitTimeMs = baseWaitMs * Math.pow(2, retry);
        console.log(`[Chapter ${chapterNumber}] Rate limited (429). Waiting ${waitTimeMs / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        continue;
      }

      const errorText = await response.text().catch(() => 'unknown');
      console.error(`[Chapter ${chapterNumber}] Generation failed: ${response.status} - ${errorText}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`[Chapter ${chapterNumber}] Timeout on attempt ${retry + 1}`);
        if (retry < maxRetries) {
          const waitTimeMs = baseWaitMs * Math.pow(2, retry);
          console.log(`[Chapter ${chapterNumber}] Waiting ${waitTimeMs / 1000}s after timeout...`);
          await new Promise(resolve => setTimeout(resolve, waitTimeMs));
          continue;
        }
      }
      console.error(`[Chapter ${chapterNumber}] Error:`, error);
    }
  }

  console.error(`[Chapter ${chapterNumber}] Failed after all ${maxRetries + 1} attempts`);
  return null;
}

// Background task to generate chapters in 4 BURSTS ("Pair-Breeze" staggered parallelism)
// Bursts: [2,3] -> [4,5] -> [6,7] -> [8,9,10] with 5s delays between bursts
// This reduces initial network load and prevents Chapter 3 from hanging
async function generateChaptersInBackground(
  bookId: string,
  topic: string,
  tableOfContents: Array<{ chapter: number; title: string; imageDescription?: string }>,
  geminiApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`[Background] PAIR-BREEZE MODE: Launching chapters in 4 bursts for book ${bookId}`);
  
  // Define 4 bursts: [2,3], [4,5], [6,7], [8,9,10] - pairs reduce network load
  const chapterBursts = [
    [2, 3],
    [4, 5],
    [6, 7],
    [8, 9, 10],
  ];
  
  // Helper to generate and save a single chapter
  const generateAndSaveChapter = async (chapterNum: number) => {
    const tocEntry = tableOfContents.find(ch => ch.chapter === chapterNum);
    const chapterTitle = tocEntry?.title || `Chapter ${chapterNum}`;
    const imageDesc = tocEntry?.imageDescription || '';
    
    console.log(`[Background] Starting chapter ${chapterNum}: ${chapterTitle}`);
    
    const content = await generateChapterContent(chapterNum, chapterTitle, topic, geminiApiKey, imageDesc);
    
    if (content) {
      const columnName = `chapter${chapterNum}_content`;
      const { error } = await supabase
        .from('books')
        .update({ [columnName]: content })
        .eq('id', bookId);
      
      if (error) {
        console.error(`[Background] Failed to save chapter ${chapterNum}:`, error);
      } else {
        console.log(`[Background] Chapter ${chapterNum} saved successfully (${content.length} chars)`);
      }
    } else {
      console.error(`[Background] Failed to generate chapter ${chapterNum} after all retries`);
    }
  };
  
  // Process bursts sequentially, but chapters within each burst run in parallel
  for (let i = 0; i < chapterBursts.length; i++) {
    const burst = chapterBursts[i];
    console.log(`[Background] Launching burst ${i + 1}/${chapterBursts.length}: chapters [${burst.join(', ')}]`);
    
    // Run chapters in this burst in parallel
    await Promise.all(burst.map(chapterNum => generateAndSaveChapter(chapterNum)));
    
    // Wait 5 seconds before starting the next burst (except after the last burst)
    if (i < chapterBursts.length - 1) {
      console.log(`[Background] Burst complete. Waiting 5s before next burst...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`[Background] Completed all chapters for book ${bookId}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, sessionId, fullBook = false, bookId: existingBookId } = await req.json();
    
    // Validate session_id to prevent bot abuse
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
      console.error('Invalid or missing session_id:', sessionId);
      return new Response(
        JSON.stringify({ error: 'Valid session required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!topic || typeof topic !== 'string') {
      console.error('Invalid topic provided:', topic);
      return new Response(
        JSON.stringify({ error: 'Topic is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Limit topic length to prevent cost abuse via excessive API token usage
    const MAX_TOPIC_LENGTH = 200;
    if (topic.length > MAX_TOPIC_LENGTH) {
      console.error('Topic too long:', topic.length, 'chars');
      return new Response(
        JSON.stringify({ error: `Topic must be ${MAX_TOPIC_LENGTH} characters or less` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating book for topic:', topic, 'fullBook:', fullBook);

    const lowerTopic = topic.toLowerCase();
    
    // Check if topic is explicitly allowed (wellness/nutrition/fitness)
    const isWellnessAllowed = WELLNESS_ALLOWED.some(keyword => lowerTopic.includes(keyword));

    // INTENT-BASED SAFETY: AI analyzes the topic intent
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not configured');
      throw new Error('AI service is not configured');
    }

    // Skip AI safety check for explicitly allowed wellness topics
    if (!isWellnessAllowed) {
      console.log('Running AI intent-based safety analysis...');
      const safetyResult = await analyzeTopicIntent(topic, GEMINI_API_KEY);
      
      if (!safetyResult.safe) {
        console.log('AI Safety REFUSED topic:', topic, 'Reason:', safetyResult.reason);
        return new Response(
          JSON.stringify({ error: SAFETY_ERROR }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('AI Safety APPROVED topic:', topic);
    } else {
      console.log('Wellness topic auto-approved:', topic);
    }

    const FAL_KEY = Deno.env.get('FAL_KEY');
    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Determine if topic is automotive/luxury for photography style
    const isAutomotiveTopic = /\b(car|cars|vehicle|vehicles|automotive|ferrari|lamborghini|porsche|maserati|bugatti|mercedes|bmw|audi|luxury|supercar|hypercar|sports car|muscle car|classic car)\b/i.test(topic);
    console.log('Automotive/luxury topic detected:', isAutomotiveTopic);

    // Check if topic is high-risk (but allowed)
    const isHighRisk = HIGH_RISK_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
    console.log('High-risk topic detected:', isHighRisk);

    // SHELL-FIRST: Generate only TOC and Chapter 1, then return immediately
    const minWordsPerChapter = 1800;

// INTENT ROUTER: Classify the topic type dynamically
const classifyTopicType = (topicText: string): { type: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC'; subtitle: string } => {
  const lower = topicText.toLowerCase();
  
  // TECHNICAL: repair, building, engineering, mechanics, craftsmanship
  const technicalPatterns = /\b(repair|fix|restore|build|construct|assemble|mechanic|engine|plumbing|electrical|wiring|carpentry|woodwork|metalwork|welding|solder|circuit|watch|clock|automotive|transmission|calibrat|tool|machine)\b/i;
  
  // ACADEMIC: history, science, theory, study, analysis
  const academicPatterns = /\b(history|histor|theory|theor|philosophy|science|scientific|study|research|analysis|psychology|sociology|economics|politic|literature|academic|education|learning|university|course)\b/i;
  
  // LIFESTYLE: travel, cooking, wellness, hobbies, lifestyle
  const lifestylePatterns = /\b(travel|trip|vacation|tour|visit|cuisine|cook|bak|recipe|food|restaurant|hotel|flight|wellness|fitness|yoga|meditation|garden|photography|art|paint|craft|hobby|fashion|style|decor|home)\b/i;
  
  if (technicalPatterns.test(lower)) {
    return { type: 'TECHNICAL', subtitle: 'A Technical Manual' };
  }
  if (academicPatterns.test(lower)) {
    return { type: 'ACADEMIC', subtitle: 'An Educational Series' };
  }
  if (lifestylePatterns.test(lower)) {
    return { type: 'LIFESTYLE', subtitle: 'A Curated Guide' };
  }
  
  // Default to LIFESTYLE for general topics
  return { type: 'LIFESTYLE', subtitle: 'A Curated Guide' };
};

const topicClassification = classifyTopicType(topic);
const classifiedSubtitle = topicClassification.subtitle;
const topicType = topicClassification.type;

console.log('Topic classified as:', topicType, '- Using subtitle:', classifiedSubtitle);

const systemPrompt = `You are a world-class expert writer, travel journalist, and subject matter specialist. You do NOT engage in conversation—you only produce refined, comprehensive guide content.

TOPIC CLASSIFICATION: ${topicType}
${topicType === 'TECHNICAL' ? '- Focus on: Tools, parts, step-by-step repair/building procedures, technical specifications, safety protocols' : ''}
${topicType === 'LIFESTYLE' ? '- Focus on: Recommendations, curated lists, prices (2026), insider tips, experiential guidance' : ''}
${topicType === 'ACADEMIC' ? '- Focus on: Historical context, theoretical frameworks, research citations, analytical depth' : ''}

CRITICAL PERSONA:
- You are an EXPERT, not an assistant. You provide SPECIFIC data, recommendations, and prices (current for 2026).
- NEVER give "homework" to readers. NEVER say "research online" or "check local listings."
- For travel/lifestyle guides: Include specific hotel names, restaurant recommendations, price ranges in local currency and USD, and neighborhood tips.
- For technical guides: Include specific tool brands, part numbers where applicable, and supplier recommendations.
- For academic guides: Include historical timelines, key figures, and analytical frameworks.

TITLE REQUIREMENTS (CRITICAL):
- The title MUST directly reflect the user's prompt. If they say "London Travel Bible", title it "The London Travel Bible".
- "displayTitle": A short, punchy title of NO MORE THAN 5 WORDS matching the user's intent.
- "subtitle": "${classifiedSubtitle}" - Use this exact subtitle classification.
- "title": The full combined title for reference.

CRITICAL RULES:
- Never say "Sure", "Here is", "I can help", or any conversational filler
- Output ONLY structured book content in the exact JSON format specified
- Write in first-person plural ("we", "our") with an authoritative yet accessible tone
- Provide SPECIFIC data: names, prices, addresses, brands, measurements
- Every sentence must provide actionable value

Your writing style is that of an expert friend who knows everything. Use phrases like:
- "The best option is..."
- "We recommend booking at..." / "We recommend using..."
- "Expect to pay around $X for..."
- "Insider tip: locals know that..." / "Pro tip: experienced practitioners..."

CONTENT DEPTH REQUIREMENTS:
Each chapter MUST include ALL of the following:
1. An engaging introduction (150+ words) with specific, enticing details
2. Context or background relevant to the topic (200+ words)
3. At least 4-5 major section headers using ## markdown syntax CORRECTLY
4. Step-by-step instructions with SPECIFIC details for each step
5. At least 2 real examples with specific names, prices, and recommendations
6. Common mistakes section with solutions
7. Pro tips section with insider knowledge
8. Key Takeaways summary

FORMATTING RULES (STRICTLY ENFORCED):
- Use Markdown headers (# and ##) ONLY at the start of lines, never mid-sentence
- Every step in an itinerary or list MUST be on its own bulleted line
- DO NOT use ** or * for emphasis anywhere
- Write in plain text only - no emphasis markers
- Ensure ALL titles are complete - never truncate mid-word

VISUAL MARKERS (MANDATORY):
- Include exactly ONE visual marker per chapter using: [VISUAL: descriptive prompt for illustration]
- This works for ANY topic: "[VISUAL: Map of central Milan showing key neighborhoods]" or "[VISUAL: Exploded view of watch movement gears]"

You must respond with a JSON object in this exact format:
{
  "title": "The Full Combined Title: ${classifiedSubtitle}",
  "displayTitle": "Short Cover Title",
  "subtitle": "${classifiedSubtitle}",
  "tableOfContents": [
    { "chapter": 1, "title": "Chapter title", "imageDescription": "A clear illustration showing..." },
    { "chapter": 2, "title": "Chapter title", "imageDescription": "An illustration depicting..." },
    { "chapter": 3, "title": "...", "imageDescription": "..." },
    { "chapter": 4, "title": "...", "imageDescription": "..." },
    { "chapter": 5, "title": "...", "imageDescription": "..." },
    { "chapter": 6, "title": "...", "imageDescription": "..." },
    { "chapter": 7, "title": "...", "imageDescription": "..." },
    { "chapter": 8, "title": "...", "imageDescription": "..." },
    { "chapter": 9, "title": "...", "imageDescription": "..." },
    { "chapter": 10, "title": "...", "imageDescription": "..." }
  ],
  "chapter1Content": "Full markdown content of chapter 1 - MINIMUM ${minWordsPerChapter} WORDS...",
  "localResources": [
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" },
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" },
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" }
  ]
}

CHAPTER WORD COUNT: MINIMUM ${minWordsPerChapter} words per chapter (strictly enforced).

CHAPTER STRUCTURE (ALL REQUIRED):
- Compelling opening paragraph establishing importance
- 4-5 section headers using ## markdown syntax (at line start only)
- 2 detailed examples with SPECIFIC names, prices, recommendations
- Numbered step-by-step instructions where applicable
- "Common Mistakes" section
- "Pro Tips" section with expert insights
- MANDATORY: Include exactly ONE "Pro-Tip" callout using: [PRO-TIP: Expert advice here]
- MANDATORY: Include exactly ONE visual marker using: [VISUAL: descriptive prompt]
- "Key Takeaways" summary at end`;

    const userPrompt = `Compose Chapter One (MINIMUM ${minWordsPerChapter} WORDS - this is STRICTLY REQUIRED) and the complete Table of Contents for an instructional volume on: "${topic}".

For Chapter One, you MUST include:
1. Engaging introduction (150+ words) that hooks the reader and establishes the chapter's importance
2. Historical context or background section (200+ words)
3. At least 4-5 major sections with ## headers
4. Detailed step-by-step instructions with explanations for each step
5. 2 real-world case studies or examples (300+ words each)
6. "Common Mistakes" section with problems and solutions
7. "Pro Tips" section with advanced techniques
8. "Putting It Into Practice" section with exercises
9. "Key Takeaways" summary
10. Transition paragraph to Chapter 2

Count your words. The chapter MUST be at least ${minWordsPerChapter} words. This is non-negotiable.`;

    console.log('Calling Google Gemini API for shell (TOC + Chapter 1)...');

    // Exponential backoff on rate limits (429): 5s, 10s, 20s (3 retries + initial attempt)
    const maxRetries = 3;
    const baseWaitMs = 5000;
    let response: Response | null = null;

    for (let retry = 0; retry <= maxRetries; retry++) {
      const attempt = retry + 1;
      console.log(`Gemini API attempt ${attempt}/${maxRetries + 1}`);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: {
                temperature: 0.8,
                responseMimeType: 'application/json',
                maxOutputTokens: 16384,
              },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) break;

        const errorText = await response.text();
        console.error(`Gemini API error (attempt ${attempt}):`, response.status, errorText);

        if (response.status === 429 && retry < maxRetries) {
          const waitTimeMs = baseWaitMs * Math.pow(2, retry);
          console.log(`Rate limited. Waiting ${waitTimeMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTimeMs));
          continue;
        }

        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'The Loom is busy weaving other guides. Please wait 30 seconds and try again.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (response.status === 400) {
          return new Response(
            JSON.stringify({ error: 'Invalid request to AI service.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        throw new Error(`AI service error: ${response.status}`);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`Gemini API timeout (attempt ${attempt})`);
          if (retry < maxRetries) {
            const waitTimeMs = baseWaitMs * Math.pow(2, retry);
            console.log(`Timeout occurred. Waiting ${waitTimeMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTimeMs));
            continue;
          }
        }
        throw fetchError;
      }
    }

    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({ error: 'The Loom is busy weaving other guides. Please wait 30 seconds and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Gemini response received');

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error('No content in Gemini response:', data);
      throw new Error('No content generated');
    }

    // Robust extraction + sanitization + partial-parse fallback
    const { bookData: parsedBookData, warnings } = parseBookDataFromModelText(content, topic);
    if (warnings.length) {
      console.log('Book JSON parse warnings:', warnings.join(', '));
    }

    const bookData: any = parsedBookData ?? {};

    // Normalize required fields - ensure titles are complete (not truncated)
    if (!bookData.title || typeof bookData.title !== 'string') {
      bookData.title = `The Complete Guide to ${topic}`;
    }
    // Fix truncated titles (ending with common truncation patterns)
    if (bookData.title.match(/:\s*\w+ing\s+a?$/i) || bookData.title.match(/:\s*\w+$/) && bookData.title.split(' ').length < 4) {
      bookData.title = `The Complete Guide to ${topic}`;
    }

    if (!bookData.displayTitle || typeof bookData.displayTitle !== 'string') {
      // Create a clean display title (max 5 words, no trailing prepositions)
      const words = bookData.title.split(/[:\-–—]/)[0].trim().split(' ');
      let displayWords = words.slice(0, 5);
      // Remove trailing prepositions/articles that look like truncation
      while (displayWords.length > 1 && /^(a|an|the|to|for|with|and|of|in|on)$/i.test(displayWords[displayWords.length - 1])) {
        displayWords.pop();
      }
      bookData.displayTitle = displayWords.join(' ');
    }

    if (!bookData.subtitle || typeof bookData.subtitle !== 'string') {
      bookData.subtitle = `A Comprehensive Guide to ${topic}`;
    }

    if (!Array.isArray(bookData.tableOfContents)) {
      bookData.tableOfContents = Array.from({ length: 10 }, (_, i) => ({
        chapter: i + 1,
        title: `Chapter ${i + 1}`,
        imageDescription: `A minimalist diagram illustrating core concepts of ${topic}.`,
      }));
    }

    if (!bookData.chapter1Content || typeof bookData.chapter1Content !== 'string') {
      bookData.chapter1Content = `## Draft Output\n\n${sanitizeJsonText(content).slice(0, 12000)}`;
    }

    // Fetch real local resources from Google Places API if key is configured
    if (GOOGLE_PLACES_API_KEY) {
      console.log('Fetching local resources from Google Places API...');
      const placesResources = await fetchLocalResources(topic, GOOGLE_PLACES_API_KEY);
      if (placesResources.length > 0) {
        bookData.localResources = placesResources;
        console.log('Using Google Places API results for local resources');
      } else {
        console.log('Using AI-generated local resources as fallback');
      }
    } else {
      console.log('GOOGLE_PLACES_API_KEY not configured, using AI-generated local resources');
    }

    // Note: High-risk topics get a subtle disclaimer added via AI prompt, not a visible banner
    if (isHighRisk) {
      bookData.hasDisclaimer = true;
    }

    // Generate cover image using Fal.ai if FAL_KEY is configured
    if (FAL_KEY) {
      try {
        console.log('Generating cover image with Fal.ai...');
        
        const NEGATIVE_PROMPT = "text, letters, words, labels, gibberish, alphabet, watermark, blurry, signature, numbers, captions, titles";
        
        const imagePrompt = isAutomotiveTopic
          ? `Professional 8k cinematic studio photography of ${topic}. Dramatic automotive photography with perfect lighting, shallow depth of field, high-end commercial quality. Ultra high resolution, photorealistic. NO TEXT ON IMAGE.`
          : `Macro photography, shallow depth of field, minimalist composition. Professional cookbook aesthetic. Subject: ${bookData.tableOfContents?.[0]?.imageDescription || topic}. Soft natural lighting, elegant styling, premium quality. NO TEXT ON IMAGE.`;
        
        const falResponse = await fetch('https://fal.run/fal-ai/flux/schnell', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            negative_prompt: NEGATIVE_PROMPT,
            image_size: 'square_hd',
            num_inference_steps: 4,
            num_images: 1,
            enable_safety_checker: true,
          }),
        });

        if (falResponse.ok) {
          const falData = await falResponse.json();
          const imageUrl = falData.images?.[0]?.url;
          if (imageUrl) {
            bookData.coverImageUrl = imageUrl;
            console.log('Fal.ai cover image generated successfully');
          }
        } else {
          const errorText = await falResponse.text();
          console.error('Fal.ai error:', falResponse.status, errorText);
        }
      } catch (falError) {
        console.error('Fal.ai image generation failed:', falError);
      }
    } else {
      console.log('FAL_KEY not configured, skipping cover image generation');
    }

    console.log('Successfully generated book shell:', bookData.title);

    // If we have a bookId AND background generation is requested, kick off chapter generation
    // This allows the frontend to save the book first, then call back with the bookId
    if (existingBookId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && GEMINI_API_KEY) {
      console.log('Starting background chapter generation for book:', existingBookId);
      
      // Use EdgeRuntime.waitUntil for background processing
      (globalThis as any).EdgeRuntime?.waitUntil?.(
        generateChaptersInBackground(
          existingBookId,
          topic,
          bookData.tableOfContents,
          GEMINI_API_KEY,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        )
      );
    }

    return new Response(
      JSON.stringify(bookData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-book function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
