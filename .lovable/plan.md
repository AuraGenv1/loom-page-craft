

# Plan: Fix Remaining Translation Issues

## Summary

This plan addresses four critical translation gaps and a UI width issue:

1. **"Insert Page Before/After" in English** - The full-access menu items are hardcoded while locked versions use translations
2. **"Key Takeaway" still in English** - Need to investigate if this is a rendering issue or AI-generated content issue
3. **Auth Modal translation** - All 30+ strings in AuthModal.tsx are hardcoded in English
4. **SaveToCloudBanner translation** - All strings are hardcoded in English
5. **Dropdown width too narrow** - Menu items wrap to 2 lines

---

## Technical Analysis

### Issue 1: "Insert Page Before/After" in PageViewer.tsx

**Problem**: Lines 2432-2444 show that for `hasFullAccess` users, the insert page options are hardcoded:
```typescript
// For hasFullAccess (hardcoded - BUG):
Insert Page Before

// For guests (correctly uses translation):
{t('insertPageBefore')}
```

**Fix**: Use `t('insertPageBefore')` and `t('insertPageAfter')` for both cases.

### Issue 2: "Key Takeaway" Still in English

**Analysis**: The KeyTakeawayPage component DOES receive and use `keyTakeawayLabel` prop correctly. The translation keys exist in all 8 languages. 

**Potential causes**:
1. The block type coming from AI is not `key_takeaway` - could be rendering as generic text
2. The translation is happening but the AI content itself contains "Key Takeaway" as part of the text

Looking at the screenshot, I can see the French book has "Key Takeaway" as a section header IN the content, not as a block label. This suggests the AI is generating "Key Takeaway" as part of the text content rather than using the proper block type.

**Solution**: The AI prompt in edge functions needs to be strengthened to not include "Key Takeaway" as text - it should only use the `key_takeaway` block type. However, for existing content, we also need a fallback to detect and replace "Key Takeaway" text.

### Issue 3: Auth Modal Translation (30+ strings)

All strings in `AuthModal.tsx` are hardcoded:
- "Join LOOM & PAGE"
- "Create an account"
- "Welcome back"
- "Reset password"
- "Save your guides to the cloud and access them anywhere."
- "Continue with Google"
- "Sign up with Email"
- "Already have an account? Sign in"
- Form labels: "Name (optional)", "Email", "Password"
- Button text: "Create account", "Sign in", "Send reset link"
- Links: "Forgot password?", "Don't have an account?", "Back to options", "Back to login"
- Placeholders: "Your name", "you@example.com", "At least 6 characters", "Your password"

### Issue 4: SaveToCloudBanner Translation

Hardcoded strings:
- "Save your guide to the cloud"
- "Sign in to save this guide permanently and access it from any device."
- "Sign in" / "Signing in..."
- "Maybe later"

### Issue 5: Dropdown Width

**Current**: `className="w-56"` (224px) - too narrow for French translations like "Insérer une Page Avant"

**Fix**: Change to `className="w-72"` (288px) or `min-w-[280px]` to accommodate longer translations

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/LanguageContext.tsx` | Add ~30 new translation keys for Auth Modal and SaveToCloudBanner |
| `src/components/PageViewer.tsx` | Fix "Insert Page" translations for full-access users, widen dropdown |
| `src/components/AuthModal.tsx` | Import useLanguage, use t() for all strings |
| `src/components/SaveToCloudBanner.tsx` | Import useLanguage, use t() for all strings |
| `supabase/functions/generate-book-blocks/index.ts` | Strengthen prompt to translate "KEY TAKEAWAY" label in block content |
| `supabase/functions/generate-chapter-blocks/index.ts` | Same prompt fix |

---

## New Translation Keys Required

### Auth Modal Keys
```typescript
// Auth Modal Titles
authJoinTitle: 'Join LOOM & PAGE',
authCreateAccount: 'Create an account',
authWelcomeBack: 'Welcome back',
authResetPassword: 'Reset password',

// Auth Modal Content
authSaveToCloud: 'Save your guides to the cloud and access them anywhere.',
authContinueGoogle: 'Continue with Google',
authSignUpEmail: 'Sign up with Email',
authAlreadyHaveAccount: 'Already have an account?',
authDontHaveAccount: "Don't have an account?",
authSignIn: 'Sign in',
authSignUp: 'Sign up',
authBackToOptions: 'Back to options',
authBackToLogin: 'Back to login',
authForgotPassword: 'Forgot password?',
authSendResetLink: 'Send reset link',
authResetEmailSent: 'Enter your email and we\'ll send you a link to reset your password.',

// Form Labels
formName: 'Name (optional)',
formEmail: 'Email',
formPassword: 'Password',
formCreateAccount: 'Create account',

// Placeholders
placeholderName: 'Your name',
placeholderEmail: 'you@example.com',
placeholderPassword6: 'At least 6 characters',
placeholderPassword: 'Your password',

// OR separator
orSeparator: 'or',
```

### SaveToCloudBanner Keys
```typescript
// SaveToCloudBanner
saveToCloudTitle: 'Save your guide to the cloud',
saveToCloudDesc: 'Sign in to save this guide permanently and access it from any device.',
signingIn: 'Signing in...',
maybeLater: 'Maybe later',
```

---

## French Translation Examples

```typescript
fr: {
  // Auth Modal
  authJoinTitle: 'Rejoindre LOOM & PAGE',
  authCreateAccount: 'Créer un compte',
  authWelcomeBack: 'Bon retour',
  authResetPassword: 'Réinitialiser le mot de passe',
  authSaveToCloud: 'Sauvegardez vos guides dans le cloud et accédez-y partout.',
  authContinueGoogle: 'Continuer avec Google',
  authSignUpEmail: "S'inscrire par e-mail",
  authAlreadyHaveAccount: 'Vous avez déjà un compte ?',
  authDontHaveAccount: "Vous n'avez pas de compte ?",
  authSignIn: 'Se connecter',
  authSignUp: "S'inscrire",
  authBackToOptions: 'Retour aux options',
  authBackToLogin: 'Retour à la connexion',
  authForgotPassword: 'Mot de passe oublié ?',
  authSendResetLink: 'Envoyer le lien',
  authResetEmailSent: 'Entrez votre e-mail et nous vous enverrons un lien pour réinitialiser votre mot de passe.',
  
  // Form Labels
  formName: 'Nom (optionnel)',
  formEmail: 'E-mail',
  formPassword: 'Mot de passe',
  formCreateAccount: 'Créer le compte',
  
  // Placeholders
  placeholderName: 'Votre nom',
  placeholderEmail: 'vous@exemple.com',
  placeholderPassword6: 'Au moins 6 caractères',
  placeholderPassword: 'Votre mot de passe',
  
  // OR separator
  orSeparator: 'ou',
  
  // SaveToCloudBanner
  saveToCloudTitle: 'Sauvegardez votre guide dans le cloud',
  saveToCloudDesc: 'Connectez-vous pour sauvegarder ce guide et y accéder depuis n\'importe quel appareil.',
  signingIn: 'Connexion...',
  maybeLater: 'Plus tard',
}
```

---

## Implementation Details

### PageViewer.tsx - Fix Insert Page Translations

**Lines 2432-2444**: Change hardcoded text to use translations:
```typescript
// Before:
Insert Page Before

// After:
{t('insertPageBefore')}
```

### PageViewer.tsx - Widen Dropdown

**Line 2407**: Change width class:
```typescript
// Before:
<DropdownMenuContent align="center" className="w-56">

// After:
<DropdownMenuContent align="center" className="min-w-[280px]">
```

This ensures menu items fit on one line while not being excessively wide.

### AuthModal.tsx - Add Translations

Import the hook and use translation keys for all strings:
```typescript
import { useLanguage } from '@/contexts/LanguageContext';

const AuthModal = ({ ... }) => {
  const { t } = useLanguage();
  
  // In DialogTitle:
  {view === "options" && t('authJoinTitle')}
  
  // Button text:
  {t('authContinueGoogle')}
  
  // etc.
};
```

### SaveToCloudBanner.tsx - Add Translations

```typescript
import { useLanguage } from '@/contexts/LanguageContext';

const SaveToCloudBanner = ({ ... }) => {
  const { t } = useLanguage();
  
  return (
    <h3>{t('saveToCloudTitle')}</h3>
    <p>{t('saveToCloudDesc')}</p>
    <Button>{isAuthenticating ? t('signingIn') : t('authSignIn')}</Button>
    <Button variant="ghost">{t('maybeLater')}</Button>
  );
};
```

---

## Key Takeaway Issue - Additional Context

Looking more carefully at the screenshot, the text shows:

```
Key Takeaway

Choisir un hôtel de prestige à Venise...
```

This is NOT using the KeyTakeawayPage component styling (which has a left border accent). Instead, it appears to be a heading or text block with "Key Takeaway" as literal text content.

**Root Cause**: The AI is generating blocks like:
```json
{
  "block_type": "heading",
  "content": { "text": "Key Takeaway", "level": 3 }
}
```

Instead of:
```json
{
  "block_type": "key_takeaway",
  "content": { "text": "Choisir un hôtel..." }
}
```

**Solution**: Update edge function prompts to explicitly instruct:
1. Use `key_takeaway` block type, NOT heading with "Key Takeaway" text
2. The label is rendered by the UI - do not include it in content
3. In non-English languages, the UI will display the translated label

---

## Testing Checklist

After implementation:
1. Switch to French and open Page Tools menu:
   - Verify "Insert Page Before/After" show French translations
   - Verify all menu items fit on one line (except B&W description)
2. Generate a new book in French:
   - Verify Key Takeaway blocks use the translated label "POINT CLÉ"
3. Click "Dashboard" to trigger auth prompt:
   - Verify Auth Modal shows French translations
   - Verify all form labels, buttons, and links are in French
4. With a book generated but not signed in:
   - Verify SaveToCloudBanner shows French text
5. Test all 8 languages for consistency

