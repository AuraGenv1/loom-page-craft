-- Add 'quote' and 'divider' to the page_block_type enum
ALTER TYPE public.page_block_type ADD VALUE IF NOT EXISTS 'quote';
ALTER TYPE public.page_block_type ADD VALUE IF NOT EXISTS 'divider';