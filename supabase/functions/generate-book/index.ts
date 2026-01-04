import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HIGH_RISK_KEYWORDS = [
  'medical', 'health', 'doctor', 'medicine', 'treatment', 'diagnosis', 'symptom',
  'legal', 'law', 'attorney', 'lawyer', 'court', 'lawsuit', 'contract', 'sue'
];

const SAFETY_DISCLAIMER = `⚠️ IMPORTANT DISCLAIMER: This guide is provided for educational and informational purposes only. It is NOT a substitute for professional advice. For medical topics, always consult a licensed healthcare provider. For legal topics, always consult a qualified attorney. The information presented here should not be used for self-diagnosis, self-treatment, or as the basis for legal decisions.\n\n---\n\n`;

serve(async (req) => {
  // Handle CORS preflight requests
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      throw new Error('AI service is not configured');
    }

    // Check if topic is high-risk
    const lowerTopic = topic.toLowerCase();
    const isHighRisk = HIGH_RISK_KEYWORDS.some(keyword => lowerTopic.includes(keyword));
    console.log('High-risk topic detected:', isHighRisk);

    const systemPrompt = `You are a professional technical writer for Loom & Page, a publisher of elegant instructional guides. Your writing style is sophisticated, clear, and instructional—similar to high-end textbooks or professional manuals.

You must respond with a JSON object in this exact format:
{
  "title": "The book title",
  "tableOfContents": [
    { "chapter": 1, "title": "Chapter title here" },
    { "chapter": 2, "title": "Chapter title here" },
    ... (10 chapters total)
  ],
  "chapter1Content": "The full content of chapter 1 in markdown format...",
  "localResources": [
    { "name": "Business Name", "type": "Type of business", "description": "Brief description" },
    { "name": "Business Name 2", "type": "Type of business", "description": "Brief description" },
    { "name": "Business Name 3", "type": "Type of business", "description": "Brief description" }
  ]
}

Important guidelines:
- The title should be elegant and professional (e.g., "The Art of Sourdough Bread Baking")
- Create exactly 10 chapters that build progressively from fundamentals to advanced topics
- Chapter 1 should be an introduction that covers the fundamentals, history, and importance of the topic
- The chapter 1 content should be substantial (at least 500 words) with proper markdown formatting including headers, paragraphs, and bullet points
- Include 3 relevant local resource suggestions (types of businesses/services that could help with this topic)
- Write in a timeless, instructional tone suitable for a printed book`;

    const userPrompt = `Create a detailed Chapter 1 and a 10-chapter Table of Contents for a book titled "${topic}". Use a sophisticated, instructional tone. Include a section for local resources that would be relevant to someone learning about ${topic}.`;

    console.log('Calling Lovable AI Gateway...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('No content in AI response:', data);
      throw new Error('No content generated');
    }

    // Parse the JSON from the response
    let bookData;
    try {
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      bookData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, content);
      throw new Error('Failed to parse generated content');
    }

    // Prepend safety disclaimer for high-risk topics
    if (isHighRisk && bookData.chapter1Content) {
      bookData.chapter1Content = SAFETY_DISCLAIMER + bookData.chapter1Content;
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
