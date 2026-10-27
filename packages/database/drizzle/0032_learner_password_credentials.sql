-- Learner mobile + password credentials (replaces OTP for account sign-in).
create table if not exists learner_password_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  password_hash text not null,
  password_salt text not null,
  algorithm text not null default 'scrypt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_password_credentials_algorithm_allowed check (algorithm in ('scrypt')),
  constraint learner_password_credentials_hash_length check (char_length(password_hash) between 32 and 256),
  constraint learner_password_credentials_salt_length check (char_length(password_salt) between 16 and 128)
);
