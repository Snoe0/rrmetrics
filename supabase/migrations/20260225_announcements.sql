create table if not exists announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  type         text not null default 'info',   -- 'info' | 'warning' | 'success'
  active       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Only admins (service-role) can write; anyone can read active announcements
alter table announcements enable row level security;

create policy "Public read active announcements"
  on announcements for select
  using (active = true);

-- Service role bypasses RLS, so no insert/update policy needed for admin.
