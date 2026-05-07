-- 2026-05-08 add privacy_agreed column
-- Tracks PIPA (개인정보 보호법) consent, separate from refund_agreed.
-- Run after 2026-05-08-design-revamp.sql.

alter table signups
  add column privacy_agreed boolean not null default false;

-- The default lets existing rows backfill safely. The app always sends true,
-- so the default is only a safety net — fine to leave in place.
