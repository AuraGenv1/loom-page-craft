import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HIGH_RISK_KEYWORDS = [
  'medical', 'health', 'doctor', 'medicine', 'treatment', 'diagnosis', 'symptom',
  'legal', 'law', 'attorney', 'lawyer', 'court', 'lawsuit', 'contract', 'sue'
];

const BLOCKED_KEYWORDS = [
  'weapon', 'explosive', 'bomb', 'illegal', 'hack', 'drug', 'narcotic'
];

const SAFETY_DISCLAIMER = `⚠️ IMPORTANT NOTICE

This volume is provided for educational and informational purposes only. The content herein does not constitute professional advice. For medical topics, we strongly advise consultation with a licensed healthcare provider. For legal matters, engagement with a qualified attorney is essential. This guide should not be used for self-diagnosis, self-treatment, or as the basis for legal decisions.

---`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic } = await req.json();
    
    if (!topic || typeof topic !== 'string') {
      console.error('Invalid topic provided:', topic);
      return new Response(
        JSON.stringify({ error: 'Topic is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating book for topic:', topic);

    // Check for blocked topics
    const lowerTopic = topic.toLowerCase();
    const isBlocked = BLOCKED_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
    
    if (isBlocked) {
      console.log('Blocked topic detected:', topic);
      return new Response(
        JSON.stringify({ 
          error: 'Loom & Page is unable to weave a guide on this specific topic. Please try a different instructional area.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not configured');
      throw new Error('AI service is not configured');
    }

    // Check if topic is high-risk
    const isHighRisk = HIGH_RISK_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
    console.log('High-risk topic detected:', isHighRisk);

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

You must respond with a JSON object in this exact format:
{
  "title": "The elegant book title",
  "tableOfContents": [
    { "chapter": 1, "title": "Chapter title" },
    { "chapter": 2, "title": "Chapter title" },
    ... (exactly 10 chapters)
  ],
  "chapter1Content": "Full markdown content of chapter 1...",
  "localResources": [
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" },
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" },
    { "name": "Business Name", "type": "Service Type", "description": "Brief description" }
  ]
}

Chapter 1 requirements:
- Minimum 600 words of substantive instructional content
- Begin with a compelling opening paragraph (no "Welcome" or greetings)
- Include 2-3 section headers using ## markdown syntax
- Incorporate at least one blockquote with a relevant insight
- End with a transition to subsequent chapters
- Use proper markdown: headers, paragraphs, bullet lists where appropriate`;

    const userPrompt = `Compose Chapter One and the complete Table of Contents for an instructional volume on: "${topic}"`;

    console.log('Calling Google Gemini API...');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Our presses are momentarily at capacity. Please try again in a moment.' }),
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
