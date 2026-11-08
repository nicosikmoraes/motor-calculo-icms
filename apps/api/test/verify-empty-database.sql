DO $verify$
BEGIN
  IF (
    SELECT array_agg(table_name::text ORDER BY table_name COLLATE "C")
    FROM information_schema.tables
    WHERE table_schema = 'public'
  ) IS DISTINCT FROM ARRAY[
    '_prisma_migrations',
    'donation_opening_reservations',
    'donation_operations',
    'donation_orders',
    'payment_events',
    'payments'
  ] OR EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type <> 'BASE TABLE'
  ) THEN
    RAISE EXCEPTION 'O schema public deve conter apenas as tabelas de doação e o histórico de migrations.';
  END IF;
END
$verify$;
