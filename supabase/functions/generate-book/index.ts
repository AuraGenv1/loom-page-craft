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

// INTENT ROUTER: Classify the topic type dynamically
function classifyTopicType(topicText: string): { type: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC'; subtitle: string } {
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
}

// Generate a single chapter with retry logic - INDEPENDENT WORKER
async function generateSingleChapter(
  chapterNumber: number,
  chapterTitle: string,
  topic: string,
  topicType: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC',
  geminiApiKey: string
): Promise<string | null> {
  const minWordsPerChapter = 2000;
  
  // SMART IMAGE BUDGETING based on topic type
  const imageGuidance = topicType === 'TECHNICAL'
    ? 'IMAGE BUDGET: 0 images for this chapter. Technical manuals focus on clear text instructions, not photographs.'
    : topicType === 'LIFESTYLE'
    ? 'IMAGE BUDGET: Include exactly 1 sizzle image using [IMAGE: detailed prompt for stunning professional photograph]. Make it aspirational and beautiful.'
    : 'IMAGE BUDGET: 0-1 images only if a visual would genuinely aid understanding.';
  
  const systemPrompt = `You are a world-class expert and prolific author. You do NOT give homework—you ARE the expert. Provide SPECIFIC data, prices (2026), names, and recommendations.

TOPIC TYPE: ${topicType}
${imageGuidance}

CRITICAL EXPERT PERSONA:
- NEVER say "research online", "check local listings", or "consult a professional"
- YOU provide the specific names, prices, recommendations, and data
- If discussing travel: give actual hotel names, restaurant recommendations, prices in local currency AND USD
- If discussing technical topics: give specific tool brands, part numbers, supplier names
- Be the expert friend who knows everything

CRITICAL RULES:
- Never say "Sure", "Here is", or any conversational filler
- Output ONLY the markdown content for this chapter
- Write in first-person plural ("we", "our") with an authoritative yet accessible tone
- Minimum ${minWordsPerChapter} words of substantive instructional content
- Include 4-5 section headers using ## markdown syntax
- Include at least 2 detailed examples with SPECIFIC names, prices, and recommendations
- Include numbered step-by-step instructions where applicable

SECTION STRUCTURE (ALL REQUIRED):
- "Common Mistakes" section: Use this EXACT format:
  
  ## Common Mistakes
  
  ### Mistake 1: [Specific mistake name]
  
  [Full paragraph explaining the mistake and why it happens]
  
  **Solution:** [Full paragraph with the fix]
  
  ### Mistake 2: [Specific mistake name]
  
  [Full paragraph explaining the mistake]
  
  **Solution:** [Full paragraph with the fix]

- "Pro Tips" section with expert-level insights
- End with "Key Takeaways" summary

FORMATTING RULES (STRICTLY ENFORCED):
- Use ## headers at the START of lines only
- Every ### subsection MUST be followed by a blank line, then paragraph text
- DO NOT use ** or * for emphasis except in "**Solution:**" format
- Write in plain text otherwise
- NEVER use the words "diagram", "blueprint", "plate", or "bar graph"`;

  const userPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for a comprehensive guide on "${topic}".

REQUIRED ELEMENTS (ALL MANDATORY):
1. Engaging introduction (150+ words) with specific, enticing details
2. At least 4-5 major sections with ## headers
3. Detailed step-by-step instructions with SPECIFIC recommendations
4. 2 real-world examples with actual names, prices, and expert recommendations
5. "Common Mistakes" section with ### subheaders and **Solution:** format
6. "Pro Tips" section with insider knowledge
7. "Key Takeaways" summary
${topicType === 'LIFESTYLE' ? '8. ONE [IMAGE: very specific prompt for stunning photograph]' : ''}

EXPERT REQUIREMENT: Provide SPECIFIC data. Not "check online" but "book at Hotel & Spa for around $350/night" or "use a Bergeon 30081 screwdriver set ($85 from Ofrei)".

MINIMUM ${minWordsPerChapter} WORDS. Write the full chapter content in markdown format.`;

  const maxRetries = 5;
  const baseWaitMs = 10000;

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      console.log(`[Chapter ${chapterNumber}] Attempt ${retry + 1}/${maxRetries + 1}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: {
              temperature: 0.8,
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
          return content.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
        }
      }

      if (response.status === 429 && retry < maxRetries) {
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

// ATOMIC GENERATION: Each chapter saves IMMEDIATELY to database upon completion
// This ensures real-time progress and prevents "Chapter 3" timeout bugs
async function generateAndSaveChapterAtomically(
  chapterNum: number,
  chapterTitle: string,
  topic: string,
  topicType: 'TECHNICAL' | 'LIFESTYLE' | 'ACADEMIC',
  bookId: string,
  geminiApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`[ATOMIC ${chapterNum}] Starting generation for: ${chapterTitle}`);
  
  try {
    const content = await generateSingleChapter(chapterNum, chapterTitle, topic, topicType, geminiApiKey);
    
    if (content) {
      // ATOMIC SAVE: Immediately upsert to database
      const columnName = `chapter${chapterNum}_content`;
      const { error } = await supabase
        .from('books')
        .update({ [columnName]: content })
        .eq('id', bookId);
      
      if (error) {
        console.error(`[ATOMIC ${chapterNum}] DB save failed:`, error);
      } else {
        console.log(`[ATOMIC ${chapterNum}] ✓ SAVED - ${content.length} chars`);
      }
    } else {
      console.error(`[ATOMIC ${chapterNum}] Generation returned null after all retries`);
    }
  } catch (err) {
    console.error(`[ATOMIC ${chapterNum}] Error (others will continue):`, err);
    // Don't throw - allow other chapters to continue
  }
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

    // INTENT ROUTER: Classify topic type for dynamic subtitle
    const topicClassification = classifyTopicType(topic);
    const classifiedSubtitle = topicClassification.subtitle;
    const topicType = topicClassification.type;
    
    console.log('Topic classified as:', topicType, '- Using subtitle:', classifiedSubtitle);

    // SHELL-FIRST: Generate only TOC and Chapter 1, then return immediately
    const minWordsPerChapter = 1800;

    // SMART IMAGE BUDGETING in system prompt
    const imageGuidance = topicType === 'TECHNICAL'
      ? `IMAGE BUDGET: You are a visual editor with a STRICT budget.
        - Generate 0 images in chapter content for technical guides
        - Technical manuals rely on clear text instructions, not photographs
        - NEVER use words like "diagram", "blueprint", "plate", or "bar graph"`
      : topicType === 'LIFESTYLE'
      ? `IMAGE BUDGET: You are a visual editor with a STRICT budget.
        - Generate exactly 1 "sizzle" photograph per chapter using [IMAGE: prompt]
        - Make each image aspirational and magazine-quality
        - Example: [IMAGE: Breathtaking sunset view from the terrace of Hotel & Spa overlooking the Mediterranean]
        - NEVER use diagrams, bar graphs, or the word "plate"`
      : `IMAGE BUDGET: 0-1 images total for the entire book. Only include if essential.`;

    const systemPrompt = `You are a world-class expert—a renowned travel journalist, subject matter specialist, and prolific author. You do NOT engage in conversation—you only produce refined, comprehensive guide content.

TOPIC CLASSIFICATION: ${topicType}
DYNAMIC SUBTITLE: "${classifiedSubtitle}"
${topicType === 'TECHNICAL' ? '- Focus on: Tools, parts, step-by-step repair/building procedures, technical specifications, safety protocols' : ''}
${topicType === 'LIFESTYLE' ? '- Focus on: Specific recommendations, curated lists with prices (2026), insider tips, experiential guidance' : ''}
${topicType === 'ACADEMIC' ? '- Focus on: Historical context, theoretical frameworks, research citations, analytical depth' : ''}

${imageGuidance}

CRITICAL EXPERT PERSONA:
- You are THE EXPERT, not an assistant. You provide SPECIFIC data, recommendations, and prices (current for 2026).
- NEVER give "homework" to readers. NEVER say "research online", "check local listings", or "consult a professional."
- For travel/lifestyle: Include specific hotel names with prices ($XXX/night), restaurant names with price ranges, ferry/transport costs, car rental agency names.
- For technical: Include specific tool brands and models (e.g., "Bergeon 30081 screwdriver set, $85 from Ofrei"), part numbers, supplier names.
- For academic: Include specific dates, key figure names, and analytical frameworks.
- Your tone is that of an expert friend who knows everything and shares it generously.

TITLE REQUIREMENTS (CRITICAL):
- The title MUST directly reflect the user's prompt. If they say "London Travel Bible", title it "The London Travel Bible".
- "displayTitle": A short, punchy title of NO MORE THAN 5 WORDS matching the user's intent.
- "subtitle": "${classifiedSubtitle}" - Use this exact subtitle classification.
- "title": The full combined title for reference.

CRITICAL RULES:
- Never say "Sure", "Here is", "I can help", or any conversational filler
- Output ONLY structured book content in the exact JSON format specified
- Write in first-person plural ("we", "our") with an authoritative yet accessible tone
- Provide SPECIFIC data: names, prices (in local currency AND USD where applicable), addresses, brands, measurements
- Every sentence must provide actionable value

Your writing style uses phrases like:
- "The best option is..."
- "We recommend booking at [Hotel Name] for around $XXX/night..."
- "Expect to pay around $X for..."
- "Insider tip: locals know that..."
- "The ferry from St. Martin costs $100-150 round trip via [Company Name]..."

CONTENT DEPTH REQUIREMENTS:
Each chapter MUST include ALL of the following:
1. An engaging introduction (150+ words) with specific, enticing details
2. Context or background relevant to the topic (200+ words)
3. At least 4-5 major section headers using ## markdown syntax CORRECTLY
4. Step-by-step instructions with SPECIFIC details for each step
5. At least 2 real examples with SPECIFIC names, prices, and recommendations
6. "Common Mistakes" section with ## header, then ### subheaders for each mistake, followed by **Solution:** format
7. MANDATORY: Include exactly ONE "Pro-Tip" callout using: [PRO-TIP: Expert advice] - the UI renders this as a styled box

FORMATTING RULES (STRICTLY ENFORCED):
- Use Markdown headers (# and ##) ONLY at the start of lines, never mid-sentence
- Every step in an itinerary or list MUST be on its own bulleted line
- After every ### header, add a BLANK LINE before the paragraph
- DO NOT use ** or * for emphasis (except **Solution:**)
- DO NOT write "Pro Tips" or "Key Takeaways" as section headers - use [PRO-TIP:] tags instead
- Write in plain text only - no emphasis markers
- Ensure ALL titles are complete - never truncate mid-word

${topicType === 'LIFESTYLE' ? `IMAGE REQUIREMENT:
- Include exactly ONE [IMAGE: prompt] marker at the TOP of Chapter 1 content (before the first paragraph)
- The prompt must include GEOGRAPHIC LOCATION and be highly specific
- Example: [IMAGE: Authentic editorial photography of the Eiffel Tower at golden hour, Paris, France]` : ''}

You must respond with a JSON object in this exact format:
{
  "title": "The Full Combined Title: ${classifiedSubtitle}",
  "displayTitle": "Short Cover Title",
  "subtitle": "${classifiedSubtitle}",
  "tableOfContents": [
    { "chapter": 1, "title": "Chapter title", "imageDescription": "EXTREMELY specific prompt for high-end travel photography..." },
    { "chapter": 2, "title": "Chapter title", "imageDescription": "..." },
    ...through chapter 10
  ],
  "chapter1Content": "Full markdown content of chapter 1 - MINIMUM ${minWordsPerChapter} WORDS with SPECIFIC data...",
  "localResources": [
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" }
  ]
}

CHAPTER WORD COUNT: MINIMUM ${minWordsPerChapter} words per chapter (strictly enforced).

CHAPTER STRUCTURE (ALL REQUIRED):
- Compelling opening paragraph establishing importance
- 4-5 section headers using ## markdown syntax (at line start only)
- 2 detailed examples with SPECIFIC names, prices, recommendations
- Numbered step-by-step instructions where applicable
- "Common Mistakes" section with ### subheaders and **Solution:** format
- MANDATORY: Exactly ONE [PRO-TIP: Expert advice here] callout (UI renders this as styled box)
${topicType === 'LIFESTYLE' ? '- Include ONE [IMAGE: extremely specific prompt with location for stunning photograph]' : '- NO images for technical content'}`;

    const userPrompt = `Compose Chapter One (MINIMUM ${minWordsPerChapter} WORDS - this is STRICTLY REQUIRED) and the complete Table of Contents for an instructional volume on: "${topic}".

For Chapter One, you MUST include:
1. ${topicType === 'LIFESTYLE' ? 'ONE [IMAGE: prompt with geographic location] at the TOP of the chapter, before text' : 'NO images for technical content'}
2. Engaging introduction (150+ words) that hooks the reader and establishes the chapter's importance
3. Historical context or background section (200+ words)
4. At least 4-5 major sections with ## headers
5. Detailed step-by-step instructions with explanations for each step
6. 2 real-world case studies or examples (300+ words each)
7. "Common Mistakes" section with ## header, then ### subheaders for each mistake, then **Solution:** format
8. MANDATORY: Exactly ONE [PRO-TIP: ...] callout (the UI renders this as a styled box)
9. "Putting It Into Practice" section with exercises
10. Transition paragraph to Chapter 2

FORMATTING: Do NOT write "Pro Tips" or "Key Takeaways" as section headers. Use [PRO-TIP:] tags instead - the UI will render them beautifully.

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

    // ALWAYS use the classified subtitle - never hardcode
    bookData.subtitle = classifiedSubtitle;

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

    // Generate cover image using Google Custom Search API with DYNAMIC INTENT
    // AI generates topic-specific search query for maximum relevance
    const GOOGLE_CSE_API_KEY = Deno.env.get('GOOGLE_CSE_API_KEY');
    const GOOGLE_CSE_CX = Deno.env.get('GOOGLE_CSE_CX');
    
    if (GOOGLE_CSE_API_KEY && GOOGLE_CSE_CX) {
      try {
        console.log('Generating dynamic search query for cover image...');
        
        // DYNAMIC INTENT SEARCH: Generate topic-specific search query
        let searchQuery = `${topic} high resolution professional photography`;
        
        // Intent-based query optimization
        if (topicType === 'TECHNICAL') {
          // For technical topics: focus on mechanical details, tools, craftsmanship
          searchQuery = `${topic} professional studio photography detail close-up`;
        } else if (topicType === 'LIFESTYLE') {
          // For lifestyle/travel: focus on landscapes, interiors, aspirational imagery
          const travelKeywords = /\b(travel|trip|vacation|tour|visit|city|country|island|beach|mountain)\b/i;
          if (travelKeywords.test(topic)) {
            searchQuery = `${topic} scenic landscape travel destination professional photography`;
          } else {
            searchQuery = `${topic} lifestyle magazine professional photography`;
          }
        } else {
          // For academic: focus on relevant imagery
          searchQuery = `${topic} professional editorial photography`;
        }
        
        console.log('Dynamic search query:', searchQuery);
        
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(searchQuery)}&searchType=image&num=10&imgSize=large&imgType=photo&safe=active`;
        
        const searchResponse = await fetch(searchUrl);
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const items = searchData.items || [];
          
          // Blocked domains that often fail to load
          const blockedDomains = ['instagram.com', 'pinterest.com', 'tripadvisor.com', 'facebook.com', 'twitter.com', 'x.com'];
          
          // Filter and collect up to 5 valid image URLs
          const validUrls: string[] = [];
          
          for (const item of items) {
            if (validUrls.length >= 5) break;
            
            const imageUrl = item.link;
            if (!imageUrl) continue;
            
            // Check if URL is from a blocked domain
            const isBlocked = blockedDomains.some(domain => imageUrl.toLowerCase().includes(domain));
            if (isBlocked) {
              console.log(`Skipping blocked domain: ${imageUrl}`);
              continue;
            }
            
            validUrls.push(imageUrl);
          }
          
          if (validUrls.length > 0) {
            // Store as array for fallback logic in frontend
            bookData.coverImageUrl = validUrls;
            console.log(`Google CSE: Found ${validUrls.length} valid cover images`);
          } else {
            console.log('Google CSE: No valid images found after filtering');
          }
        } else {
          const errorText = await searchResponse.text();
          console.error('Google CSE error:', searchResponse.status, errorText);
        }
      } catch (cseError) {
        console.error('Google Custom Search failed:', cseError);
      }
    } else {
      console.log('Google CSE API keys not configured, skipping cover image search');
    }

    console.log('Successfully generated book shell:', bookData.title);

    // COST OPTIMIZATION: Only generate remaining chapters if user is purchasing (fullBook=true)
    // For guests (unpaid), we only generate Cover + Chapter 1 to save API costs
    if (fullBook && existingBookId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && GEMINI_API_KEY) {
      console.log('FULL BOOK REQUESTED: Spawning 9 independent chapter generators for book:', existingBookId);
      
      const toc = bookData.tableOfContents || [];
      
      // Spawn ALL chapters simultaneously - each saves atomically to DB
      for (let chapterNum = 2; chapterNum <= 10; chapterNum++) {
        const tocEntry = toc.find((ch: { chapter: number }) => ch.chapter === chapterNum);
        const chapterTitle = tocEntry?.title || `Chapter ${chapterNum}`;
        
        // Each chapter runs independently and saves IMMEDIATELY on completion
        (globalThis as any).EdgeRuntime?.waitUntil?.(
          generateAndSaveChapterAtomically(
            chapterNum,
            chapterTitle,
            topic,
            topicType,
            existingBookId,
            GEMINI_API_KEY,
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
          )
        );
      }
      
      console.log('All 9 atomic chapter generators spawned - each saves immediately on completion');
    } else if (!fullBook) {
      console.log('GUEST MODE: Only generating Cover + Chapter 1 to save costs. Remaining chapters require payment.');
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
