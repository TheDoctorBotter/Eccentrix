-- Add therapeutic activity interventions for pediatric PT
-- These are commonly used in outpatient pediatric physical therapy settings

INSERT INTO intervention_library (name, category, default_dosage, default_cues)
VALUES
  -- Therapeutic Exercise additions
  ('Passive Range of Motion / Stretching', 'Therapeutic Exercise', '3 x 30 seconds each', 'Gentle sustained stretch, verbal cues for relaxation'),
  ('Core Strengthening / Stabilization', 'Therapeutic Exercise', '3 x 10 reps', 'Verbal and tactile cues for trunk activation'),
  ('Therapy Ball Activities', 'Therapeutic Exercise', '10 minutes', 'Verbal cues for posture and engagement; SBA/CGA as needed'),

  -- Functional Training additions
  ('Functional Mobility - Sit to Stand Transitions', 'Functional Training', '10 repetitions', 'Verbal cues for weight shifting and lower extremity alignment'),
  ('Functional Mobility - Floor to Stand Transitions', 'Functional Training', '5 repetitions', 'Verbal and tactile cues for sequencing'),
  ('Functional Mobility - Stair Negotiation', 'Functional Training', '1 flight x 3', 'CGA with verbal cues for reciprocal pattern and rail use'),

  -- Balance Training addition
  ('Balance Beam Activities', 'Balance Training', '5 passes', 'SBA/CGA; verbal cues for upright posture and foot placement'),

  -- Therapeutic Activities (new category)
  ('Obstacle Course Navigation', 'Therapeutic Activities', '10 minutes', 'Verbal cues for motor planning, sequencing, and safety awareness'),
  ('Trampoline Activities', 'Therapeutic Activities', '5 minutes', 'Verbal and tactile cues for postural control and bilateral coordination'),
  ('Scooter Board Activities', 'Therapeutic Activities', '10 minutes', 'Verbal cues for upper extremity strengthening and prone extension'),
  ('Pedal Bike / Cycling Activities', 'Therapeutic Activities', '10 minutes', 'Verbal cues for bilateral coordination and endurance'),
  ('Therapeutic Play Activities', 'Therapeutic Activities', '15 minutes', 'Activity-specific cueing for motor skill development'),

  -- Patient Education addition
  ('Patient/Caregiver Education - Activity Modifications', 'Patient Education', '10 minutes', 'Verbal instruction and handout')
ON CONFLICT DO NOTHING;
