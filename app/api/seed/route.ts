import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const DEFAULT_TEMPLATES = [
  {
    name: 'Standard Daily SOAP',
    note_type: 'daily_soap',
    content: `PATIENT DEMOGRAPHIC:
Name: {{patient_name}}
DOB: {{date_of_birth}}
Diagnosis: {{diagnosis}}
Referral Source: {{referral_source}}

SUBJECTIVE:
{{subjective}}

OBJECTIVE:
{{objective}}

ASSESSMENT:
{{assessment}}

PLAN:
{{plan}}`,
    style_settings: {
      verbosity: 'concise',
      tone: 'outpatient',
      avoid_acronyms: false,
    },
    required_sections: {
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
      billing_justification: true,
      hep_summary: false,
    },
    is_default: true,
  },
  {
    name: 'Comprehensive PT Evaluation',
    note_type: 'pt_evaluation',
    content: `PHYSICAL THERAPY EVALUATION

PATIENT DEMOGRAPHIC:
Name: {{patient_name}}
DOB: {{date_of_birth}}
Diagnosis: {{diagnosis}}
Referral Source: {{referral_source}}

SUBJECTIVE:
{{subjective}}

OBJECTIVE FINDINGS:
{{objective}}

ASSESSMENT:
{{assessment}}

PLAN OF CARE:
{{plan}}

GOALS:
Short-term and long-term functional goals will be established in collaboration with the patient.

PROGNOSIS:
Good for achievement of stated goals with consistent participation in skilled physical therapy.`,
    style_settings: {
      verbosity: 'detailed',
      tone: 'outpatient',
      avoid_acronyms: false,
    },
    required_sections: {
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
      billing_justification: true,
      hep_summary: true,
    },
    is_default: true,
  },
];

const DEFAULT_INTERVENTIONS = [
  // Therapeutic Exercise
  {
    name: 'Therapeutic Exercise - Strengthening',
    category: 'Therapeutic Exercise',
    default_dosage: '3 sets x 10 reps',
    default_cues: 'Verbal cues for proper form',
  },
  {
    name: 'Therapeutic Exercise - Stretching',
    category: 'Therapeutic Exercise',
    default_dosage: '3 x 30 seconds',
    default_cues: 'Verbal cues to maintain stretch',
  },
  {
    name: 'Therapeutic Exercise - Core Stabilization',
    category: 'Therapeutic Exercise',
    default_dosage: '3 x 10 reps, 10 second holds',
    default_cues: 'Tactile cues for neutral spine',
  },
  {
    name: 'Passive Range of Motion / Stretching',
    category: 'Therapeutic Exercise',
    default_dosage: '3 x 30 seconds each',
    default_cues: 'Gentle sustained stretch, verbal cues for relaxation',
  },
  {
    name: 'Core Strengthening / Stabilization',
    category: 'Therapeutic Exercise',
    default_dosage: '3 x 10 reps',
    default_cues: 'Verbal and tactile cues for trunk activation',
  },
  {
    name: 'Therapy Ball Activities',
    category: 'Therapeutic Exercise',
    default_dosage: '10 minutes',
    default_cues: 'Verbal cues for posture and engagement; SBA/CGA as needed',
  },
  // Manual Therapy
  {
    name: 'Manual Therapy - Joint Mobilization',
    category: 'Manual Therapy',
    default_dosage: '5 minutes',
    default_cues: 'Patient education on tissue response',
  },
  {
    name: 'Manual Therapy - Soft Tissue Mobilization',
    category: 'Manual Therapy',
    default_dosage: '10 minutes',
    default_cues: null,
  },
  // Gait Training
  {
    name: 'Gait Training',
    category: 'Gait Training',
    default_dosage: '150 feet x 3',
    default_cues: 'Verbal and tactile cues',
  },
  {
    name: 'Gait Training with Assistive Device',
    category: 'Gait Training',
    default_dosage: '200 feet x 2',
    default_cues: 'Verbal cues for proper device use',
  },
  // Balance Training
  {
    name: 'Balance Training - Static',
    category: 'Balance Training',
    default_dosage: '3 x 30 seconds',
    default_cues: 'SBA with verbal cues',
  },
  {
    name: 'Balance Training - Dynamic',
    category: 'Balance Training',
    default_dosage: '10 minutes',
    default_cues: 'CGA with verbal cues',
  },
  {
    name: 'Balance Beam Activities',
    category: 'Balance Training',
    default_dosage: '5 passes',
    default_cues: 'SBA/CGA; verbal cues for upright posture and foot placement',
  },
  // Neuromuscular Re-education
  {
    name: 'Neuromuscular Re-education',
    category: 'Neuromuscular Re-education',
    default_dosage: '15 minutes',
    default_cues: 'Verbal, visual, and tactile cues',
  },
  // Functional Training
  {
    name: 'Functional Mobility - Sit to Stand Transitions',
    category: 'Functional Training',
    default_dosage: '10 repetitions',
    default_cues: 'Verbal cues for weight shifting and lower extremity alignment',
  },
  {
    name: 'Functional Mobility - Floor to Stand Transitions',
    category: 'Functional Training',
    default_dosage: '5 repetitions',
    default_cues: 'Verbal and tactile cues for sequencing',
  },
  {
    name: 'Functional Mobility - Stair Negotiation',
    category: 'Functional Training',
    default_dosage: '1 flight x 3',
    default_cues: 'CGA with verbal cues for reciprocal pattern and rail use',
  },
  {
    name: 'Functional Training - ADL Simulation',
    category: 'Functional Training',
    default_dosage: '15 minutes',
    default_cues: 'Task-specific verbal cues',
  },
  // Therapeutic Activities
  {
    name: 'Obstacle Course Navigation',
    category: 'Therapeutic Activities',
    default_dosage: '10 minutes',
    default_cues: 'Verbal cues for motor planning, sequencing, and safety awareness',
  },
  {
    name: 'Trampoline Activities',
    category: 'Therapeutic Activities',
    default_dosage: '5 minutes',
    default_cues: 'Verbal and tactile cues for postural control and bilateral coordination',
  },
  {
    name: 'Scooter Board Activities',
    category: 'Therapeutic Activities',
    default_dosage: '10 minutes',
    default_cues: 'Verbal cues for upper extremity strengthening and prone extension',
  },
  {
    name: 'Pedal Bike / Cycling Activities',
    category: 'Therapeutic Activities',
    default_dosage: '10 minutes',
    default_cues: 'Verbal cues for bilateral coordination and endurance',
  },
  {
    name: 'Therapeutic Play Activities',
    category: 'Therapeutic Activities',
    default_dosage: '15 minutes',
    default_cues: 'Activity-specific cueing for motor skill development',
  },
  // Modalities
  {
    name: 'Modalities - Ice',
    category: 'Modalities',
    default_dosage: '15 minutes',
    default_cues: null,
  },
  {
    name: 'Modalities - Heat',
    category: 'Modalities',
    default_dosage: '15 minutes',
    default_cues: null,
  },
  {
    name: 'Modalities - Electrical Stimulation',
    category: 'Modalities',
    default_dosage: '15 minutes',
    default_cues: null,
  },
  {
    name: 'Modalities - Ultrasound',
    category: 'Modalities',
    default_dosage: '8 minutes',
    default_cues: null,
  },
  // Patient Education
  {
    name: 'Patient Education - Home Exercise Program',
    category: 'Patient Education',
    default_dosage: '10 minutes',
    default_cues: 'Demonstration and return demonstration',
  },
  {
    name: 'Patient Education - Body Mechanics',
    category: 'Patient Education',
    default_dosage: '10 minutes',
    default_cues: 'Visual aids and demonstration',
  },
  {
    name: 'Patient Education - Fall Prevention',
    category: 'Patient Education',
    default_dosage: '15 minutes',
    default_cues: 'Environmental assessment and recommendations',
  },
  {
    name: 'Patient/Caregiver Education - Activity Modifications',
    category: 'Patient Education',
    default_dosage: '10 minutes',
    default_cues: 'Verbal instruction and handout',
  },
];

export async function POST() {
  try {
    const { data: existingTemplates } = await supabase
      .from('templates')
      .select('id')
      .limit(1);

    if (existingTemplates && existingTemplates.length > 0) {
      return NextResponse.json({
        message: 'Database already seeded',
        skipped: true,
      });
    }

    const { error: templateError } = await supabase
      .from('templates')
      .insert(
        DEFAULT_TEMPLATES.map((t) => ({
          ...t,
          updated_at: new Date().toISOString(),
        }))
      );

    if (templateError) {
      console.error('Error seeding templates:', templateError);
      return NextResponse.json(
        { error: 'Failed to seed templates' },
        { status: 500 }
      );
    }

    const { error: interventionError } = await supabase
      .from('intervention_library')
      .insert(DEFAULT_INTERVENTIONS);

    if (interventionError) {
      console.error('Error seeding interventions:', interventionError);
      return NextResponse.json(
        { error: 'Failed to seed interventions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Database seeded successfully',
      templates: DEFAULT_TEMPLATES.length,
      interventions: DEFAULT_INTERVENTIONS.length,
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
