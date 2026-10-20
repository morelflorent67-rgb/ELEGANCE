-- Données de départ du salon (dossier-projet.md : carte, équipe, horaires ; CORRECTIONS.md : soin du
-- visage en ligne, tribal sur appel). Rejouable : ne remplace jamais ce que le gérant a modifié.
-- Appliqué par `pnpm db:seed` (local) ou `pnpm db:seed:remote`.

-- Réglages (R-01 à R-07, R-25, R-30, R-52, R-61). Les valeurs par défaut du schéma sont celles du dossier projet.
INSERT INTO salon_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Horaires : du mardi (2) au samedi (6), 10 h–12 h et 13 h–19 h. Seulement si aucun horaire n'existe encore.
INSERT INTO opening_hours (weekday, opens_at, closes_at)
SELECT d.weekday, r.opens_at::time, r.closes_at::time
FROM (VALUES (2), (3), (4), (5), (6)) AS d(weekday)
CROSS JOIN (VALUES ('10:00', '12:00'), ('13:00', '19:00')) AS r(opens_at, closes_at)
WHERE NOT EXISTS (SELECT 1 FROM opening_hours);

-- Équipe (D-21). L'ordre d'affichage sert aussi à départager « Sans préférence » (R-20).
INSERT INTO staff (id, first_name, role, sort_order) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Orhan', 'barber', 1),
  ('00000000-0000-4000-8000-0000000000a2', 'Enes', 'barber', 2),
  ('00000000-0000-4000-8000-0000000000a3', 'Kaan', 'apprentice', 3),
  ('00000000-0000-4000-8000-0000000000a4', 'Taha', 'apprentice', 4)
ON CONFLICT (id) DO NOTHING;

-- Carte (10 prestations, prix en centimes).
INSERT INTO service (id, name, price_cents, duration_min, performed_by, bookable_online, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000b01', 'Coupe homme', 1800, 30, 'barber', true, 1),
  ('00000000-0000-4000-8000-000000000b02', 'Coupe & taille de barbe', 2800, 30, 'barber', true, 2),
  ('00000000-0000-4000-8000-000000000b03', 'Coupe, tarif formation', 1000, 45, 'apprentice', true, 3),
  ('00000000-0000-4000-8000-000000000b04', 'Coupe & taille de barbe, tarif formation', 1500, 45, 'apprentice', true, 4),
  ('00000000-0000-4000-8000-000000000b05', 'Taillage barbe', 1200, 15, 'barber', true, 5),
  ('00000000-0000-4000-8000-000000000b06', 'Soin du visage à la vapeur', 2500, 30, 'barber', true, 6),
  ('00000000-0000-4000-8000-000000000b07', 'Coloration', 1500, 30, 'barber', false, 7),
  ('00000000-0000-4000-8000-000000000b08', 'Tribal', 1000, 30, 'barber', false, 8),
  ('00000000-0000-4000-8000-000000000b09', 'Défrisage', 1000, 30, 'barber', false, 9),
  ('00000000-0000-4000-8000-000000000b10', 'Lissage brésilien', 6000, 30, 'barber', false, 10)
ON CONFLICT (id) DO NOTHING;

-- Groupes d'affichage de la carte (maquette de réservation). Ne remplit que les catégories encore vides.
UPDATE service SET category = v.category
FROM (VALUES
  ('00000000-0000-4000-8000-000000000b01'::uuid, 'Coupes'),
  ('00000000-0000-4000-8000-000000000b02'::uuid, 'Coupes'),
  ('00000000-0000-4000-8000-000000000b03'::uuid, 'Coupes'),
  ('00000000-0000-4000-8000-000000000b04'::uuid, 'Coupes'),
  ('00000000-0000-4000-8000-000000000b05'::uuid, 'Barbe et soin'),
  ('00000000-0000-4000-8000-000000000b06'::uuid, 'Barbe et soin'),
  ('00000000-0000-4000-8000-000000000b07'::uuid, 'Techniques'),
  ('00000000-0000-4000-8000-000000000b08'::uuid, 'Techniques'),
  ('00000000-0000-4000-8000-000000000b09'::uuid, 'Techniques'),
  ('00000000-0000-4000-8000-000000000b10'::uuid, 'Techniques')
) AS v(id, category)
WHERE service.id = v.id AND service.category IS NULL;

-- Habilitations (R-12, R-13) : les coiffeurs réalisent les prestations « Coiffeurs », les apprentis les
-- prestations « tarif formation ». Seulement si aucune habilitation n'existe encore.
INSERT INTO service_staff (service_id, staff_id)
SELECT s.id, m.id
FROM service s
JOIN staff m ON m.role = s.performed_by
WHERE NOT EXISTS (SELECT 1 FROM service_staff);
