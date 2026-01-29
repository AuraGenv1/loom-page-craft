import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ArchiveRequest {
  imageUrl: string;
  bookId: string;
  source: 'unsplash' | 'pexels' | 'pixabay' | 'wikimedia' | 'openverse';
  license?: string;
  attribution?: string;
}

interface ArchiveResponse {
  archivedUrl: string;
  originalUrl: string;
  source: string;
  license: string;
  attribution: string;
  archivedAt: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageUrl, bookId, source, license, attribution } = await req.json() as ArchiveRequest;

    if (!imageUrl || !bookId || !source) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageUrl, bookId, source' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[archive-image] Archiving ${source} image for book ${bookId}`);
    console.log(`[archive-image] Source URL: ${imageUrl.substring(0, 80)}...`);

    // Download the image from external URL
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!imageResponse.ok) {
      console.error(`[archive-image] Failed to download image: ${imageResponse.status}`);
      return new Response(
        JSON.stringify({ error: `Failed to download image: ${imageResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);

    console.log(`[archive-image] Downloaded ${imageBytes.length} bytes, type: ${contentType}`);

    // Determine file extension from content type
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';

    // Generate unique filename for archival
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = `archived/${bookId}/${timestamp}-${randomSuffix}.${ext}`;

    // Initialize Supabase client with service role for storage upload
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('book-images')
      .upload(fileName, imageBytes, {
        contentType,
        upsert: true,
        cacheControl: '31536000', // Cache for 1 year (permanent archive)
      });

    if (uploadError) {
      console.error(`[archive-image] Upload error:`, uploadError);
      return new Response(
        JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from('book-images').getPublicUrl(fileName);
    const archivedUrl = urlData.publicUrl;

    console.log(`[archive-image] Successfully archived to: ${archivedUrl.substring(0, 80)}...`);

    // Determine license and attribution based on source
    const resolvedLicense = license || getLicenseForSource(source);
    const resolvedAttribution = attribution || getDefaultAttribution(source);

    const response: ArchiveResponse = {
      archivedUrl,
      originalUrl: imageUrl,
      source,
      license: resolvedLicense,
      attribution: resolvedAttribution,
      archivedAt: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[archive-image] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getLicenseForSource(source: string): string {
  switch (source) {
    case 'unsplash':
      return 'Unsplash License';
    case 'pexels':
      return 'Pexels License';
    case 'pixabay':
      return 'Pixabay License';
    case 'wikimedia':
      return 'CC0 Public Domain';
    case 'openverse':
      return 'CC Commercial License';
    default:
      return 'Unknown License';
  }
}

function getDefaultAttribution(source: string): string {
  switch (source) {
    case 'unsplash':
      return 'Photo from Unsplash';
    case 'pexels':
      return 'Photo from Pexels';
    case 'pixabay':
      return 'Image from Pixabay';
    case 'wikimedia':
      return 'Image from Wikimedia Commons';
    case 'openverse':
      return 'Image via Openverse (CC Licensed)';
    default:
      return 'Image source unknown';
  }
}
