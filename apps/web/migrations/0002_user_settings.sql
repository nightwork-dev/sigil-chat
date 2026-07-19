-- App-owned user preference storage (S10.4). Deliberately NOT extra Better
-- Auth user/session fields and NOT a new generic store: a single narrow table
-- in the same auth libSQL DB, gated by a typed application registry that
-- rejects unknown keys and invalid values server-side. Preference resolution
-- only — never an authorization grant (see docs/specs/AUTH-AND-USER-SETTINGS-SPEC.md).
create table "user_settings" (
  "id" text not null primary key,
  "user_id" text not null references "user" ("id") on delete cascade,
  "scope_kind" text not null,
  "scope_id" text not null,
  "key" text not null,
  "value" text not null,
  "revision" integer not null default 1,
  "updated_at" text not null
);

create unique index "user_settings_scope_key_idx"
  on "user_settings" ("user_id", "scope_kind", "scope_id", "key");

create index "user_settings_user_id_idx" on "user_settings" ("user_id");
