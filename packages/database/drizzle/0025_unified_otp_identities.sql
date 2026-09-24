create table if not exists "user_phone_identities" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references "users"("id") on delete cascade,
  "phone_normalized" text not null,
  "phone_display" text not null,
  "verified_at" timestamptz not null,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  constraint "user_phone_identities_e164" check (
    char_length("phone_normalized") = 13
    and left("phone_normalized", 4) = '+923'
    and substring("phone_normalized" from 5) not like '%[^0-9]%'
  )
);
create unique index if not exists "user_phone_identities_phone_unique"
  on "user_phone_identities" ("phone_normalized");
create unique index if not exists "user_phone_identities_user_unique"
  on "user_phone_identities" ("user_id");

alter table "auth_challenges"
  add column if not exists "identity_type" text default 'email' not null;
alter table "auth_challenges"
  drop constraint if exists "auth_challenges_identity_type_allowed";
alter table "auth_challenges"
  add constraint "auth_challenges_identity_type_allowed"
  check ("identity_type" in ('email', 'phone'));
create index if not exists "auth_challenges_identity_created_idx"
  on "auth_challenges" ("identity_type", "email_normalized", "created_at");

alter table "auth_challenges"
  drop constraint if exists "auth_challenges_purpose_allowed";
alter table "auth_challenges"
  add constraint "auth_challenges_purpose_allowed"
  check ("purpose" in ('sign_in', 'identity_link'));
