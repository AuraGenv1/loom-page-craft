
# Plan: Comprehensive Legal Content Update & Contact System Implementation

## Summary

This plan implements four major feature areas:

1. **FAQ Content Updates** - Replace specific Q&A content with new legal/commercial text
2. **Terms of Service & Privacy Policy Updates** - Add translation disclaimer banner and new terms
3. **Contact Us Page** - New page with form, database table, and footer link
4. **Admin Settings & Email Notifications** - Platform settings table and email workflow

All user-facing text will use the existing i18n translation system (8 languages).

---

## Part 1: FAQ Content Updates

### Files to Modify
- `src/contexts/LanguageContext.tsx` - Add translation keys for FAQ Q&As
- `src/pages/FAQ.tsx` - Use translations instead of hardcoded strings

### New FAQ Structure (3 questions updated/added)

| Question Key | Question | Answer Summary |
|-------------|----------|----------------|
| `faqOwnership` | "Do I own the guide once it's created?" | Yes for text, note about image licenses |
| `faqTopics` | "What topics can I create books on?" | Travel, Astrology, Culinary, Wellness, etc. |
| `faqReturns` | "Can I return a book?" | Digital: final sale. Print: Amazon policy. |
| `faqCommercial` | "Can I sell my custom manuals commercially?" | (Existing - keep) |
| `faqLocalResources` | "How does local resource data work?" | (Existing - keep) |
| `faqUnique` | "How is my guide different from others?" | (Existing - keep) |
| `faqMultiDevice` | "Can I access my guides on multiple devices?" | (Existing - keep) |

### Translation Keys to Add (all 8 languages)
```typescript
// FAQ Questions
faqOwnershipQ: 'Do I own the guide once it\'s created?',
faqOwnershipA: 'Yes. You own the textual content and the compilation of the guide entirely. You are free to monetize the text as you see fit.\n\nNote on Images: Images selected via third-party libraries (Unsplash, Pexels, Pixabay, Wikimedia) or generated via AI are subject to their respective licenses. While generally free for commercial use, you are responsible for ensuring that specific images—especially those featuring identifiable people, logos, or landmarks—are cleared for your specific commercial use case.',

faqTopicsQ: 'What topics can I create books on?',
faqTopicsA: 'Loom & Page can weave instructional volumes on a vast array of subjects. Our AI architect is adept at crafting guides for Travel & Exploration, Astrology & Esoteric Arts, Culinary Arts, Wellness & Yoga, Gardening, History, Business Management, and Technical Pursuits (like vintage car restoration). Whether you need a practical manual for Leatherworking or a spiritual guide to Tarot, we provide structured, high-quality instruction.',

faqReturnsQ: 'Can I return a book?',
faqReturnsA: 'Digital Downloads (PDF/eBook): Due to the digital nature of these products, all sales are final and non-refundable.\n\nPrinted Copies: Printed books purchased via Amazon are subject to Amazon\'s Return Policy. If your book arrives damaged or with printing errors, please contact Amazon Customer Support directly for a replacement.',
```

---

## Part 2: Terms of Service & Privacy Policy Updates

### Files to Modify
- `src/contexts/LanguageContext.tsx` - Add translation keys
- `src/pages/TermsOfService.tsx` - Add disclaimer banner + new sections
- `src/pages/PrivacyPolicy.tsx` - Add disclaimer banner

### Translation Disclaimer Banner (Top of Both Pages)
```typescript
legalTranslationDisclaimer: 'Note: Translations of these documents are provided for convenience only. In the event of any discrepancy or dispute, the original English version shall prevail and is the legally binding text.',
```

### New Terms Sections to Add

**Refunds & Cancellations Section:**
```typescript
termsRefundsTitle: 'Refunds & Cancellations',
termsRefundsContent: 'All purchases of digital downloads, AI generation credits, or subscriptions are final and non-refundable. Loom & Page is not responsible for printing errors, shipping delays, or quality issues arising from third-party print-on-demand services (e.g., Amazon KDP).',
```

**Branding Rights Section:**
```typescript
termsBrandingTitle: 'Branding Rights',
termsBrandingContent: 'Loom & Page reserves the right to include its logo, name, or \'Powered by\' attribution on the footer or back cover of all generated documents and digital downloads.',
```

### UI Implementation
- Use the existing `Alert` component with a subtle info variant for the disclaimer
- Add 2 new `<section>` blocks at the end of the Terms page

---

## Part 3: Contact Us Page

### Files to Create
- `src/pages/Contact.tsx` - New page with centered form

### Files to Modify
- `src/App.tsx` - Add route `/contact`
- `src/components/Footer.tsx` - Add "Contact Us" link
- `src/contexts/LanguageContext.tsx` - Add form labels, placeholders, notices

### Database Schema (via migration)
```sql
-- Contact Messages Table
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'unread',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert (public form)
CREATE POLICY "Anyone can submit contact messages"
ON public.contact_messages FOR INSERT
WITH CHECK (true);

-- Policy: Only admins can read
CREATE POLICY "Admins can view contact messages"
ON public.contact_messages FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can update (mark as read)
CREATE POLICY "Admins can update contact messages"
ON public.contact_messages FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));
```

### Translation Keys for Contact Form (all 8 languages)
```typescript
// Contact Page
contactTitle: 'Contact Us',
contactSubtitle: 'Have a question or feedback? We\'d love to hear from you.',
contactNameLabel: 'Name',
contactNamePlaceholder: 'Your name',
contactEmailLabel: 'Email',
contactEmailPlaceholder: 'you@example.com',
contactSubjectLabel: 'Subject',
contactSubjectPlaceholder: 'What is this regarding?',
contactMessageLabel: 'Message',
contactMessagePlaceholder: 'Your message...',
contactSubmit: 'Send Message',
contactSubmitting: 'Sending...',
contactSuccess: 'Thank you! Your message has been sent.',
contactResponseTime: 'We aim to respond to all inquiries within 48 hours.',
contactUs: 'Contact Us', // For footer link
```

### Page Design
- Match existing Terms/Privacy page layout (header with Logo, max-w-2xl container)
- Centered form with consistent styling
- "48 hours" notice displayed below the submit button
- Success toast on submission

---

## Part 4: Admin Settings & Email Notifications

### Database Schema (via migration)
```sql
-- Platform Settings Table
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read/update
CREATE POLICY "Admins can view platform settings"
ON public.platform_settings FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update platform settings"
ON public.platform_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Insert default row (will be updated with admin's email during implementation)
INSERT INTO public.platform_settings (support_email) VALUES ('admin@loomandpage.com');

-- Update trigger
CREATE TRIGGER update_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Files to Modify
- `src/pages/Admin.tsx` - Add "Settings" section with email input

### Edge Function: send-contact-notification
```
supabase/functions/send-contact-notification/index.ts
```

**Function Logic:**
1. Receive contact form data (name, email, subject, message)
2. Query `platform_settings` to get current `support_email`
3. Send email via Resend (or Lovable AI email service if configured)
4. Set `Reply-To: customer@email.com` so admin can reply directly
5. Return success/error response

**Email Template:**
- Subject: `New Contact Form: {subject}`
- From: `Loom & Page <noreply@...>`
- To: Support email from platform_settings
- Reply-To: Customer's email
- Body: Name, Email, Subject, Message, Timestamp

### API Key Requirement
The existing `RESEND_API_KEY` secret is NOT configured (checked secrets list). Options:
1. Ask user to add RESEND_API_KEY
2. Implement without email initially (messages stored in DB, admin views in dashboard)

**Recommendation**: Build the full system but gracefully handle missing API key - log warning and skip email send if not configured. Admin can still view messages in dashboard.

---

## Files Summary

| Action | File |
|--------|------|
| Modify | `src/contexts/LanguageContext.tsx` - Add ~40 translation keys × 8 languages |
| Modify | `src/pages/FAQ.tsx` - Use translations, add returns question |
| Modify | `src/pages/TermsOfService.tsx` - Add disclaimer banner + 2 sections |
| Modify | `src/pages/PrivacyPolicy.tsx` - Add disclaimer banner |
| Create | `src/pages/Contact.tsx` - New contact form page |
| Modify | `src/App.tsx` - Add /contact route |
| Modify | `src/components/Footer.tsx` - Add Contact Us link |
| Modify | `src/pages/Admin.tsx` - Add Settings section |
| Create | `supabase/functions/send-contact-notification/index.ts` |
| Migration | Create `contact_messages` table |
| Migration | Create `platform_settings` table |

---

## Translation Key Count

| Category | Keys |
|----------|------|
| FAQ (3 Q&A pairs) | 6 keys |
| Legal Disclaimer | 1 key |
| Terms Sections | 4 keys |
| Contact Form | 13 keys |
| **Total** | 24 keys × 8 languages = 192 translations |

---

## Implementation Order

1. **Database migrations** (contact_messages, platform_settings)
2. **LanguageContext.tsx** - Add all translation keys
3. **FAQ.tsx** - Update with translations
4. **TermsOfService.tsx** - Add banner + sections
5. **PrivacyPolicy.tsx** - Add banner
6. **Contact.tsx** - Create new page
7. **App.tsx** - Add route
8. **Footer.tsx** - Add link
9. **Admin.tsx** - Add Settings section
10. **Edge Function** - send-contact-notification

---

## Testing Checklist

1. **FAQ**: Verify new questions display correctly in all languages
2. **Terms/Privacy**: Verify disclaimer banner appears at top
3. **Contact Form**: 
   - Submit form as guest
   - Verify data saves to database
   - Verify success message displays
   - Verify "48 hours" notice shows
4. **Footer**: Verify "Contact Us" link appears and navigates correctly
5. **Admin Settings**:
   - Verify Settings section appears for admin users
   - Verify email can be updated
6. **Email (if RESEND_API_KEY configured)**:
   - Submit contact form
   - Verify email arrives at support address
   - Verify Reply-To is customer's email
