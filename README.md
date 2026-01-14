# PT Note Writer

AI-powered physical therapy documentation assistant built with Next.js, TypeScript, React, and Supabase.

## Features

- **Multiple Note Types**: Daily SOAP notes, PT Evaluations, Progress Notes, Discharge Summaries, and School-Based IEP notes
- **Structured Input Forms**: Comprehensive forms with dropdowns, sliders, and multi-select options
- **AI-Powered Generation**: Uses OpenAI-compatible LLMs to generate professional documentation
- **Template Manager**: Create and customize templates for each note type
- **Intervention Library**: Pre-loaded library of common PT interventions and exercises
- **Export Options**: Copy to clipboard and export to PDF
- **Safety Features**: Built-in PHI warnings and draft documentation alerts
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

Copy the example environment file and add your OpenAI API key:

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**Note**: Supabase credentials are automatically configured in the environment.

### 3. Initialize Database

The database will be automatically initialized with default templates and interventions when you first run the application. The schema includes:

- **Templates table**: Stores note templates with style settings
- **Notes table**: Stores generated notes with input data
- **Intervention library table**: Pre-loaded PT interventions
- **User settings table**: Application preferences

### 4. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 5. Build for Production

```bash
npm run build
npm start
```

## Usage Guide

### Creating a Note

1. **Dashboard**: Click "Create New Note" from the home page
2. **Select Note Type**: Choose from Daily SOAP, PT Evaluation, Progress Note, Discharge Summary, or School IEP
3. **Fill Forms**: Complete the structured input forms:
   - Patient Context (diagnosis, reason for visit)
   - Subjective (symptoms, pain level, functional limits)
   - Objective (interventions, measurements, observations)
   - Assessment (progression, skilled need, response to treatment)
   - Plan (frequency, next session focus, HEP)
4. **Generate**: Click "Generate Note" to create professional documentation
5. **Review**: View, copy, or export the generated note

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

**Request Body:**
```json
{
  "noteType": "daily_soap",
  "inputData": { /* form data */ },
  "template": "template content",
  "styleSettings": { /* style config */ }
}
```

**Response:**
```json
{
  "note": "Generated note text",
  "billing_justification": "Justification text",
  "hep_summary": "HEP summary"
}
```

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Auto-configured |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Auto-configured |

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

## License

This project is for educational and professional use. Ensure compliance with HIPAA and local regulations when handling patient data.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the code comments
3. Verify environment configuration

---

**Built with care for physical therapy professionals** 🏥
