DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'O PostgreSQL do scaffold deve permanecer sem tabelas ou views.';
  END IF;
END
$verify$;
