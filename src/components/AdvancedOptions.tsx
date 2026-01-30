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
  { id: 'insider', label: 'The Insider', tooltip: 'Curated, cool, "If you know, you know"' },
  { id: 'bestie', label: 'The Bestie', tooltip: 'Sassy, confident, and witty' },
  { id: 'poet', label: 'The Poet', tooltip: 'Dreamy, flowery, and romantic' },
  { id: 'professor', label: 'The Professor', tooltip: 'Academic, educational, and clear' },
] as const;

const STRUCTURE_OPTIONS = [
  { id: 'curated', label: 'Curated Guide', tooltip: 'Focus: Places, Hotels, Restaurants, Shopping' },
  { id: 'playbook', label: 'Playbook', tooltip: 'Focus: Practices, How-to, Rituals, Education' },
  { id: 'balanced', label: 'Balanced', tooltip: 'A 50/50 mix of Teaching and Destinations' },
] as const;

const FOCUS_OPTIONS = [
  { id: 'history', label: 'History', tooltip: 'Ancient stories, heritage sites, and cultural timelines' },
  { id: 'wellness', label: 'Wellness', tooltip: 'Spas, retreats, meditation, and self-care rituals' },
  { id: 'nightlife', label: 'Nightlife', tooltip: 'Bars, clubs, live music, and after-dark scenes' },
  { id: 'art', label: 'Art & Design', tooltip: 'Galleries, architecture, studios, and creative spaces' },
  { id: 'luxury', label: 'Luxury', tooltip: 'High-end experiences, exclusive venues, and premium services' },
  { id: 'culture', label: 'Local Culture', tooltip: 'Traditions, local customs, food markets, and community life' },
  { id: 'nature', label: 'Nature', tooltip: 'Parks, hiking trails, beaches, and outdoor adventures' },
] as const;

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

  const chipBaseClass = "px-3 py-1.5 text-sm rounded-full transition-colors cursor-pointer select-none";
  const chipInactiveClass = "border border-muted text-muted-foreground hover:border-foreground/50";
  const chipActiveClass = "bg-foreground text-background";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto">
        <span>{t('advancedOptions') || 'Advanced Options'}</span>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-6 space-y-6 animate-in slide-in-from-top-2 duration-200">
        <TooltipProvider delayDuration={200}>
          {/* Voice Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('narrativeVoice') || 'Narrative Voice'}
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
                    <p className="text-xs">{voice.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Structure Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('bookStructure') || 'Book Structure'}
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
                    <p className="text-xs">{structure.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Focus Areas Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('focusAreas') || 'Focus Areas'}
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
                    <p className="text-xs">{focus.tooltip}</p>
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
