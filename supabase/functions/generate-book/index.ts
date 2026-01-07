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

// Strictly block only violence, illegal acts, and self-harm (allow wellness/nutrition/fitness)
const BLOCKED_KEYWORDS = [
  'weapon', 'explosive', 'bomb', 'illegal', 'hack', 'narcotic',
  'kill', 'murder', 'assassin', 'poison', 'suicide', 'self-harm', 'cutting',
  'terrorism', 'terrorist', 'bio-weapon', 'chemical weapon', 'nerve agent',
  'child abuse', 'exploitation', 'human trafficking', 'torture',
  'counterfeit', 'fraud', 'launder', 'money laundering'
];

// Wellness topics that are explicitly ALLOWED
const WELLNESS_ALLOWED = [
  'fasting', 'intermittent fasting', 'diet', 'nutrition', 'weight loss',
  'fitness', 'exercise', 'workout', 'yoga', 'meditation', 'mindfulness',
  'wellness', 'healthy eating', 'keto', 'paleo', 'vegan', 'vegetarian',
  'meal prep', 'calorie', 'protein', 'vitamins', 'supplements'
];

const SAFETY_ERROR = 'This topic violates our safety guidelines and cannot be generated.';

const SAFETY_DISCLAIMER = `⚠️ IMPORTANT NOTICE

This volume is provided for educational and informational purposes only. The content herein does not constitute professional advice. For medical topics, we strongly advise consultation with a licensed healthcare provider. For legal matters, engagement with a qualified attorney is essential. This guide should not be used for self-diagnosis, self-treatment, or as the basis for legal decisions.

---`;

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
  
  // MANDATORY DIAGRAM requirement in prompt
  const diagramInstruction = imageDescription 
    ? `\n\nMANDATORY DIAGRAM: This chapter MUST include a Technical Diagram placeholder. Use the marker: [DIAGRAM: ${imageDescription}] - place this at the most relevant point in the chapter (after the introduction or at a key concept).`
    : `\n\nMANDATORY DIAGRAM: This chapter MUST include at least one Technical Diagram placeholder. Use the format: [DIAGRAM: Description of what the diagram shows] - be specific about the instructional content.`;
  
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
- IMPORTANT: Include exactly ONE diagram placeholder using [DIAGRAM: description] format${diagramInstruction}`;

  const userPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for a comprehensive guide on "${topic}".

Include:
1. Engaging introduction (150+ words)
2. At least 4-5 major sections with ## headers
3. Detailed step-by-step instructions
4. 2 real-world case studies or examples (300+ words each)
5. "Common Mistakes" section with problems and solutions
6. "Pro Tips" section with advanced techniques
7. "Key Takeaways" summary
8. ONE [DIAGRAM: ...] placeholder at the most instructional point

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

// Background task to generate ALL chapters with TURBO PARALLEL starts for maximum speed
async function generateChaptersInBackground(
  bookId: string,
  topic: string,
  tableOfContents: Array<{ chapter: number; title: string; imageDescription?: string }>,
  geminiApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`[Background] TURBO MODE: Launching ALL chapters simultaneously for book ${bookId}`);
  
  // NO initial delay - start immediately for maximum speed
  const chapters = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  
  // Launch ALL chapters with minimal 500ms stagger (just enough to avoid instant 429)
  const chapterPromises = chapters.map(async (chapterNum, index) => {
    // Minimal stagger: 500ms between each launch for turbo speed
    const staggerDelay = index * 500;
    await new Promise(resolve => setTimeout(resolve, staggerDelay));
    
    const tocEntry = tableOfContents.find(ch => ch.chapter === chapterNum);
    const chapterTitle = tocEntry?.title || `Chapter ${chapterNum}`;
    const imageDesc = tocEntry?.imageDescription || '';
    
    console.log(`[Background] Launching chapter ${chapterNum}: ${chapterTitle} (stagger: ${staggerDelay}ms)`);
    
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
  });
  
  // Wait for all chapters to complete
  await Promise.all(chapterPromises);
  
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
    
    // Check for blocked topics (safety filter) - skip if wellness allowed
    const isBlocked = !isWellnessAllowed && BLOCKED_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
    
    if (isBlocked) {
      console.log('Safety filter triggered for topic:', topic);
      return new Response(
        JSON.stringify({ error: SAFETY_ERROR }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Additional safety check: scan for dangerous instruction patterns (skip for wellness)
    const dangerousPatterns = [
      /how to (make|build|create|manufacture).*(weapon|bomb|explosive|gun)/i,
      /how to (harm|hurt|injure|kill)/i,
      /instructions for (violence|assault|attack)/i,
      /ways to (poison|drug|sedate)/i,
    ];
    
    const hasDangerousPattern = !isWellnessAllowed && dangerousPatterns.some(pattern => pattern.test(topic));
    if (hasDangerousPattern) {
      console.log('Safety pattern match for topic:', topic);
      return new Response(
        JSON.stringify({ error: SAFETY_ERROR }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not configured');
      throw new Error('AI service is not configured');
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

    const systemPrompt = `You are a prolific author and Lead Architect at Loom & Page, a distinguished publisher of elegant instructional volumes. You do not engage in conversation—you only produce refined, comprehensive book content.

CRITICAL MISSION: Create definitive, textbook-quality content. Each chapter must be EXHAUSTIVE, not summarized. You are writing a 100-300 page professional guide.

CRITICAL RULES:
- Never say "Sure", "Here is", "I can help", or any conversational filler
- Output ONLY the structured book content in the exact JSON format specified
- Write in first-person plural ("we", "our") with an academic yet accessible tone
- DO NOT SUMMARIZE. Provide exhaustive detail, case studies, step-by-step instructions
- Every sentence must provide instructional value
- Write as if this is the definitive textbook on the subject

Your writing style emulates the depth of university textbooks and the elegance of classic educational texts. Use phrases like:
- "In this volume, we examine..."
- "The practitioner will find..."
- "It is essential to understand..."
- "We now turn our attention to..."
- "Consider the following case study..."
- "To illustrate this principle..."

CONTENT DEPTH REQUIREMENTS (CRITICAL):
Each chapter MUST include ALL of the following:
1. An engaging introduction paragraph (150+ words) that hooks the reader
2. Historical context or background when relevant (200+ words)
3. At least 4-5 major section headers using ## markdown syntax
4. Step-by-step instructions with detailed explanations for EACH step
5. At least 2 real-world case studies or examples (300+ words each)
6. Common mistakes/pitfalls section with solutions
7. Pro tips and advanced techniques section
8. A "Putting It Into Practice" section with exercises
9. Chapter summary with key takeaways
10. Transition paragraph to the next chapter

TITLE REQUIREMENTS:
- "displayTitle": A short, punchy title of NO MORE THAN 5 WORDS. This appears on the book cover.
- "subtitle": A longer, more descriptive subtitle (8-15 words) for the inside of the book.
- "title": The full combined title for reference.

You must respond with a JSON object in this exact format:
{
  "title": "The Full Combined Title: With Subtitle",
  "displayTitle": "Short Cover Title",
  "subtitle": "A longer descriptive subtitle explaining the book's contents",
  "tableOfContents": [
    { "chapter": 1, "title": "Chapter title", "imageDescription": "A clear instructional diagram showing..." },
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

IMPORTANT FOR TABLE OF CONTENTS:
- Each chapter MUST include an "imageDescription" field that describes a clear, instructional diagram or illustration for that chapter
- The imageDescription should be specific and describe what the diagram shows (e.g., "A labeled diagram showing the parts of a sourdough starter jar with temperature zones")
- For instructional topics, describe diagrams, step-by-step visuals, or annotated illustrations
- Avoid generic descriptions - be specific to the chapter content

CHAPTER WORD COUNT REQUIREMENTS (STRICTLY ENFORCED):
- MINIMUM ${minWordsPerChapter} words of substantive instructional content per chapter
- This is NOT optional - chapters under this limit are REJECTED
- Count your words and ensure compliance
- More content is always preferred over less

CHAPTER STRUCTURE (ALL REQUIRED):
- Begin with a compelling opening paragraph that establishes importance
- Include 4-5 section headers using ## markdown syntax
- Include at least 2 detailed case studies or examples per chapter
- Include numbered step-by-step instructions where applicable
- Incorporate 2-3 blockquotes with relevant insights or expert quotes
- Include a "Common Mistakes" section
- Include a "Pro Tips" section
- End with a "Key Takeaways" summary and transition to subsequent chapters
- Use proper markdown: headers, paragraphs, bullet lists, numbered lists`;

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

    // Normalize required fields
    if (!bookData.title || typeof bookData.title !== 'string') {
      bookData.title = `Guide to ${topic}`;
    }

    if (!bookData.displayTitle || typeof bookData.displayTitle !== 'string') {
      const words = bookData.title.split(' ');
      bookData.displayTitle = words.slice(0, 5).join(' ');
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

    // Prepend safety disclaimer for high-risk topics
    if (isHighRisk) {
      bookData.chapter1Content = SAFETY_DISCLAIMER + '\n\n' + bookData.chapter1Content;
      bookData.hasDisclaimer = true;
    }

    // Generate cover image using Fal.ai if FAL_KEY is configured
    if (FAL_KEY) {
      try {
        console.log('Generating cover image with Fal.ai...');
        
        const imagePrompt = isAutomotiveTopic
          ? `Professional 8k cinematic studio photography of ${topic}. Dramatic automotive photography with perfect lighting, shallow depth of field, high-end commercial quality. Ultra high resolution, photorealistic.`
          : `Clean technical manual illustration on white background: ${bookData.tableOfContents?.[0]?.imageDescription || topic}. Professional instructional diagram style, blueprint aesthetic, precise linework.`;
        
        const falResponse = await fetch('https://fal.run/fal-ai/flux/schnell', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: imagePrompt,
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
