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
  { id: 'insider', labelKey: 'voice_insider', tooltipKey: 'tooltip_insider' },
  { id: 'bestie', labelKey: 'voice_bestie', tooltipKey: 'tooltip_bestie' },
  { id: 'poet', labelKey: 'voice_poet', tooltipKey: 'tooltip_poet' },
  { id: 'professor', labelKey: 'voice_professor', tooltipKey: 'tooltip_professor' },
] as const;

const STRUCTURE_OPTIONS = [
  { id: 'curated', labelKey: 'structure_curated', tooltipKey: 'tooltip_curated' },
  { id: 'playbook', labelKey: 'structure_playbook', tooltipKey: 'tooltip_playbook' },
  { id: 'balanced', labelKey: 'structure_balanced', tooltipKey: 'tooltip_balanced' },
] as const;

const FOCUS_OPTIONS = [
  { id: 'history', labelKey: 'focus_history', tooltipKey: 'tooltip_history' },
  { id: 'wellness', labelKey: 'focus_wellness', tooltipKey: 'tooltip_wellness' },
  { id: 'nightlife', labelKey: 'focus_nightlife', tooltipKey: 'tooltip_nightlife' },
  { id: 'art', labelKey: 'focus_art', tooltipKey: 'tooltip_art' },
  { id: 'luxury', labelKey: 'focus_luxury', tooltipKey: 'tooltip_luxury' },
  { id: 'culture', labelKey: 'focus_culture', tooltipKey: 'tooltip_culture' },
  { id: 'nature', labelKey: 'focus_nature', tooltipKey: 'tooltip_nature' },
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
                      {t(voice.labelKey)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{t(voice.tooltipKey)}</p>
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
                      {t(structure.labelKey)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p className="text-xs">{t(structure.tooltipKey)}</p>
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
                      {t(focus.labelKey)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p className="text-xs">{t(focus.tooltipKey)}</p>
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
