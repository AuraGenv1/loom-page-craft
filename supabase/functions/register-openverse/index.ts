import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegisterRequest {
  name: string;
  email: string;
  description: string;
}

interface OpenverseResponse {
  client_id: string;
  client_secret: string;
  name: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { name, email, description }: RegisterRequest = await req.json();

    // Validate required fields
    if (!name || !email || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name, email, description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Registering with Openverse API: name="${name}", email="${email}"`);

    // Call Openverse API
    const openverseResponse = await fetch('https://api.openverse.engineering/v1/auth_tokens/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, description }),
    });

    const responseText = await openverseResponse.text();
    console.log(`Openverse API response status: ${openverseResponse.status}`);

    if (!openverseResponse.ok) {
      console.error(`Openverse API error: ${responseText}`);
      
      // Parse error if possible
      let errorMessage = 'Failed to register with Openverse';
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else if (typeof errorData === 'object') {
          // Handle field-specific errors
          const errors = Object.entries(errorData)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('; ');
          if (errors) errorMessage = errors;
        }
      } catch {
        // Use raw text if not JSON
        if (responseText) errorMessage = responseText;
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: openverseResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse successful response
    const data: OpenverseResponse = JSON.parse(responseText);
    
    console.log(`Successfully registered with Openverse. Client ID: ${data.client_id.substring(0, 8)}...`);

    return new Response(
      JSON.stringify({
        client_id: data.client_id,
        client_secret: data.client_secret,
        name: data.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in register-openverse function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
