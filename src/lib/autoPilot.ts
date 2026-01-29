/**
 * Smart Auto-Pilot: Keyword detection for book voice and structure
 * 
 * If the user does not manually select options, this function analyzes
 * their search query to intelligently select defaults.
 */

export interface AutoPilotResult {
  voice: 'insider' | 'bestie' | 'poet' | 'professor';
  structure: 'curated' | 'playbook' | 'balanced';
  detectedKeywords: string[];
}

// Keywords that indicate an educational/how-to focus
const PLAYBOOK_KEYWORDS = [
  'how to',
  'learn',
  'steps',
  'education',
  'practice',
  'guide to',
  'tutorial',
  'beginner',
  'master',
  'course',
  'training',
  'techniques',
  'method',
  'basics',
  'fundamentals',
];

// Keywords that indicate a curated/travel-style guide
const CURATED_KEYWORDS = [
  'guide',
  'travel',
  'where to',
  'best',
  'stay',
  'eat',
  'visit',
  'destination',
  'trip',
  'hotels',
  'restaurants',
  'shopping',
  'places',
  'city',
  'vacation',
  'weekend',
];

// Keywords that suggest a poetic/romantic voice
const POET_KEYWORDS = [
  'romantic',
  'love',
  'dream',
  'beautiful',
  'enchanting',
  'magical',
  'honeymoon',
  'serene',
  'peaceful',
  'poetic',
  'soul',
  'spiritual',
];

// Keywords that suggest a fun/bestie voice
const BESTIE_KEYWORDS = [
  'fun',
  'girls trip',
  'party',
  'weekend',
  'brunch',
  'vibes',
  'bachelorette',
  'nightlife',
  'clubbing',
  'trendy',
  'hot spots',
  'must-try',
];

// Keywords that suggest an academic/professor voice
const PROFESSOR_KEYWORDS = [
  'academic',
  'research',
  'study',
  'history of',
  'analysis',
  'comprehensive',
  'theory',
  'science',
  'mathematics',
  'philosophy',
  'economics',
];

/**
 * Detect the best auto-pilot settings based on user input
 */
export const detectAutoPilotSettings = (input: string): AutoPilotResult => {
  const lower = input.toLowerCase();
  let voice: AutoPilotResult['voice'] = 'insider'; // Default fallback
  let structure: AutoPilotResult['structure'] = 'balanced'; // Default fallback
  const detectedKeywords: string[] = [];

  // Structure Detection (Playbook vs Curated vs Balanced)
  for (const kw of PLAYBOOK_KEYWORDS) {
    if (lower.includes(kw)) {
      structure = 'playbook';
      detectedKeywords.push(kw);
      break;
    }
  }

  if (structure !== 'playbook') {
    for (const kw of CURATED_KEYWORDS) {
      if (lower.includes(kw)) {
        structure = 'curated';
        detectedKeywords.push(kw);
        break;
      }
    }
  }

  // Voice Detection (Poet, Bestie, Professor, or default to Insider)
  
  // Check for professor voice first (academic topics)
  for (const kw of PROFESSOR_KEYWORDS) {
    if (lower.includes(kw)) {
      voice = 'professor';
      detectedKeywords.push(kw);
      break;
    }
  }

  // Check for poet voice (romantic/dreamy topics)
  if (voice === 'insider') {
    for (const kw of POET_KEYWORDS) {
      if (lower.includes(kw)) {
        voice = 'poet';
        detectedKeywords.push(kw);
        break;
      }
    }
  }

  // Check for bestie voice (fun/party topics)
  if (voice === 'insider') {
    for (const kw of BESTIE_KEYWORDS) {
      if (lower.includes(kw)) {
        voice = 'bestie';
        detectedKeywords.push(kw);
        break;
      }
    }
  }

  // If no keywords matched, defaults remain: insider + balanced

  return { voice, structure, detectedKeywords };
};

/**
 * Voice-to-instruction mapping for Gemini prompts
 */
export const VOICE_INSTRUCTIONS: Record<AutoPilotResult['voice'], string> = {
  insider: 'Write with high taste and authority. Avoid tourist clichés. Use an "IYKYK" (If you know, you know) tone. Focus on hidden gems and insider knowledge.',
  bestie: 'Write in a confident, sassy, female-forward voice. Treat the reader like a close friend. Use punchy, witty language and share genuine excitement.',
  poet: 'Use evocative, sensory-rich language. Focus on atmosphere, emotion, and beauty. Paint vivid word pictures that transport the reader.',
  professor: 'Write with academic authority and educational clarity. Use structured explanations, cite relevant background, and maintain an informative tone.',
};

/**
 * Structure-to-instruction mapping for Gemini prompts
 */
export const STRUCTURE_INSTRUCTIONS: Record<AutoPilotResult['structure'], string> = {
  curated: 'Structure the content as a curated directory. Prioritize specific venues (Hotels, Restaurants, Shops) with address details, vibe checks, and insider recommendations.',
  playbook: 'Structure the content as an educational manual. Use clear steps, bullet points for "How-to" sections, and focus on practical, actionable instructions.',
  balanced: 'Balance educational content with curated recommendations. Mix teaching moments with specific venue suggestions for a well-rounded guide.',
};
