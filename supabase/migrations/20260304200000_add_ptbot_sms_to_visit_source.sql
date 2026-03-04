-- Add 'ptbot' and 'sms' values to the visit_source enum
-- so visits booked via PTBot or SMS are properly tracked.

ALTER TYPE visit_source ADD VALUE IF NOT EXISTS 'ptbot';
ALTER TYPE visit_source ADD VALUE IF NOT EXISTS 'sms';
