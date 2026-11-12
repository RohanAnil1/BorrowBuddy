-- Campus Impact: what sharing has saved, as aggregates only.
--
-- "Money saved" is an ESTIMATE: borrow-days x a rough daily rental value per
-- category (impact_category_rates). The page labels it as an estimate; the
-- rates are editable by admins later without a deploy.

create table public.impact_category_rates (
  category_id uuid primary key references public.categories (id) on delete cascade,
  daily_value int not null check (daily_value between 1 and 10000),
  updated_at timestamptz not null default now()
);

comment on table public.impact_category_rates is
  'Rough daily rental value (INR) per category, used only for the "estimated money saved" figure.';

insert into public.impact_category_rates (category_id, daily_value)
select c.id, r.daily_value
from public.categories c
join (values
  ('electronics', 80),
  ('cameras-audio', 250),
  ('gaming', 150),
  ('sports-fitness', 40),
  ('books-stationery', 20),
  ('tools-hardware', 60),
  ('appliances', 70),
  ('other', 30)
) as r(slug, daily_value) on r.slug = c.slug
on conflict (category_id) do nothing;

alter table public.impact_category_rates enable row level security;

create policy impact_rates_select on public.impact_category_rates
for select to authenticated using (true);

create policy impact_rates_admin_write on public.impact_category_rates
for all to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

revoke all on public.impact_category_rates from public, anon, authenticated;
grant select, insert, update, delete on public.impact_category_rates to authenticated;
grant all on public.impact_category_rates to service_role;

-- ---------------------------------------------------------------------------
-- get_impact_stats('campus' | 'me')
--   campus: totals across every completed (returned) loan.
--   me:     the caller's own loans, split into borrowed and lent.
-- Only counts, sums and per-category totals; never individual loans or names.
-- ---------------------------------------------------------------------------
create or replace function public.get_impact_stats(p_scope text default 'campus')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if not public.is_verified(v_uid) then
    raise exception 'Only verified students can view impact stats';
  end if;
  if p_scope not in ('campus', 'me') then
    raise exception 'Unknown scope';
  end if;

  with done as (
    select
      l.owner_id,
      l.borrower_id,
      l.item_id,
      i.category_id,
      i.deposit_amount,
      -- Days actually out: start to return (or due date), at least one.
      greatest(1, coalesce(l.returned_at::date, l.due_date) - l.start_date + 1) as days,
      coalesce(r.daily_value, 30) as daily_value,
      exists (
        select 1 from public.fines f
        where f.loan_id = l.id and f.source in ('damage', 'loss') and f.status <> 'waived'
      ) as damaged
    from public.loans l
    join public.items i on i.id = l.item_id
    left join public.impact_category_rates r on r.category_id = i.category_id
    where l.status = 'returned'
      and (p_scope = 'campus' or l.owner_id = v_uid or l.borrower_id = v_uid)
  ),
  per_category as (
    select c.slug, c.name, count(*) as loans, sum(d.days) as days, sum(d.days * d.daily_value) as saved
    from done d
    join public.categories c on c.id = d.category_id
    group by c.slug, c.name
  )
  select jsonb_build_object(
    'scope', p_scope,
    'completed_loans', (select count(*) from done),
    'borrow_days', (select coalesce(sum(days), 0) from done),
    'money_saved', (select coalesce(sum(days * daily_value), 0) from done),
    'deposits_returned', (select coalesce(sum(deposit_amount) filter (where not damaged), 0) from done),
    'items_shared', (select count(distinct item_id) from done),
    'lenders', (select count(distinct owner_id) from done),
    'borrowers', (select count(distinct borrower_id) from done),
    -- "me" splits: what I borrowed vs what my lending saved others.
    'borrowed_loans', (select count(*) from done where borrower_id = v_uid),
    'borrowed_saved', (select coalesce(sum(days * daily_value), 0) from done where borrower_id = v_uid),
    'borrowed_days', (select coalesce(sum(days), 0) from done where borrower_id = v_uid),
    'lent_loans', (select count(*) from done where owner_id = v_uid),
    'lent_saved', (select coalesce(sum(days * daily_value), 0) from done where owner_id = v_uid),
    'students_helped', (select count(distinct borrower_id) from done where owner_id = v_uid),
    'rehomed', (
      select count(*) from public.campus_transfers t
      join public.campus_posts p on p.id = t.post_id
      where t.status = 'completed'
        and p.kind in ('found', 'giveaway')
        and (p_scope = 'campus' or t.host_id = v_uid)
    ),
    'listed_items', (
      select count(*) from public.items i
      where i.status <> 'draft' and (p_scope = 'campus' or i.owner_id = v_uid)
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'loans', loans, 'days', days, 'saved', saved) order by saved desc, loans desc)
      from per_category
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_impact_stats(text) is
  'Campus or personal sharing impact: aggregates only, verified students only.';

revoke all on function public.get_impact_stats(text) from public, anon;
grant execute on function public.get_impact_stats(text) to authenticated, service_role;
