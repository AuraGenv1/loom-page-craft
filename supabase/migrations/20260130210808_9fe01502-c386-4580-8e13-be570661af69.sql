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

-- Platform Settings Table
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read
CREATE POLICY "Admins can view platform settings"
ON public.platform_settings FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can update
CREATE POLICY "Admins can update platform settings"
ON public.platform_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Insert default row
INSERT INTO public.platform_settings (support_email) VALUES ('admin@loomandpage.com');

-- Update trigger for platform_settings
CREATE TRIGGER update_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();