import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UpdateOfferEmailRequest {
  to: string;
  userName: string;
  bookTitle: string;
  currentYear: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service is not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Dynamic import for Resend
    const { Resend } = await import("https://esm.sh/resend@2.0.0");
    const resend = new Resend(RESEND_API_KEY);
    const { to, userName, bookTitle, currentYear }: UpdateOfferEmailRequest = await req.json();

    console.log(`Sending update offer email to ${to} for book: ${bookTitle}`);

    const emailResponse = await resend.emails.send({
      from: "Loom & Page <onboarding@resend.dev>",
      to: [to],
      subject: `Your ${bookTitle} guide has a new ${currentYear} Edition available!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 30px 0; border-bottom: 1px solid #eee;">
            <p style="letter-spacing: 0.3em; font-size: 12px; color: #888; margin: 0;">LOOM & PAGE</p>
          </div>
          
          <div style="padding: 40px 20px;">
            <h1 style="font-size: 28px; font-weight: normal; margin-bottom: 20px;">
              Hello, ${userName || 'Artisan'}
            </h1>
            
            <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
              Great news! A fresh <strong>${currentYear} Edition</strong> of your guide is now available:
            </p>
            
            <div style="background: #f9f9f9; border-left: 3px solid #333; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 20px; margin: 0 0 10px 0;">${bookTitle}</h2>
              <p style="color: #666; font-style: italic; margin: 0;">Updated with the latest techniques and insights</p>
            </div>
            
            <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
              As a valued member of our artisan community, you can update your edition for free. 
              Simply visit your Dashboard and click "Update Edition" on your guide.
            </p>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="https://loomandpage.com/dashboard" 
                 style="display: inline-block; background: #1a1a1a; color: #fff; padding: 14px 35px; text-decoration: none; font-size: 14px; letter-spacing: 0.1em;">
                VIEW YOUR LIBRARY
              </a>
            </div>
            
            <p style="font-size: 14px; color: #888; margin-top: 40px;">
              Woven with care,<br>
              <strong>The Loom & Page Team</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 30px 0; border-top: 1px solid #eee;">
            <p style="font-size: 11px; color: #aaa; margin: 0;">
              © ${currentYear} Loom & Page. All rights reserved.
            </p>
            <p style="font-size: 11px; color: #aaa; margin: 10px 0 0 0;">
              AI-generated content for creative inspiration only.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-update-offer function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
