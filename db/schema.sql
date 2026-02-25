-- Music Calendar schema (PostgreSQL)
-- All instants are stored in timestamptz UTC.

create type role_type as enum ('teacher', 'student');
create type slot_status as enum ('available', 'held', 'booked', 'canceled');
create type lesson_status as enum ('booked', 'completed', 'canceled', 'no_show');
create type request_status as enum ('pending', 'accepted', 'countered', 'rejected');
create type exception_type as enum ('blocked', 'added');

create table users (
  id uuid primary key,
  role role_type not null,
  name text not null,
  email text not null unique,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table students (
  user_id uuid primary key references users(id) on delete cascade,
  lesson_length_minutes int not null check (lesson_length_minutes in (30, 45, 60)),
  monthly_quota int not null default 2 check (monthly_quota > 0),
  allow_bonus_lessons boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Assumes one teacher in MVP. For multi-teacher support, add teacher_id FK.
create table availability_rules (
  id uuid primary key,
  weekday int not null check (weekday between 0 and 6),
  start_local_time time not null,
  end_local_time time not null,
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_local_time < end_local_time),
  check (effective_from is null or effective_to is null or effective_from <= effective_to)
);

create table availability_exceptions (
  id uuid primary key,
  date_local date not null,
  type exception_type not null,
  start_local_time time not null,
  end_local_time time not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_local_time < end_local_time)
);

create table slots (
  id uuid primary key,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  status slot_status not null,
  held_by_student_id uuid references students(user_id) on delete set null,
  hold_expires_at_utc timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_utc < end_utc),
  check (
    (status = 'held' and held_by_student_id is not null and hold_expires_at_utc is not null)
    or (status <> 'held')
  )
);

create unique index slots_time_window_uniq on slots (start_utc, end_utc);
create index slots_status_start_idx on slots (status, start_utc);

create table lessons (
  id uuid primary key,
  student_id uuid not null references students(user_id) on delete restrict,
  slot_id uuid not null unique references slots(id) on delete restrict,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  status lesson_status not null default 'booked',
  notes text,
  meeting_link text,
  calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_utc < end_utc)
);

create index lessons_student_start_idx on lessons (student_id, start_utc);
create index lessons_status_start_idx on lessons (status, start_utc);

create table booking_requests (
  id uuid primary key,
  student_id uuid not null references students(user_id) on delete cascade,
  preferred_windows jsonb not null,
  notes text,
  status request_status not null default 'pending',
  teacher_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(preferred_windows) = 'array')
);

create index booking_requests_student_status_idx on booking_requests (student_id, status);

-- Optional helper view for monthly usage (teacher-timezone month boundaries should be
-- computed in app and passed into query for strict correctness).
create view student_lesson_totals as
select
  l.student_id,
  date_trunc('month', l.start_utc) as month_utc,
  count(*) filter (where l.status = 'booked') as booked_lessons
from lessons l
group by l.student_id, date_trunc('month', l.start_utc);
