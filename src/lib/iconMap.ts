import {
  BookOpen,
  Utensils,
  Hammer,
  Leaf,
  Cpu,
  Palette,
  Scale,
  HeartPulse,
  LucideIcon,
} from 'lucide-react';

type IconMapping = {
  keywords: string[];
  icon: LucideIcon;
};

const iconMappings: IconMapping[] = [
  { keywords: ['bake', 'food', 'cook', 'bread', 'kitchen', 'recipe'], icon: Utensils },
  { keywords: ['build', 'wood', 'repair', 'fix', 'diy', 'hammer', 'construct'], icon: Hammer },
  { keywords: ['garden', 'plant', 'flower', 'grow', 'soil', 'tree'], icon: Leaf },
  { keywords: ['tech', 'code', 'computer', 'program', 'develop', 'software', 'web'], icon: Cpu },
  { keywords: ['art', 'draw', 'paint', 'sketch', 'color', 'design', 'watercolor'], icon: Palette },
  { keywords: ['law', 'legal', 'court', 'attorney', 'contract'], icon: Scale },
  { keywords: ['medical', 'health', 'doctor', 'fitness', 'exercise', 'wellness'], icon: HeartPulse },
];

export const getTopicIcon = (topic: string): LucideIcon => {
  const lowerTopic = topic.toLowerCase();
  
  for (const mapping of iconMappings) {
    if (mapping.keywords.some(keyword => lowerTopic.includes(keyword))) {
      return mapping.icon;
    }
  }
  
  return BookOpen;
};

export const iconMap = {
  Utensils,
  Hammer,
  Leaf,
  Cpu,
  Palette,
  Scale,
  HeartPulse,
  BookOpen,
};
