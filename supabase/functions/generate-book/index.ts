import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, sessionId, fullBook = false } = await req.json();
    
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

    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

    // Check if topic is high-risk (but allowed)
    const isHighRisk = HIGH_RISK_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
    console.log('High-risk topic detected:', isHighRisk);

    // Determine chapter count based on fullBook flag
    const chapterCount = fullBook ? 12 : 10;
    const contentLength = fullBook ? 1200 : 600;

    const systemPrompt = `You are the Lead Architect at Loom & Page, a distinguished publisher of elegant instructional volumes. You do not engage in conversation—you only produce refined book content.

CRITICAL RULES:
- Never say "Sure", "Here is", "I can help", or any conversational filler
- Output ONLY the structured book content in the exact JSON format specified
- Write in first-person plural ("we", "our") with an academic yet accessible tone
- Avoid fluff, redundancy, or informal language
- Every sentence must provide instructional value

Your writing style emulates the clarity of technical manuals and the elegance of classic educational texts. Use phrases like:
- "In this volume, we examine..."
- "The practitioner will find..."
- "It is essential to understand..."
- "We now turn our attention to..."

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
    ... (exactly ${chapterCount} chapters)
  ],
  "chapter1Content": "Full markdown content of chapter 1...",
  ${fullBook ? `"chapter2Content": "Full markdown content of chapter 2...",
  "chapter3Content": "Full markdown content of chapter 3...",
  "chapter4Content": "Full markdown content of chapter 4...",
  "chapter5Content": "Full markdown content of chapter 5...",
  "chapter6Content": "Full markdown content of chapter 6...",
  "chapter7Content": "Full markdown content of chapter 7...",
  "chapter8Content": "Full markdown content of chapter 8...",
  "chapter9Content": "Full markdown content of chapter 9...",
  "chapter10Content": "Full markdown content of chapter 10...",
  "chapter11Content": "Full markdown content of chapter 11...",
  "chapter12Content": "Full markdown content of chapter 12...",` : ''}
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

Chapter requirements:
- Minimum ${contentLength} words of substantive instructional content per chapter
- Begin with a compelling opening paragraph (no "Welcome" or greetings)
- Include 2-3 section headers using ## markdown syntax
- Incorporate at least one blockquote with a relevant insight
- End with a transition to subsequent chapters
- Use proper markdown: headers, paragraphs, bullet lists where appropriate`;

    const userPrompt = fullBook 
      ? `Compose ALL ${chapterCount} chapters with full content and the complete Table of Contents for an instructional volume on: "${topic}"`
      : `Compose Chapter One and the complete Table of Contents for an instructional volume on: "${topic}"`;

    console.log('Calling Google Gemini API...');

    // Exponential backoff on rate limits (429): 2s, 4s, 8s (3 retries + initial attempt)
    const maxRetries = 3;
    let response: Response | null = null;

    for (let retry = 0; retry <= maxRetries; retry++) {
      const attempt = retry + 1;
      console.log(`Gemini API attempt ${attempt}/${maxRetries + 1}`);

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: fullBook ? 32000 : 8000,
            },
          }),
        }
      );

      if (response.ok) {
        break;
      }

      const errorText = await response.text();
      console.error(`Gemini API error (attempt ${attempt}):`, response.status, errorText);

      if (response.status === 429 && retry < maxRetries) {
        const waitTimeMs = Math.pow(2, retry + 1) * 1000; // 2s, 4s, 8s
        console.log(`Rate limited. Waiting ${waitTimeMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
        continue;
      }

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'The Loom is busy weaving other guides. Please wait 30 seconds and try again.',
          }),
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
    }

    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({
          error: 'The Loom is busy weaving other guides. Please wait 30 seconds and try again.',
        }),
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

    // Parse the JSON from the response
    let bookData;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      bookData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, content);
      // If parsing fails, it might be nonsense input
      return new Response(
        JSON.stringify({ 
          error: 'Loom & Page is unable to weave a guide on this specific topic. Please try a different instructional area.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the response structure
    if (!bookData.title || !bookData.tableOfContents || !bookData.chapter1Content) {
      console.error('Invalid book structure:', bookData);
      return new Response(
        JSON.stringify({ 
          error: 'Loom & Page is unable to weave a guide on this specific topic. Please try a different instructional area.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure displayTitle and subtitle exist (fallback for backwards compatibility)
    if (!bookData.displayTitle) {
      // Generate a short display title from the full title (first 5 words)
      const words = bookData.title.split(' ');
      bookData.displayTitle = words.slice(0, 5).join(' ');
    }
    if (!bookData.subtitle) {
      bookData.subtitle = `A Comprehensive Guide to ${topic}`;
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

    console.log('Successfully generated book:', bookData.title);

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
