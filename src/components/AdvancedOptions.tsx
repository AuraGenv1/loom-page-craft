import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export interface AdvancedOptionsState {
  voice: 'insider' | 'bestie' | 'poet' | 'professor' | null;
  structure: 'curated' | 'playbook' | 'balanced' | null;
  focusAreas: string[];
}

interface AdvancedOptionsProps {
  options: AdvancedOptionsState;
  onChange: (options: AdvancedOptionsState) => void;
}

const VOICE_OPTIONS = [
  { id: 'insider', label: 'The Insider', tooltipKey: 'tooltip_insider' },
  { id: 'bestie', label: 'The Bestie', tooltipKey: 'tooltip_bestie' },
  { id: 'poet', label: 'The Poet', tooltipKey: 'tooltip_poet' },
  { id: 'professor', label: 'The Professor', tooltipKey: 'tooltip_professor' },
] as const;

const STRUCTURE_OPTIONS = [
  { id: 'curated', label: 'Curated Guide', tooltipKey: 'tooltip_curated' },
  { id: 'playbook', label: 'Playbook', tooltipKey: 'tooltip_playbook' },
  { id: 'balanced', label: 'Balanced', tooltipKey: 'tooltip_balanced' },
] as const;

const FOCUS_OPTIONS = [
  { id: 'history', label: 'History', tooltipKey: 'tooltip_history' },
  { id: 'wellness', label: 'Wellness', tooltipKey: 'tooltip_wellness' },
  { id: 'nightlife', label: 'Nightlife', tooltipKey: 'tooltip_nightlife' },
  { id: 'art', label: 'Art & Design', tooltipKey: 'tooltip_art' },
  { id: 'luxury', label: 'Luxury', tooltipKey: 'tooltip_luxury' },
  { id: 'culture', label: 'Local Culture', tooltipKey: 'tooltip_culture' },
  { id: 'nature', label: 'Nature', tooltipKey: 'tooltip_nature' },
] as const;

// Fallback tooltips (for voice/structure that don't have translations yet)
const TOOLTIP_FALLBACKS: Record<string, string> = {
  tooltip_insider: 'Curated, cool, "If you know, you know"',
  tooltip_bestie: 'Sassy, confident, and witty',
  tooltip_poet: 'Dreamy, flowery, and romantic',
  tooltip_professor: 'Academic, educational, and clear',
  tooltip_curated: 'Focus: Places, Hotels, Restaurants, Shopping',
  tooltip_playbook: 'Focus: Practices, How-to, Rituals, Education',
  tooltip_balanced: 'A 50/50 mix of Teaching and Destinations',
};

const AdvancedOptions = ({ options, onChange }: AdvancedOptionsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

  const handleVoiceChange = (voice: AdvancedOptionsState['voice']) => {
    onChange({ ...options, voice: options.voice === voice ? null : voice });
  };

  const handleStructureChange = (structure: AdvancedOptionsState['structure']) => {
    onChange({ ...options, structure: options.structure === structure ? null : structure });
  };

  const handleFocusToggle = (focusId: string) => {
    const currentFocus = options.focusAreas;
    const newFocus = currentFocus.includes(focusId)
      ? currentFocus.filter(f => f !== focusId)
      : [...currentFocus, focusId];
    onChange({ ...options, focusAreas: newFocus });
  };

  // Helper to get tooltip text (uses translation if available, fallback otherwise)
  const getTooltip = (key: string): string => {
    const translated = t(key);
    // If translation returns the key itself, use fallback
    return translated === key ? (TOOLTIP_FALLBACKS[key] || key) : translated;
  };

  const chipBaseClass = "px-3 py-1.5 text-sm rounded-full transition-colors cursor-pointer select-none";
  const chipInactiveClass = "border border-muted text-muted-foreground hover:border-foreground/50";
  const chipActiveClass = "bg-foreground text-background";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto">
        <span>{t('advancedOptions')}</span>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-6 space-y-6 animate-in slide-in-from-top-2 duration-200">
        <TooltipProvider delayDuration={200}>
          {/* Voice Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('narrativeVoice')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {VOICE_OPTIONS.map((voice) => (
                <Tooltip key={voice.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleVoiceChange(voice.id)}
                      className={cn(
                        chipBaseClass,
                        options.voice === voice.id ? chipActiveClass : chipInactiveClass
                      )}
                    >
                      {voice.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{getTooltip(voice.tooltipKey)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Structure Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('bookStructure')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STRUCTURE_OPTIONS.map((structure) => (
                <Tooltip key={structure.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleStructureChange(structure.id)}
                      className={cn(
                        chipBaseClass,
                        options.structure === structure.id ? chipActiveClass : chipInactiveClass
                      )}
                    >
                      {structure.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p className="text-xs">{getTooltip(structure.tooltipKey)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Focus Areas Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('focusAreas')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {FOCUS_OPTIONS.map((focus) => (
                <Tooltip key={focus.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleFocusToggle(focus.id)}
                      className={cn(
                        chipBaseClass,
                        options.focusAreas.includes(focus.id) ? chipActiveClass : chipInactiveClass
                      )}
                    >
                      {focus.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p className="text-xs">{getTooltip(focus.tooltipKey)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </TooltipProvider>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AdvancedOptions;
