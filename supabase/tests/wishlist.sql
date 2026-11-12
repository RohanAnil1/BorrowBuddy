-- Saved items are private, need a verified student, and cannot reach hidden drafts.
begin;
create temp table wishlist_context(owner_id uuid, saver_id uuid, other_id uuid, pending_id uuid, item_id uuid, draft_id uuid);
grant all on wishlist_context to authenticated, anon;
do $$
declare
  v_owner uuid := gen_random_uuid(); v_saver uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
  v_item uuid; v_draft uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_owner, 'wish-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Wish QA owner"}'),
    (v_saver, 'wish-qa-' || v_saver || '@bennett.edu.in', '{"full_name":"Wish QA saver"}'),
    (v_other, 'wish-qa-' || v_other || '@bennett.edu.in', '{"full_name":"Wish QA other"}'),
    (v_pending, 'wish-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Wish QA pending"}');
  update public.profiles set verification_status = 'verified' where id in (v_owner, v_saver, v_other);
  insert into public.items(owner_id, category_id, title)
    select v_owner, id, 'Wish QA listed' from public.categories order by sort_order limit 1 returning id into v_item;
  insert into public.items(owner_id, category_id, title, status)
    select v_owner, id, 'Wish QA draft', 'draft' from public.categories order by sort_order limit 1 returning id into v_draft;
  insert into wishlist_context values(v_owner, v_saver, v_other, v_pending, v_item, v_draft);
end;
$$;

-- The saver can save a listed item, see it, and not see anyone else's list.
select set_config('request.jwt.claims', json_build_object('sub', saver_id)::text, true) from wishlist_context;
set local role authenticated;
do $$
declare v wishlist_context;
begin
  select * into v from wishlist_context;
  insert into public.wishlist_items(user_id, item_id) values (v.saver_id, v.item_id);
  if (select count(*) from public.wishlist_items) <> 1 then raise exception 'FAIL: saved row not visible to its owner'; end if;

  begin
    insert into public.wishlist_items(user_id, item_id) values (v.saver_id, v.draft_id);
    raise exception 'FAIL: saved a hidden draft';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.wishlist_items(user_id, item_id) values (v.other_id, v.item_id);
    raise exception 'FAIL: saved into another student''s list';
  exception when insufficient_privilege then null; end;

  begin
    update public.wishlist_items set created_at = now() where user_id = v.saver_id;
    raise exception 'FAIL: wishlist rows are updatable';
  exception when insufficient_privilege then null; end;
end;
$$;

-- Another student sees nothing and cannot delete the saver's row.
select set_config('request.jwt.claims', json_build_object('sub', other_id)::text, true) from wishlist_context;
do $$
declare v wishlist_context;
begin
  select * into v from wishlist_context;
  if exists(select 1 from public.wishlist_items) then raise exception 'FAIL: another student''s list is visible'; end if;
  delete from public.wishlist_items where user_id = v.saver_id;
end;
$$;

-- An unverified student cannot save.
select set_config('request.jwt.claims', json_build_object('sub', pending_id)::text, true) from wishlist_context;
do $$
declare v wishlist_context;
begin
  select * into v from wishlist_context;
  begin
    insert into public.wishlist_items(user_id, item_id) values (v.pending_id, v.item_id);
    raise exception 'FAIL: unverified student saved an item';
  exception when insufficient_privilege then null; end;
end;
$$;

-- The saver's row survived the other student's delete, and the saver can remove it.
select set_config('request.jwt.claims', json_build_object('sub', saver_id)::text, true) from wishlist_context;
do $$
declare v wishlist_context;
begin
  select * into v from wishlist_context;
  if (select count(*) from public.wishlist_items) <> 1 then raise exception 'FAIL: another student deleted the row'; end if;
  delete from public.wishlist_items where item_id = v.item_id;
  if exists(select 1 from public.wishlist_items) then raise exception 'FAIL: owner could not remove the row'; end if;
end;
$$;
reset role;

-- Anonymous visitors have no access at all.
set local role anon;
do $$ begin
  begin perform 1 from public.wishlist_items;
    raise exception 'FAIL: anonymous wishlist access';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- Deleting an item clears it from every list.
do $$
declare v wishlist_context;
begin
  select * into v from wishlist_context;
  insert into public.wishlist_items(user_id, item_id) values (v.saver_id, v.item_id);
  delete from public.items where id = v.item_id;
  if exists(select 1 from public.wishlist_items where item_id = v.item_id) then raise exception 'FAIL: deleted item kept in a list'; end if;
end;
$$;
select 'PASS: private saved items, verified-only saves, hidden drafts, no updates, anon blocked, cascade on delete' as result;
rollback;
