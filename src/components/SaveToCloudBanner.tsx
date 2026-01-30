import { Button } from "@/components/ui/button";
import { Cloud, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SaveToCloudBannerProps {
  onSignIn: () => void;
  isAuthenticating: boolean;
}

const SaveToCloudBanner = ({ onSignIn, isAuthenticating }: SaveToCloudBannerProps) => {
  const { t } = useLanguage();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className="bg-secondary/50 border border-border rounded-lg p-4 mb-8 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-full">
            <Cloud className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-serif font-medium text-foreground mb-1">{t('saveToCloudTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('saveToCloudDesc')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex gap-3">
        <Button onClick={onSignIn} disabled={isAuthenticating} size="sm">
          {isAuthenticating ? t('signingIn') : t('authSignIn')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setIsDismissed(true)}>
          {t('maybeLater')}
        </Button>
      </div>
    </div>
  );
};

export default SaveToCloudBanner;
