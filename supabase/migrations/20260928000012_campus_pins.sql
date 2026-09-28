-- ===========================================================================
-- Campus pins — pickup locations gain landing-board coordinates, and admins
-- can add, edit or remove them from the moderation desk.
-- ===========================================================================

alter table public.pickup_locations
  add column xp double precision check (xp is null or (xp between 0 and 100)),
  add column yp double precision check (yp is null or (yp between 0 and 100)),
  add column map_label text not null default 'right' check (map_label in ('left', 'right'));

-- The landing board renders for anonymous visitors: active rows are public.
grant select on public.pickup_locations to anon;

create policy pickup_locations_select_public on public.pickup_locations
for select to anon
using (is_active);

-- ---------------------------------------------------------------------------
-- Admin: add / edit a campus pin
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_pickup_location(
  p_id uuid,
  p_name text,
  p_description text,
  p_xp double precision,
  p_yp double precision,
  p_map_label text,
  p_is_active boolean
)
returns public.pickup_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pickup_locations;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can manage pickup locations';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then
    raise exception 'Name must be at least 3 characters';
  end if;
  if char_length(trim(coalesce(p_name, ''))) > 60 then
    raise exception 'Name must be at most 60 characters';
  end if;
  if p_map_label not in ('left', 'right') then
    raise exception 'Label side must be left or right';
  end if;
  if (p_xp is null) <> (p_yp is null) then
    raise exception 'Give both map coordinates or neither';
  end if;

  if p_id is null then
    insert into public.pickup_locations (name, description, xp, yp, map_label, is_active)
    values (
      trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      p_xp,
      p_yp,
      p_map_label,
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.pickup_locations
    set name = trim(p_name),
        description = nullif(trim(coalesce(p_description, '')), ''),
        xp = p_xp,
        yp = p_yp,
        map_label = p_map_label,
        is_active = coalesce(p_is_active, true)
    where id = p_id
    returning * into v_row;

    if v_row is null then
      raise exception 'Pickup location not found';
    end if;
  end if;

  perform public.write_audit(
    'pickup_location.saved', 'pickup_location', v_row.id::text,
    jsonb_build_object('name', v_row.name, 'xp', v_row.xp, 'yp', v_row.yp, 'active', v_row.is_active)
  );

  return v_row;
exception
  when unique_violation then
    raise exception 'A pickup location with this name already exists';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: remove a campus pin
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_pickup_location(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pickup_locations;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can manage pickup locations';
  end if;

  delete from public.pickup_locations where id = p_id returning * into v_row;

  if v_row is null then
    raise exception 'Pickup location not found';
  end if;

  perform public.write_audit(
    'pickup_location.deleted', 'pickup_location', v_row.id::text,
    jsonb_build_object('name', v_row.name)
  );
end;
$$;
