/**
 * Seed EMR Demo Data API
 * POST: Create demo clinic, patients, and episodes for testing
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

const DEMO_PATIENTS = [
  {
    first_name: 'Sarah',
    last_name: 'Johnson',
    date_of_birth: '1985-03-15',
    gender: 'Female',
    phone: '(614) 555-0101',
    primary_diagnosis: 'Low back pain with radiculopathy',
    referring_physician: 'Dr. Michael Chen',
    episode_diagnosis: 'Lumbar disc herniation L4-L5',
    frequency: '2x/week',
  },
  {
    first_name: 'Robert',
    last_name: 'Martinez',
    date_of_birth: '1972-08-22',
    gender: 'Male',
    phone: '(614) 555-0102',
    primary_diagnosis: 'Right knee osteoarthritis',
    referring_physician: 'Dr. Jennifer Walsh',
    episode_diagnosis: 'Post TKA rehabilitation',
    frequency: '3x/week',
  },
  {
    first_name: 'Emily',
    last_name: 'Thompson',
    date_of_birth: '1990-11-30',
    gender: 'Female',
    phone: '(614) 555-0103',
    primary_diagnosis: 'Left shoulder impingement',
    referring_physician: 'Dr. David Park',
    episode_diagnosis: 'Rotator cuff tendinitis',
    frequency: '2x/week',
  },
  {
    first_name: 'James',
    last_name: 'Wilson',
    date_of_birth: '1968-05-12',
    gender: 'Male',
    phone: '(614) 555-0104',
    primary_diagnosis: 'Cervical radiculopathy',
    referring_physician: 'Dr. Lisa Anderson',
    episode_diagnosis: 'Cervical stenosis C5-C6',
    frequency: '2x/week',
  },
  {
    first_name: 'Maria',
    last_name: 'Garcia',
    date_of_birth: '1995-02-28',
    gender: 'Female',
    phone: '(614) 555-0105',
    primary_diagnosis: 'Right ankle sprain',
    referring_physician: 'Dr. Robert Kim',
    episode_diagnosis: 'Grade II lateral ankle sprain',
    frequency: '2x/week',
  },
];

export async function POST() {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    // 1. Create demo clinic
    const { data: existingClinics, error: checkError } = await client
      .from('clinics')
      .select('id')
      .eq('name', 'Buckeye Physical Therapy')
      .limit(1);

    if (checkError) {
      console.error('Error checking existing clinics:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    let clinicId: string;

    if (existingClinics && existingClinics.length > 0) {
      clinicId = existingClinics[0].id;
      console.log('[Seed EMR] Using existing clinic:', clinicId);
    } else {
      const { data: newClinic, error: clinicError } = await client
        .from('clinics')
        .insert({
          name: 'Buckeye Physical Therapy',
          address: '123 High Street, Columbus, OH 43215',
          phone: '(614) 555-1234',
          email: 'info@buckeyept.com',
          website: 'https://buckeyept.com',
          is_active: true,
        })
        .select()
        .single();

      if (clinicError) {
        console.error('Error creating clinic:', clinicError);
        return NextResponse.json({ error: clinicError.message }, { status: 500 });
      }

      clinicId = newClinic.id;
      console.log('[Seed EMR] Created new clinic:', clinicId);
    }

    // 2. Create demo patients and episodes
    let patientsCreated = 0;
    let episodesCreated = 0;

    for (const patientData of DEMO_PATIENTS) {
      // Check if patient already exists
      const { data: existingPatient, error: patientCheckError } = await client
        .from('patients')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('first_name', patientData.first_name)
        .eq('last_name', patientData.last_name)
        .limit(1);

      if (patientCheckError) {
        console.error('Error checking patient:', patientCheckError);
        continue;
      }

      let patientId: string;

      if (existingPatient && existingPatient.length > 0) {
        patientId = existingPatient[0].id;
        console.log(`[Seed EMR] Patient ${patientData.first_name} ${patientData.last_name} already exists`);
      } else {
        const { data: newPatient, error: patientError } = await client
          .from('patients')
          .insert({
            clinic_id: clinicId,
            first_name: patientData.first_name,
            last_name: patientData.last_name,
            date_of_birth: patientData.date_of_birth,
            gender: patientData.gender,
            phone: patientData.phone,
            primary_diagnosis: patientData.primary_diagnosis,
            referring_physician: patientData.referring_physician,
            is_active: true,
          })
          .select()
          .single();

        if (patientError) {
          console.error(`Error creating patient ${patientData.first_name}:`, patientError);
          continue;
        }

        patientId = newPatient.id;
        patientsCreated++;
        console.log(`[Seed EMR] Created patient: ${patientData.first_name} ${patientData.last_name}`);
      }

      // Check if episode already exists
      const { data: existingEpisode, error: episodeCheckError } = await client
        .from('episodes')
        .select('id')
        .eq('patient_id', patientId)
        .eq('status', 'active')
        .limit(1);

      if (episodeCheckError) {
        console.error('Error checking episode:', episodeCheckError);
        continue;
      }

      if (existingEpisode && existingEpisode.length > 0) {
        console.log(`[Seed EMR] Episode for ${patientData.first_name} ${patientData.last_name} already exists`);
        continue;
      }

      // Calculate a start date in the past (random 1-14 days ago for variety)
      const daysAgo = Math.floor(Math.random() * 14) + 1;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const { error: episodeError } = await client.from('episodes').insert({
        patient_id: patientId,
        clinic_id: clinicId,
        start_date: startDate.toISOString().split('T')[0],
        diagnosis: patientData.episode_diagnosis,
        frequency: patientData.frequency,
        status: 'active',
      });

      if (episodeError) {
        console.error(`Error creating episode for ${patientData.first_name}:`, episodeError);
        continue;
      }

      episodesCreated++;
      console.log(`[Seed EMR] Created episode for: ${patientData.first_name} ${patientData.last_name}`);
    }

    return NextResponse.json({
      success: true,
      clinic_id: clinicId,
      patients_created: patientsCreated,
      episodes_created: episodesCreated,
      message: `Created ${patientsCreated} patients and ${episodesCreated} episodes`,
    });
  } catch (error) {
    console.error('Error in POST /api/seed-emr:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
