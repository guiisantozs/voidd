import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createVerificationHandler } from './handler.js';

// Managed runtime variables only. Never return or log credentials or tokens.
Deno.serve(createVerificationHandler({
  makeClient: createClient,
  url: Deno.env.get('SUPABASE_URL'),
  publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: (Deno.env.get('VOID_ALLOWED_ORIGINS') || 'https://void-lake-ten.vercel.app').split(',').map(origin => origin.trim()).filter(Boolean),
}));
