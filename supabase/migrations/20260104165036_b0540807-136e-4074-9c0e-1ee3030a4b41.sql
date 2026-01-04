-- Create saved_projects table for authenticated users
CREATE TABLE public.saved_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);

-- Enable Row Level Security
ALTER TABLE public.saved_projects ENABLE ROW LEVEL SECURITY;

-- Users can only view their own saved projects
CREATE POLICY "Users can view their own saved projects"
ON public.saved_projects
FOR SELECT
USING (auth.uid() = user_id);

-- Users can save projects to their own account
CREATE POLICY "Users can save their own projects"
ON public.saved_projects
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own saved projects
CREATE POLICY "Users can delete their own saved projects"
ON public.saved_projects
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for faster user lookups
CREATE INDEX idx_saved_projects_user_id ON public.saved_projects(user_id);