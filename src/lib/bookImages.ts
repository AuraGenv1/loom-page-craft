import { supabase } from "@/integrations/supabase/client";

type UploadParams = {
  path: string;
  data: Blob | File;
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
};

export async function uploadToBookImages(params: UploadParams): Promise<string> {
  const { path, data, contentType, upsert = true, cacheControl = "3600" } = params;

  const { error: uploadError } = await supabase.storage
    .from("book-images")
    .upload(path, data, {
      upsert,
      cacheControl,
      ...(contentType ? { contentType } : {}),
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("book-images").getPublicUrl(path);
  return urlData.publicUrl;
}
