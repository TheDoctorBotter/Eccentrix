# PT Note Writer

AI-powered **outpatient** physical therapy documentation assistant built with Next.js, TypeScript, React, and Supabase.

## Features

- **Outpatient Note Types**: Daily SOAP notes and PT Evaluations **only**
- **Structured Input Forms**: Comprehensive forms with dropdowns, sliders, and multi-select options
- **AI-Powered Generation**: Uses OpenAI LLM to generate professional documentation
- **Clinic Branding**: Upload clinic logo and letterhead for professional branded documentation
- **Template Manager**: Pre-configured templates optimized for outpatient settings
- **Intervention Library**: 20+ pre-loaded common PT interventions and exercises
- **Export Options**: Copy to clipboard and export branded PDFs
- **Safety Features**: Prominent PHI warning banner and draft documentation alerts
- **Rate Limiting**: Built-in protection (10 requests/minute) to prevent API abuse
- **Data Persistence**: All notes and templates stored securely in Supabase

## Prerequisites

- Node.js 18+ installed
- Supabase account (database is pre-configured)
- OpenAI API key (get one at https://platform.openai.com/api-keys)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

**CRITICAL**: You MUST add your OpenAI API key or the application will not generate notes.

#### Option A: Edit existing .env file
The project includes a `.env` file. Edit it and add your OpenAI API key:

```bash
# Open .env and update:
OPENAI_API_KEY=sk-your-actual-api-key-here
```

#### Option B: Create .env.local (recommended for local development)
```bash
# Copy example file
cp .env.example .env.local

# Edit .env.local and add your key
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**How to get your OpenAI API key:**
1. Visit https://platform.openai.com/api-keys
2. Sign up or log in to your OpenAI account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)
5. Paste it in your `.env` or `.env.local` file
6. Restart the dev server

**Important Notes:**
- Supabase credentials (including service role key) are already configured
- Never commit your API key to version control
- The app will return a 500 error with a clear message if the key is missing
- You need OpenAI API credits for the generation to work
- `SUPABASE_SERVICE_ROLE_KEY` is required for file uploads (branding assets)

### 3. Database Setup

The database is pre-configured with Supabase and includes:
- ✅ All tables created (templates, notes, intervention_library, user_settings)
- ✅ Default templates for **Daily SOAP** and **PT Evaluation** (outpatient only)
- ✅ 20+ pre-loaded PT interventions
- ✅ Row Level Security (RLS) enabled

No additional database setup required!

**First-time setup:**
The database will auto-initialize on first use. If needed, manually seed by visiting:
```
http://localhost:3000/api/seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### 5. Test the Application

1. Click "Create New Note"
2. Select a note type (Daily SOAP Note or PT Evaluation)
3. Fill out the form sections
4. Click "Generate Note"
5. View and copy your generated note

**What to expect:**
- The app will display a red PHI warning banner at the top
- Only 2 note types are available (outpatient focus)
- Rate limiting: 10 requests per minute maximum
- Generated notes are marked as DRAFT and must be clinician-reviewed

### 6. Build for Production

```bash
npm run build
npm start
```

## Usage Guide

### Creating a Note

1. **Dashboard**: Click "Create New Note" from the home page
2. **Select Note Type**: Choose from **Daily SOAP** or **PT Evaluation** (outpatient only)
3. **Fill Forms**: Complete the structured input forms:
   - Patient Context (diagnosis, reason for visit)
   - Subjective (symptoms, pain level, functional limits)
   - Objective (interventions, measurements, observations)
   - Assessment (progression, skilled need, response to treatment)
   - Plan (frequency, next session focus, HEP)
4. **Generate**: Click "Generate Note" to create professional documentation
5. **Review**: View and copy the generated note (marked as DRAFT)

### Managing Templates

1. Navigate to **Templates** from the dashboard
2. View templates organized by note type
3. Click **New Template** to create a custom template
4. Edit existing templates to customize:
   - Template content with placeholders
   - Style settings (verbosity, tone, acronym usage)
   - Set as default for a note type
5. Use placeholders in templates:
   - `{{patient_context}}` - Patient information
   - `{{subjective}}` - Subjective findings
   - `{{objective}}` - Objective findings
   - `{{assessment}}` - Clinical assessment
   - `{{plan}}` - Treatment plan

### Clinic Branding

**Add your clinic's professional branding to all documentation:**

1. Navigate to **Settings** > **Manage Branding**
2. Upload your assets:
   - **Logo** (PNG/JPEG/WebP, max 5MB) - Displayed with contact info
   - **Letterhead** (PNG/JPEG/WebP, max 5MB) - Full-width header image
3. Enter clinic information:
   - Clinic name, address, phone, email, website
4. Toggle **"Show branding in notes"** to enable/disable
5. Preview your branding in real-time

**Branding Features:**
- ✅ Appears at the top of generated notes (when enabled)
- ✅ Included in PDF exports via "Branded PDF" button
- ✅ Copy note with branding header using "Copy Note" button
- ✅ Choose between logo+text or full letterhead display
- ✅ All assets stored securely in Supabase Storage
- ✅ Server-side uploads with proper authentication

**Storage Setup:**
The Supabase Storage bucket "branding" is already created and configured. If you encounter upload errors:
1. Verify both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env`
2. Check that the "branding" bucket exists in Supabase Dashboard > Storage
3. Ensure the bucket is set to "Public" for easier image access
4. Restart the dev server after changing environment variables

**Note:** Branding does not contain PHI. It's general clinic information only.

### Intervention Library

The application includes a pre-loaded library of common PT interventions:
- Therapeutic Exercise (strengthening, stretching, core)
- Manual Therapy (joint mobilization, soft tissue)
- Gait Training
- Balance Training
- Neuromuscular Re-education
- Functional Training
- Modalities (ice, heat, e-stim, ultrasound)
- Patient Education

When documenting objective findings, select interventions from the library and add specific dosage and cues.

## Important Safety Notes

### PHI Protection
**DO NOT ENTER PROTECTED HEALTH INFORMATION (PHI)**
- Never enter patient names, dates of birth, or addresses
- Never enter medical record numbers or Social Security numbers
- Use generic identifiers only (e.g., "Patient A", "Case 123")

### Draft Documentation
All generated notes are **DRAFTS** and must be:
- Reviewed by a licensed clinician
- Verified for accuracy and completeness
- Approved before use in patient records

### Clinical Responsibility
This tool assists with documentation but does not replace:
- Clinical judgment
- Professional expertise
- Proper examination and evaluation
- Compliance with state practice acts and facility policies

## Technology Stack

- **Frontend**: Next.js 13 (App Router), React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI API (GPT-4 or compatible)
- **Deployment**: Netlify-ready configuration

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── generate-note/ # LLM note generation
│   │   ├── templates/     # Template CRUD
│   │   ├── notes/         # Note CRUD
│   │   ├── interventions/ # Intervention library
│   │   └── seed/          # Database seeding
│   ├── new/              # Note creation wizard
│   ├── notes/[id]/       # Note detail view
│   ├── templates/        # Template manager
│   ├── settings/         # Settings page
│   └── page.tsx          # Dashboard
├── components/
│   ├── note-wizard/      # Form components
│   └── ui/               # Reusable UI components
├── lib/
│   ├── supabase.ts       # Database client
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Utility functions
└── .env.example          # Environment template
```

## API Routes

### POST /api/generate-note
Generates a note using the LLM.

**Rate Limit**: 10 requests per minute per IP

**Supported Note Types**: `daily_soap`, `pt_evaluation` only

**Request Body:**
```json
{
  "noteType": "daily_soap",
  "inputData": { /* form data */ },
  "template": "template content",
  "styleSettings": { /* style config */ }
}
```

**Response (200):**
```json
{
  "note": "Generated note text",
  "billing_justification": "Justification text",
  "hep_summary": "HEP summary"
}
```

**Error Responses:**
- `400`: Missing fields or invalid note type
- `429`: Rate limit exceeded (10/minute)
- `500`: OpenAI API key not configured or API error

### GET /api/templates
Fetches all templates, optionally filtered by note type.

### GET /api/notes
Fetches recent notes with pagination.

### GET /api/interventions
Fetches the intervention library.

### POST /api/seed
Seeds the database with default templates and interventions (runs automatically on first load).

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for note generation | Yes |
| `OPENAI_API_BASE` | Custom API base URL (optional) | No |
| `OPENAI_MODEL` | Model to use (default: gpt-4-turbo-preview) | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-side) | Auto-configured |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side) | Auto-configured |
| `SUPABASE_URL` | Supabase project URL (server-side, for file uploads) | Auto-configured |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side, for file uploads) | Auto-configured |

## Troubleshooting

### Database Not Seeding
If templates or interventions aren't loading:
1. Open browser console
2. Check for errors during initialization
3. Manually trigger seeding by calling `/api/seed` via POST request

### API Key Errors
If note generation fails:
1. Verify `OPENAI_API_KEY` is set in `.env`
2. Check the API key is valid and has credits
3. Restart the development server after changing `.env`

### Build Errors
If the build fails:
```bash
npm run typecheck  # Check for TypeScript errors
npm run lint       # Check for linting issues
```

### File Upload Errors (Branding)
If you can't upload logo or letterhead files:
1. **Check Environment Variables**: Ensure both are set in `.env`:
   - `SUPABASE_URL` (server-side URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (service role key)
2. **Verify Storage Bucket**:
   - Go to Supabase Dashboard > Storage
   - Confirm "branding" bucket exists
   - Make sure it's set to "Public" access
3. **Check File Requirements**:
   - Supported formats: PNG, JPEG, WebP
   - Maximum file size: 5MB
   - Valid file extension required
4. **Console Errors**: Check browser console and server logs for detailed error messages
5. **Restart Server**: After changing `.env`, restart the development server

**Common Errors:**
- "signature verification failed" → Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` match your project
- "Bucket not found" → Create the "branding" bucket in Supabase Dashboard > Storage
- "Missing Supabase credentials" → Verify environment variables are set correctly

## License

This project is for educational and professional use. Ensure compliance with HIPAA and local regulations when handling patient data.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the code comments
3. Verify environment configuration

---

**Built with care for physical therapy professionals** 🏥
