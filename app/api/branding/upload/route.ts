import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('Upload route - Using service role key:', Boolean(supabaseServiceKey));
    console.log('Upload route - Supabase URL:', supabaseUrl ? 'configured' : 'missing');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables for upload');
      return NextResponse.json(
        {
          error: 'Server configuration error: Missing Supabase credentials. Please check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!type || (type !== 'logo' && type !== 'letterhead')) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "logo" or "letterhead"' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG, JPEG, and WebP images are allowed' },
        { status: 400 }
      );
    }

    const fileExt = file.name.split('.').pop();
    const timestamp = Date.now();
    const fileName = `${type}-${timestamp}.${fileExt}`;
    const filePath = `clinic/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error } = await supabaseAdmin.storage
      .from('branding')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

    if (error) {
      console.error('Error uploading file to Supabase Storage:', error);

      if (error.message.includes('Bucket not found')) {
        return NextResponse.json(
          { error: 'Storage bucket not configured. Please see README for setup instructions.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('branding')
      .getPublicUrl(data.path);

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      path: data.path,
    });
  } catch (error) {
    console.error('Error in branding upload:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
