-- Idempotente, comme les précédentes.
--
-- `expires_at` était NOT NULL sans valeur par défaut, alors que la route traite
-- le champ comme facultatif : toute demande d'avis violait la contrainte et
-- répondait 500. La durée reprend celle du jeton de portail qui ouvre l'avis
-- (60 jours) — les deux expirant séparément laisseraient soit un lien mort sur
-- une demande vivante, soit l'inverse.
ALTER TABLE "review_requests"
  ALTER COLUMN "expires_at" SET DEFAULT now() + interval '60 days';
