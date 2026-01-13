import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("!!! TEST SCRIPT IS RUNNING !!!");

  // Return a fake success response to prove the update worked
  return new Response(
    JSON.stringify({
      success: true,
      bookId: "test-id-123",
      title: "TEST UPDATE SUCCESSFUL",
      chapters: [],
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
