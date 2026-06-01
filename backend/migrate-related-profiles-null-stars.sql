-- Allow related profiles without AI alignment score (search-only discovery)

ALTER TABLE related_profiles
  ALTER COLUMN alignment_stars DROP NOT NULL;

ALTER TABLE related_profiles
  DROP CONSTRAINT IF EXISTS related_profiles_alignment_stars_check;

ALTER TABLE related_profiles
  ADD CONSTRAINT related_profiles_alignment_stars_check
  CHECK (alignment_stars IS NULL OR alignment_stars BETWEEN 1 AND 5);
