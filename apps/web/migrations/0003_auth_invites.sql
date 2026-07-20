-- Owner-issued, single-use member invitations. The bearer token itself is
-- never stored: only a versioned keyed digest crosses the database boundary.
create table "auth_invite" (
  "id" text not null primary key,
  "token_digest" text not null unique,
  "created_by_user_id" text not null references "user" ("id") on delete cascade,
  "role" text not null check ("role" = 'member'),
  "channel_ids" text not null,
  "created_at" text not null,
  "expires_at" text not null,
  "consumed_at" text,
  "consumed_by_user_id" text references "user" ("id") on delete set null,
  "revoked_at" text
);

create index "auth_invite_created_by_idx"
  on "auth_invite" ("created_by_user_id", "created_at");

create index "auth_invite_expiry_idx"
  on "auth_invite" ("expires_at");
