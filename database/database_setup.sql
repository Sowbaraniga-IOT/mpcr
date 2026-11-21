-- ==============================================================================
-- MPCR Database Setup Master Script
-- Target: PostgreSQL 17+
-- Usage via psql:
--   psql -U postgres -h localhost -p 5432 -f database/database_setup.sql
-- ==============================================================================

\echo '=================================================='
\echo 'Starting MPCR Database Setup...'
\echo '=================================================='

-- 1. Create Dedicated Application User/Role if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mpcr_user') THEN
        CREATE ROLE mpcr_user WITH LOGIN PASSWORD 'mpcr_secure_pass_2026!';
        RAISE NOTICE 'Role "mpcr_user" created successfully.';
    ELSE
        RAISE NOTICE 'Role "mpcr_user" already exists.';
    END IF;
END
$$;

-- 2. Create MPCR Database if not exists
SELECT 'CREATE DATABASE mpcr_db WITH OWNER = mpcr_user ENCODING = ''UTF8'''
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mpcr_db')\gexec

-- 3. Grant Database Privileges
GRANT ALL PRIVILEGES ON DATABASE mpcr_db TO mpcr_user;

-- 4. Switch connection to the newly configured mpcr_db
\connect mpcr_db

-- Grant schema privileges within mpcr_db
GRANT ALL ON SCHEMA public TO mpcr_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mpcr_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mpcr_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO mpcr_user;

\echo '--------------------------------------------------'
\echo 'Applying MPCR Schema...'
\echo '--------------------------------------------------'

\i database/schema.sql

\echo '--------------------------------------------------'
\echo 'Seeding Initial Catalog & Master Data...'
\echo '--------------------------------------------------'

\i database/seed.sql

-- Ensure mpcr_user owns all created objects
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO mpcr_user;';
    END LOOP;
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO mpcr_user;';
    END LOOP;
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
        EXECUTE 'ALTER VIEW public.' || quote_ident(r.table_name) || ' OWNER TO mpcr_user;';
    END LOOP;
END
$$;

\echo '=================================================='
\echo 'MPCR Database Setup Completed Successfully!'
\echo 'Database: mpcr_db'
\echo 'App User: mpcr_user'
\echo '=================================================='
