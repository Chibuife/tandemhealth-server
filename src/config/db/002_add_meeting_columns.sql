ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS reason_for_visit TEXT;

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS consultation_type VARCHAR(100);

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS priority VARCHAR(20)
CHECK (priority IN ('low', 'medium', 'high'));

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS consultation_status VARCHAR(20)
DEFAULT 'pending'
CHECK (
  consultation_status IN (
    'pending',
    'accepted',
    'declined',
    'completed'
  )
);