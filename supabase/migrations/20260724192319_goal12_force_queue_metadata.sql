-- Goal 12B corrective follow-up.
-- The original foundation was already applied to production. This replacement
-- prevents legacy direct browser writes from supplying trusted concurrency
-- metadata on INSERT. It changes no existing queue row.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.queue_set_concurrency_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.updated_at := now();
    return new;
  end if;

  if (to_jsonb(new) - array['updated_at', 'version'])
       is distinct from
     (to_jsonb(old) - array['updated_at', 'version']) then
    new.version := coalesce(old.version, 0) + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function public.queue_set_concurrency_metadata()
  from public, anon, authenticated;
