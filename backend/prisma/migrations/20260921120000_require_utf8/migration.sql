-- Refuse to run on a database that cannot store Arabic.
--
-- NBE and Banque Misr send Arabic SMS, and merchant names are stored
-- exactly as received. A database created with a legacy encoding such as
-- WIN1252 (the default for a Postgres cluster initialised on Windows) or
-- SQL_ASCII rejects Arabic with "has no equivalent in encoding", so every
-- Arabic SMS would fail on insert at runtime.
--
-- Failing HERE, at deploy time, surfaces the problem before any data
-- exists, with a message that says how to fix it.
DO $$
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION
      'Database encoding is %, but this app requires UTF8 to store Arabic text. Recreate the database with ENCODING ''UTF8''.',
      current_setting('server_encoding');
  END IF;
END
$$;
