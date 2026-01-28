-- Add rich_content column to notes table for storing formatted content
-- This column stores JSON data compatible with TipTap/ProseMirror editor

ALTER TABLE notes
ADD COLUMN IF NOT EXISTS rich_content JSONB;

-- Add comment for documentation
COMMENT ON COLUMN notes.rich_content IS 'Rich text content (JSON) - stores formatted note content compatible with TipTap editor for editing and Word/PDF export';

-- Create index for potential future queries on rich content
-- (optional, but useful if we ever need to search within rich content)
CREATE INDEX IF NOT EXISTS idx_notes_rich_content ON notes USING GIN (rich_content);
