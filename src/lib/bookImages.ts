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

// Image metadata types for provenance tracking
export interface ImageMetadata {
  image_source: 'unsplash' | 'pexels' | 'pixabay' | 'wikimedia' | 'openverse' | 'pollinations' | 'upload' | 'huggingface';
  original_url: string | null;
  image_license: string;
  image_attribution: string;
  archived_at: string;
}

// Archive an external image to permanent storage and return metadata
export async function archiveExternalImage(
  imageUrl: string,
  bookId: string,
  source: 'unsplash' | 'pexels' | 'pixabay' | 'wikimedia' | 'openverse' | 'pollinations' | 'huggingface',
  attribution?: string
): Promise<{ archivedUrl: string; metadata: ImageMetadata } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('archive-image', {
      body: {
        imageUrl,
        bookId,
        source,
        attribution,
      }
    });

    if (error || !data?.archivedUrl) {
      console.error('[archiveExternalImage] Archive failed:', error || 'No archived URL returned');
      return null;
    }

    return {
      archivedUrl: data.archivedUrl,
      metadata: {
        image_source: source,
        original_url: data.originalUrl,
        image_license: data.license,
        image_attribution: data.attribution,
        archived_at: data.archivedAt,
      }
    };
  } catch (err) {
    console.error('[archiveExternalImage] Error:', err);
    return null;
  }
}

// Save image metadata to a book_pages record
export async function saveImageMetadata(
  blockId: string,
  imageUrl: string,
  metadata: ImageMetadata
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('book_pages')
      .update({
        image_url: imageUrl,
        image_source: metadata.image_source,
        original_url: metadata.original_url,
        image_license: metadata.image_license,
        image_attribution: metadata.image_attribution,
        archived_at: metadata.archived_at,
      })
      .eq('id', blockId);

    if (error) {
      console.error('[saveImageMetadata] Update failed:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[saveImageMetadata] Error:', err);
    return false;
  }
}

// Create metadata for user-uploaded images
export function createUploadMetadata(publisherName: string = 'Publisher'): ImageMetadata {
  return {
    image_source: 'upload',
    original_url: null,
    image_license: 'Rights Certified by Publisher',
    image_attribution: `Uploaded by ${publisherName}`,
    archived_at: new Date().toISOString(),
  };
}
