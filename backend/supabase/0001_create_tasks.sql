-- Task table schema for ToDo & Daily Scheduler
create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  reminder_at timestamptz,
  is_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tasks_user_id_due_at_idx on public.tasks(user_id, due_at);

-- Trigger to keep updated_at fresh
create or replace function public.handle_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.handle_tasks_updated_at();

-- Enable Row Level Security
alter table public.tasks enable row level security;

drop policy if exists "Users can CRUD their own tasks" on public.tasks;
create policy "Users can CRUD their own tasks" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Daily summaries can query upcoming tasks on behalf of user via service role
drop policy if exists "Service role has full access" on public.tasks;
create policy "Service role has full access" on public.tasks
  for select
  using (auth.role() = 'service_role');
