-- Extensions used by BorrowBuddy
-- btree_gist: exclusion constraints that make double-booking impossible
-- pg_trgm:    fuzzy search over item titles/descriptions
-- pgcrypto:   secure handover token generation

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
