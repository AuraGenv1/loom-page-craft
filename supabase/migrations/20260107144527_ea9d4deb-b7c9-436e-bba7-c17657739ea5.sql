-- Enable realtime for the books table so chapter updates stream to the UI
ALTER PUBLICATION supabase_realtime ADD TABLE public.books;