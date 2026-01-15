import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const BUCKET_NAME = 'branding';

export async function POST(request: NextRequest) {
  try {
    console.log('[Branding Upload] Starting upload request');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      console.error('[Branding Upload] SUPABASE_URL is not configured');
      return NextResponse.json(
        {
          error: 'Missing SUPABASE_URL',
          details: 'Server configuration error. SUPABASE_URL environment variable is not set in .env file.',
        },
        { status: 500 }
      );
    }

    if (!supabaseServiceKey) {
      console.error('[Branding Upload] SUPABASE_SERVICE_ROLE_KEY is not configured');
      return NextResponse.json(
        {
          error: 'Missing SUPABASE_SERVICE_ROLE_KEY',
          details: 'Server configuration error. SUPABASE_SERVICE_ROLE_KEY environment variable is not set in .env file.',
        },
        { status: 500 }
      );
    }

    console.log('[Branding Upload] Environment diagnostics:');
    console.log('  - URL prefix:', supabaseUrl.substring(0, 35));
    console.log('  - URL full length:', supabaseUrl.length);
    console.log('  - Service key length:', supabaseServiceKey.length);
    console.log('  - Service key prefix:', supabaseServiceKey.substring(0, 3));
    console.log('  - Service key starts with eyJ:', supabaseServiceKey.startsWith('eyJ'));

    if (!supabaseServiceKey.startsWith('eyJ')) {
      console.error('[Branding Upload] Service key does not start with "eyJ" - likely malformed JWT');
      return NextResponse.json(
        {
          error: 'Invalid SUPABASE_SERVICE_ROLE_KEY',
          details: 'The service role key appears to be malformed. It should be a JWT token starting with "eyJ". Please verify you copied the complete key from Supabase Dashboard > Settings > API.',
        },
        { status: 500 }
      );
    }

    if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
      console.error('[Branding Upload] SUPABASE_URL appears malformed:', supabaseUrl.substring(0, 35));
      return NextResponse.json(
        {
          error: 'Invalid SUPABASE_URL',
          details: 'The Supabase URL appears to be malformed. It should be in the format: https://xxx.supabase.co',
        },
        { status: 500 }
      );
    }

    console.log('[Branding Upload] Creating Supabase admin client');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    console.log('[Branding Upload] File info:', {
      hasFile: !!file,
      type,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
    });

    if (!file) {
      console.error('[Branding Upload] No file provided');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!type || (type !== 'logo' && type !== 'letterhead')) {
      console.error('[Branding Upload] Invalid type:', type);
      return NextResponse.json(
        { error: 'Invalid type. Must be "logo" or "letterhead"' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      console.error('[Branding Upload] File too large:', file.size);
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error('[Branding Upload] Invalid file type:', file.type);
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG, JPEG, and WebP images are allowed' },
        { status: 400 }
      );
    }

    const fileExt = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const fileName = `${type}-${timestamp}.${fileExt}`;
    const filePath = `branding/${fileName}`;

    console.log('[Branding Upload] Preparing upload to path:', filePath);

    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    console.log('[Branding Upload] Uploading to Supabase Storage bucket:', BUCKET_NAME);
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileData, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[Branding Upload] Upload error:', JSON.stringify(uploadError));
      console.error('[Branding Upload] Error name:', uploadError.name);
      console.error('[Branding Upload] Error message:', uploadError.message);

      if (uploadError.message.includes('Bucket not found')) {
        return NextResponse.json(
          {
            error: 'Storage bucket not found',
            details: `The "${BUCKET_NAME}" bucket does not exist. Please create it in Supabase Dashboard > Storage.`,
          },
          { status: 500 }
        );
      }

      if (uploadError.message.includes('signature') || uploadError.message.includes('JWT')) {
        console.error('[Branding Upload] Signature verification failed - credentials mismatch detected');
        return NextResponse.json(
          {
            error: 'Authentication failed - Signature verification failed',
            details: 'The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY do not match or belong to different projects. Please verify both values are from the same Supabase project at Dashboard > Settings > API.',
          },
          { status: 500 }
        );
      }

      if (uploadError.message.includes('Invalid API key')) {
        return NextResponse.json(
          {
            error: 'Invalid service role key',
            details: 'The SUPABASE_SERVICE_ROLE_KEY is invalid or has been revoked. Please verify it matches the service_role key in Supabase Dashboard > Settings > API.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: 'Upload failed',
          details: `Supabase Storage error: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    console.log('[Branding Upload] Upload successful:', uploadData.path);

    console.log('[Branding Upload] Creating signed URL...');
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365);

    if (signedUrlError) {
      console.error('[Branding Upload] Signed URL error:', JSON.stringify(signedUrlError));
      return NextResponse.json(
        {
          error: 'Failed to create signed URL',
          details: signedUrlError.message,
        },
        { status: 500 }
      );
    }

    console.log('[Branding Upload] Success - returning URL');

    return NextResponse.json({
      url: signedUrlData.signedUrl,
      path: uploadData.path,
    });
  } catch (error) {
    console.error('[Branding Upload] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[Branding Upload] Error stack:', errorStack);

    return NextResponse.json(
      {
        error: errorMessage,
        details: 'An unexpected error occurred during upload. Check server logs for details.',
      },
      { status: 500 }
    );
  }
}
