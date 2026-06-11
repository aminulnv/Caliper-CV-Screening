-- One-time superuser step for Talent Search (semantic CV embeddings).
-- The app DB user cannot CREATE EXTENSION; run this as RDS master / postgres superuser.
--
-- Local Postgres (Homebrew pgvector):
--   brew install pgvector
--   psql "$DATABASE_URL" -f backend/scripts/enable-pgvector.sql
--
-- AWS RDS: connect as the master user, then:
--   CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;
