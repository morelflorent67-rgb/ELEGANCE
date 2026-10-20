-- R-23 : la base refuse elle-même deux RDV qui se chevauchent pour un même membre de l'équipe,
-- même à la même seconde. Seuls les RDV qui occupent encore le coiffeur comptent : une annulation
-- libère le créneau, un « non venu » ou un RDV honoré le garde. Les plages sont semi-ouvertes
-- ([début, fin[) : un RDV peut commencer à l'heure exacte où le précédent finit.
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  )
  WHERE ("status" IN ('confirmed', 'honored', 'no_show'));
--> statement-breakpoint

-- Principe 5 : aucun accès à la base depuis le navigateur. La sécurité par ligne est activée sur
-- chaque table, sans aucune politique : l'accès direct par l'API publique de Supabase est refusé.
-- Le serveur se connecte avec un rôle qui contourne ces règles.
ALTER TABLE "salon_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opening_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "closure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointment_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "absence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Seconde barrière sur Supabase : retire aussi les droits des rôles de l'API publique (anon, authenticated),
-- y compris pour les tables créées plus tard. Sans effet sur une base locale, où ces rôles n'existent pas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  END IF;
END
$$;
