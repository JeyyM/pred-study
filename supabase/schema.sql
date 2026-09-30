-- Run this in the Supabase SQL editor once.

create table if not exists public.completed_sessions (
  id uuid primary key,
  protocol jsonb not null,
  started_at timestamptz,
  completed_at timestamptz not null,
  duration_ms integer,
  score jsonb not null,
  trials jsonb not null,
  received_at timestamptz not null default now(),
  constraint completed_sessions_thirty_trials
    check (jsonb_array_length(trials) = 30),
  constraint completed_sessions_thirty_answers
    check ((score ->> 'answered')::int = 30)
);

alter table public.completed_sessions enable row level security;

drop policy if exists completed_sessions_insert on public.completed_sessions;
create policy completed_sessions_insert
  on public.completed_sessions
  for insert
  to anon
  with check (
    jsonb_array_length(trials) = 30
    and (score ->> 'answered')::int = 30
  );

-- No select/update/delete policy for anon: visitors can write a finished
-- session and cannot read anyone else's rows. Use the dashboard to view data.
