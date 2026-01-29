import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Patch = Record<string, unknown>;

const ALLOWED_PATCH_KEYS = new Set([
  "content",
  "image_url",
  "image_source",
  "original_url",
  "image_license",
  "image_attribution",
  "archived_at",
]);

function sanitizePatch(patch: Patch): Patch {
  const out: Patch = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (ALLOWED_PATCH_KEYS.has(k)) out[k] = v;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bookId, blockId, patch, sessionId } = await req.json();
    if (!bookId || !blockId || !patch || typeof patch !== "object") {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Identify user (optional)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
    let userId: string | null = null;
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    // Authorize against book ownership OR session ownership for guest books
    const { data: bookRow, error: bookErr } = await supabase
      .from("books")
      .select("id, user_id, session_id")
      .eq("id", bookId)
      .maybeSingle();

    if (bookErr || !bookRow) {
      return new Response(JSON.stringify({ ok: false, error: "Book not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwnedByUser = !!userId && bookRow.user_id === userId;
    const isGuestSessionBook = !bookRow.user_id && !!sessionId && bookRow.session_id === sessionId;

    if (!isOwnedByUser && !isGuestSessionBook) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safePatch = sanitizePatch(patch as Patch);
    if (Object.keys(safePatch).length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Empty patch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: updated, error: updErr } = await supabase
      .from("book_pages")
      .update(safePatch)
      .eq("id", blockId)
      .eq("book_id", bookId)
      .select(
        "id, book_id, chapter_number, page_order, block_type, content, image_url, image_source, original_url, image_license, image_attribution, archived_at"
      )
      .maybeSingle();

    if (updErr || !updated) {
      return new Response(JSON.stringify({ ok: false, error: updErr?.message || "Update failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, page: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[update-book-page] Error:", error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
