-- Run the entire file in the SQL editor (do not highlight only the last lines).

drop function if exists public.submit_completed_session(jsonb);
drop function if exists public.claim_protocol();
drop function if exists public.claim_protocol(text);
drop function if exists public.device_can_start(text, text);

drop table if exists public.face_stats cascade;
drop table if exists public.protocol_assignments cascade;
drop table if exists public.protocol_counts cascade;
drop table if exists public.stimuli cascade;
drop table if exists public.completed_sessions cascade;

create table public.stimuli (
  image text primary key,
  source_id text,
  pool_role text check (pool_role in ('target', 'foil')),
  category text,
  age_band text,
  accepted_at timestamptz
);

create table public.protocol_counts (
  protocol text primary key check (protocol in ('feedback', 'silent')),
  completed_count integer not null default 0
);

insert into public.protocol_counts (protocol, completed_count)
values ('feedback', 0), ('silent', 0);

create table public.protocol_assignments (
  device_id text primary key,
  arm text not null check (arm in ('feedback', 'silent')),
  assigned_at timestamptz not null default now()
);

create table public.completed_sessions (
  id uuid primary key,
  arm text not null check (arm in ('feedback', 'silent')),
  device_id text not null unique,
  device_type text,
  user_agent text,
  ip_address inet,
  participant_gender text check (participant_gender in ('male', 'female', 'other', 'prefer_not')),
  participant_age integer check (participant_age is null or (participant_age >= 18 and participant_age <= 100)),
  started_at timestamptz,
  completed_at timestamptz not null default now(),
  duration_ms integer,
  score jsonb not null,
  protocol_meta jsonb not null,
  trials jsonb not null,
  received_at timestamptz not null default now(),
  constraint completed_sessions_thirty_trials
    check (jsonb_array_length(trials) = 30),
  constraint completed_sessions_thirty_answers
    check ((score ->> 'answered')::int = 30)
);

create index completed_sessions_ip_idx on public.completed_sessions (ip_address);
create index completed_sessions_arm_idx on public.completed_sessions (arm);

create table public.face_stats (
  image text primary key,
  times_played integer not null default 0,
  times_selected integer not null default 0
);

alter table public.stimuli enable row level security;
alter table public.protocol_counts enable row level security;
alter table public.protocol_assignments enable row level security;
alter table public.completed_sessions enable row level security;
alter table public.face_stats enable row level security;

create or replace function public.claim_protocol(p_device_id text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arm text;
begin
  if p_device_id is not null and length(p_device_id) >= 8 then
    select arm into v_arm from protocol_assignments where device_id = p_device_id;
    if v_arm is not null then
      return v_arm;
    end if;
  end if;

  if random() < 0.5 then
    v_arm := 'feedback';
  else
    v_arm := 'silent';
  end if;

  if p_device_id is not null and length(p_device_id) >= 8 then
    insert into protocol_assignments (device_id, arm)
    values (p_device_id, v_arm)
    on conflict (device_id) do nothing;
    select arm into v_arm from protocol_assignments where device_id = p_device_id;
  end if;

  return v_arm;
end;
$$;

create or replace function public.device_can_start(p_device_id text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip inet;
begin
  if p_device_id is null or length(p_device_id) < 8 then
    return jsonb_build_object('allowed', false, 'reason', 'Missing device id');
  end if;
  if exists(select 1 from completed_sessions where device_id = p_device_id) then
    return jsonb_build_object('allowed', false, 'reason', 'This device already completed the study');
  end if;

  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;

  if v_ip is not null and exists(select 1 from completed_sessions where ip_address = v_ip) then
    return jsonb_build_object('allowed', false, 'reason', 'This network already completed the study');
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.submit_completed_session(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_arm text;
  v_device text;
  v_ip inet;
  v_trials jsonb;
  v_trial jsonb;
  v_card jsonb;
  v_choice integer;
  v_image text;
  v_chosen text;
begin
  v_id := (payload->>'id')::uuid;
  v_arm := payload->>'arm';
  v_device := payload->>'device_id';
  v_trials := payload->'trials';

  if v_id is null then
    raise exception 'Missing session id';
  end if;
  if v_arm not in ('feedback', 'silent') then
    raise exception 'Invalid protocol';
  end if;
  if v_device is null or length(v_device) < 8 then
    raise exception 'Missing device id';
  end if;
  if jsonb_typeof(v_trials) <> 'array' or jsonb_array_length(v_trials) <> 30 then
    raise exception 'Only complete 30-round sessions are stored';
  end if;
  if (payload->'score'->>'answered')::int <> 30 then
    raise exception 'Only complete 30-round sessions are stored';
  end if;
  if exists(select 1 from completed_sessions where id = v_id) then
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  end if;
  if exists(select 1 from completed_sessions where device_id = v_device) then
    raise exception 'This device already completed the study';
  end if;

  begin
    v_ip := nullif(payload->>'ip_address', '')::inet;
  exception when others then
    v_ip := null;
  end;

  if v_ip is not null and exists(select 1 from completed_sessions where ip_address = v_ip) then
    raise exception 'This network already completed the study';
  end if;

  insert into completed_sessions (
    id, arm, device_id, device_type, user_agent, ip_address,
    participant_gender, participant_age,
    started_at, completed_at, duration_ms, score, protocol_meta, trials
  ) values (
    v_id,
    v_arm,
    v_device,
    payload->>'device_type',
    payload->>'user_agent',
    v_ip,
    case
      when payload->>'participant_gender' in ('male', 'female', 'other', 'prefer_not')
      then payload->>'participant_gender'
      else null
    end,
    case
      when (payload->>'participant_age') ~ '^[0-9]+$'
        and (payload->>'participant_age')::int between 18 and 100
      then (payload->>'participant_age')::int
      else null
    end,
    nullif(payload->>'started_at', '')::timestamptz,
    coalesce(nullif(payload->>'completed_at', '')::timestamptz, now()),
    nullif(payload->>'duration_ms', '')::int,
    payload->'score',
    coalesce(payload->'protocol_meta', '{}'::jsonb),
    v_trials
  );

  update protocol_counts
  set completed_count = completed_count + 1
  where protocol = v_arm;

  for v_trial in select value from jsonb_array_elements(v_trials)
  loop
    v_choice := (v_trial->>'choice')::int;
    v_chosen := v_trial->'cards'->v_choice->>'image';
    for v_card in select value from jsonb_array_elements(v_trial->'cards')
    loop
      v_image := v_card->>'image';
      if v_image is null or v_image = '' then
        continue;
      end if;
      insert into face_stats (image, times_played, times_selected)
      values (v_image, 1, case when v_image = v_chosen then 1 else 0 end)
      on conflict (image) do update set
        times_played = face_stats.times_played + 1,
        times_selected = face_stats.times_selected + excluded.times_selected;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end;
$$;

revoke all on table public.completed_sessions from anon, authenticated;
revoke all on table public.face_stats from anon, authenticated;
revoke all on table public.stimuli from anon, authenticated;
revoke all on table public.protocol_counts from anon, authenticated;
revoke all on table public.protocol_assignments from anon, authenticated;

grant execute on function public.claim_protocol(text) to anon, authenticated;
grant execute on function public.device_can_start(text, text) to anon, authenticated;
grant execute on function public.submit_completed_session(jsonb) to anon, authenticated;
