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

    // Openverse API endpoint - note: no trailing slash to avoid redirects
    const apiUrl = 'https://api.openverse.org/v1/auth_tokens/register/';
    
    const requestBody = JSON.stringify({ name, email, description });
    console.log(`Request body: ${requestBody}`);

    // Call Openverse API with explicit settings
    const openverseResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: requestBody,
      redirect: 'manual', // Don't auto-follow redirects that might change POST to GET
    });

    // Handle redirect manually if needed
    if (openverseResponse.status >= 300 && openverseResponse.status < 400) {
      const redirectUrl = openverseResponse.headers.get('Location');
      console.log(`Redirect detected to: ${redirectUrl}`);
      
      if (redirectUrl) {
        // Follow redirect with POST
        const redirectResponse = await fetch(redirectUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: requestBody,
        });
        
        const redirectText = await redirectResponse.text();
        console.log(`Redirect response status: ${redirectResponse.status}`);
        
        if (!redirectResponse.ok) {
          console.error(`Openverse API error after redirect: ${redirectText}`);
          return new Response(
            JSON.stringify({ error: redirectText || 'Failed to register with Openverse' }),
            { status: redirectResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const data: OpenverseResponse = JSON.parse(redirectText);
        console.log(`Successfully registered with Openverse. Client ID: ${data.client_id.substring(0, 8)}...`);
        
        return new Response(
          JSON.stringify({
            client_id: data.client_id,
            client_secret: data.client_secret,
            name: data.name,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const responseText = await openverseResponse.text();
    console.log(`Openverse API response status: ${openverseResponse.status}`);
    console.log(`Openverse API response: ${responseText.substring(0, 500)}`);

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
