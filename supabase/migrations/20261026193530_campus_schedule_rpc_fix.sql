-- Qualify SQL aliases so schedule JSON iteration does not conflict with PL/pgSQL variables.
create or replace function public.campus_api(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare u uuid:=auth.uid(); p public.campus_posts; c public.campus_claims; t public.campus_transfers;
 a public.campus_appointments; l public.loans; secret borrowbuddy_private.campus_codes;
 ident uuid; v_id uuid; host uuid; recipient uuid; chosen jsonb; x jsonb; paths text[];
 code text; v_kind text; reason text; body text; starts timestamptz; ends timestamptz;
 schedule public.campus_schedules; count_rows int;
begin
 if u is null or not public.is_verified(u) then raise exception 'Verified membership required'; end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request'; end if;
 ident:=nullif(p_data->>'id','')::uuid;
 if p_action='save_post' then
  ident:=coalesce(ident,gen_random_uuid());
  select * into p from public.campus_posts where id=ident for update;
  if p.id is not null and (p.owner_id<>u or p.status<>'open') then raise exception 'This post cannot be edited'; end if;
  select coalesce(array_agg(value),'{}') into paths from jsonb_array_elements_text(p_data->'images');
  if cardinality(paths) not between 1 and 6 or exists(select 1 from unnest(paths) path where path not like u::text||'/'||ident::text||'/%' or not exists(select 1 from storage.objects o where o.bucket_id='campus-photos' and o.name=path)) then raise exception 'Upload one to six photos belonging to this post'; end if;
  v_kind:=p_data->>'kind';
  if p.id is not null and p.kind<>v_kind then raise exception 'Post type cannot change'; end if;
  if v_kind='found' and ((p_data->>'found_on')::date>(now() at time zone 'Asia/Kolkata')::date or char_length(trim(coalesce(p_data->>'identifying_notes','')))<5) then raise exception 'Add a valid found date and private identifying notes'; end if;
  insert into public.campus_posts(id,owner_id,kind,title,description,category_id,location,pickup_location_id,found_on,condition,hold_hours,images)
  values(ident,u,v_kind,trim(p_data->>'title'),trim(p_data->>'description'),(p_data->>'category_id')::uuid,trim(p_data->>'location'),nullif(p_data->>'pickup_location_id','')::uuid,nullif(p_data->>'found_on','')::date,nullif(p_data->>'condition',''),coalesce((p_data->>'hold_hours')::int,48),paths)
  on conflict(id) do update set title=excluded.title,description=excluded.description,category_id=excluded.category_id,location=excluded.location,pickup_location_id=excluded.pickup_location_id,found_on=excluded.found_on,condition=excluded.condition,hold_hours=excluded.hold_hours,images=excluded.images,updated_at=now();
  if v_kind='found' then insert into public.campus_post_notes values(ident,trim(p_data->>'identifying_notes')) on conflict(post_id) do update set identifying_notes=excluded.identifying_notes; end if;
  perform public.write_audit('campus.post.saved','campus_post',ident::text,'{}');
  return jsonb_build_object('id',ident);
 elsif p_action='claim' then
  select * into p from public.campus_posts where id=ident for update;
  if p.id is null or p.kind<>'found' or p.status<>'open' or p.owner_id=u or not public.is_verified(p.owner_id) then raise exception 'This item cannot be claimed'; end if;
  select id into v_id from public.campus_claims where post_id=p.id and claimant_id=u and status='pending';
  if v_id is not null then return jsonb_build_object('id',v_id); end if;
  insert into public.campus_claims(post_id,claimant_id,evidence) values(p.id,u,trim(p_data->>'evidence')) returning id into v_id;
  perform borrowbuddy_private.campus_notice(id,'Ownership claim needs review','Review the private claim evidence.',jsonb_build_object('campus_claim_id',v_id)) from public.profiles where is_admin and verification_status='verified';
  perform public.write_audit('campus.claim.submitted','campus_claim',v_id::text,'{}');
  return jsonb_build_object('id',v_id);
 elsif p_action='withdraw_claim' then
  update public.campus_claims set status='withdrawn' where id=ident and claimant_id=u and status='pending';
  if not found then raise exception 'Pending claim not found'; end if;
  return jsonb_build_object('id',ident);
 elsif p_action='review_claim' then
  if not public.is_admin(u) then raise exception 'Admin review required'; end if;
  select post_id into v_id from public.campus_claims where id=ident;
  select * into p from public.campus_posts where id=v_id for update;
  select * into c from public.campus_claims where id=ident for update;
  if c.id is null or c.claimant_id=u then raise exception 'You cannot review this claim'; end if;
  select * into t from public.campus_transfers where claim_id=c.id;
  if c.status='approved' and t.id is not null and p_data->>'decision'='approve' then return jsonb_build_object('id',t.id); end if;
  if c.status<>'pending' or p.status<>'open' or not public.is_verified(c.claimant_id) or not public.is_verified(p.owner_id) then raise exception 'This claim is no longer pending'; end if;
  reason:=trim(p_data->>'reason');
  if char_length(coalesce(reason,'')) not between 5 and 1000 then raise exception 'Add a review reason (5–1000 characters)'; end if;
  if p_data->>'decision'='approve' then
   update public.campus_claims set status='approved',decision_note=reason,reviewed_by=u,reviewed_at=now() where id=c.id;
   update public.campus_claims set status='closed',decision_note='Another claim was approved.' where post_id=p.id and id<>c.id and status='pending';
   insert into public.campus_transfers(post_id,claim_id,host_id,recipient_id) values(p.id,c.id,p.owner_id,c.claimant_id) returning id into v_id;
   update public.campus_posts set status='reserved',updated_at=now() where id=p.id;
   perform borrowbuddy_private.campus_notice(p.owner_id,'Found-item claim approved','Arrange collection in your private conversation.',jsonb_build_object('campus_transfer_id',v_id));
   perform borrowbuddy_private.campus_notice(c.claimant_id,'Your ownership claim was approved','Arrange collection and show your collection code.',jsonb_build_object('campus_transfer_id',v_id));
  elsif p_data->>'decision'='reject' then
   update public.campus_claims set status='rejected',decision_note=reason,reviewed_by=u,reviewed_at=now() where id=c.id;
   perform borrowbuddy_private.campus_notice(c.claimant_id,'Ownership claim reviewed','Open your claim to read the decision.',jsonb_build_object('campus_post_id',p.id));
   v_id:=p.id;
  else raise exception 'Choose approve or reject'; end if;
  perform public.write_audit('campus.claim.'||(p_data->>'decision'),'campus_claim',c.id::text,'{}');
  return jsonb_build_object('id',v_id);
 elsif p_action='reserve' then
  select * into p from public.campus_posts where id=ident for update;
  if p.id is null or p.kind<>'giveaway' or p.owner_id=u or not public.is_verified(p.owner_id) then raise exception 'This giveaway cannot be reserved'; end if;
  select * into t from public.campus_transfers where post_id=p.id and status='active' for update;
  if t.id is not null and t.expires_at<=now() then perform borrowbuddy_private.campus_close(t.id,'expired','The giveaway reservation expired.'); t:=null; p.status:='open'; end if;
  if t.id is not null and t.recipient_id=u then return jsonb_build_object('id',t.id); end if;
  if p.status<>'open' or t.id is not null then raise exception 'Another student has already reserved this item'; end if;
  insert into public.campus_transfers(post_id,host_id,recipient_id,expires_at) values(p.id,p.owner_id,u,now()+make_interval(hours=>p.hold_hours)) returning id into v_id;
  update public.campus_posts set status='reserved',updated_at=now() where id=p.id;
  perform borrowbuddy_private.campus_notice(p.owner_id,'Your giveaway was reserved','Arrange collection before the reservation expires.',jsonb_build_object('campus_transfer_id',v_id));
  perform public.write_audit('campus.giveaway.reserved','campus_transfer',v_id::text,'{}');
  return jsonb_build_object('id',v_id);
 elsif p_action in ('cancel_transfer','revoke_claim','generate_code','confirm_code','send_message','read_thread') then
  select post_id into v_id from public.campus_transfers where id=ident;
  perform 1 from public.campus_posts where id=v_id for update;
  select * into t from public.campus_transfers where id=ident for update;
  if t.id is null then raise exception 'Collection not found'; end if;
  if p_action='revoke_claim' then
   if not public.is_admin(u) or t.claim_id is null then raise exception 'Admin approval revocation required'; end if;
  elsif u not in(t.host_id,t.recipient_id) then raise exception 'This collection is private'; end if;
  if p_action='read_thread' then
   update public.campus_transfers set host_read_at=case when u=host_id then now() else host_read_at end,recipient_read_at=case when u=recipient_id then now() else recipient_read_at end where id=t.id;
   return jsonb_build_object('id',t.id);
  end if;
  if t.status<>'active' then raise exception 'This collection is read-only'; end if;
  if t.expires_at<=now() then
   perform borrowbuddy_private.campus_close(t.id,'expired','The giveaway reservation expired.');
   return jsonb_build_object('ok',false,'error','This reservation has expired.');
  end if;
  if p_action in ('cancel_transfer','revoke_claim') then
   reason:=trim(p_data->>'reason');
   if char_length(coalesce(reason,'')) not between 5 and 500 then raise exception 'Add a reason (5–500 characters)'; end if;
   perform borrowbuddy_private.campus_close(t.id,'cancelled',reason);
  elsif p_action='send_message' then
   if not public.is_verified(t.host_id) or not public.is_verified(t.recipient_id) then raise exception 'Both members must remain verified'; end if;
   body:=trim(p_data->>'body');
   insert into public.campus_messages(transfer_id,sender_id,client_id,body) values(t.id,u,(p_data->>'client_id')::uuid,body) on conflict(sender_id,client_id) do nothing returning id into v_id;
   if v_id is not null then perform borrowbuddy_private.campus_notice(case when u=t.host_id then t.recipient_id else t.host_id end,'New collection message','Open your private collection conversation.',jsonb_build_object('campus_transfer_id',t.id),true); end if;
  elsif p_action='generate_code' then
   if u<>t.recipient_id or not public.is_verified(t.host_id) then raise exception 'Only the authorized recipient can generate a code'; end if;
   code:=public.random_digits(6);
   insert into borrowbuddy_private.campus_codes values(t.id,encode(extensions.digest(code,'sha256'),'hex'),least(now()+interval '15 minutes',coalesce(t.expires_at,now()+interval '15 minutes')),0)
   on conflict(transfer_id) do update set hash=excluded.hash,expires_at=excluded.expires_at,attempts=0;
   return jsonb_build_object('id',t.id,'code',code,'expires_at',least(now()+interval '15 minutes',coalesce(t.expires_at,now()+interval '15 minutes')));
  elsif p_action='confirm_code' then
   if u<>t.host_id or not public.is_verified(t.recipient_id) then raise exception 'Only the finder or donor can confirm collection'; end if;
   select * into secret from borrowbuddy_private.campus_codes where transfer_id=t.id for update;
   if secret.transfer_id is null or secret.expires_at<=now() then return jsonb_build_object('ok',false,'error','Ask the recipient for a fresh collection code.'); end if;
   if secret.attempts>=5 then return jsonb_build_object('ok',false,'error','Five attempts used. Ask the recipient to regenerate their code.'); end if;
   if encode(extensions.digest(coalesce(p_data->>'code',''),'sha256'),'hex')<>secret.hash then
    update borrowbuddy_private.campus_codes set attempts=attempts+1 where transfer_id=t.id;
    return jsonb_build_object('ok',false,'error','Incorrect collection code.');
   end if;
   update public.campus_transfers set status='completed',completed_at=now() where id=t.id;
   update public.campus_posts set status='completed',updated_at=now() where id=t.post_id;
   update public.campus_appointments set status='completed' where transfer_id=t.id and status='booked';
   delete from borrowbuddy_private.campus_occupancy where appointment_id in(select id from public.campus_appointments where transfer_id=t.id);
   delete from borrowbuddy_private.campus_codes where transfer_id=t.id;
   perform borrowbuddy_private.campus_notice(t.recipient_id,'Collection complete','Your collection receipt is ready.',jsonb_build_object('campus_transfer_id',t.id));
   perform public.write_audit('campus.collection.completed','campus_transfer',t.id::text,'{}');
  end if;
  return jsonb_build_object('id',t.id,'ok',true);
 elsif p_action='hide_post' then
  select * into p from public.campus_posts where id=ident for update;
  if p.id is null or (p.owner_id<>u and not public.is_admin(u)) or p.status='completed' then raise exception 'This post cannot be hidden'; end if;
  reason:=trim(p_data->>'reason');
  if char_length(coalesce(reason,'')) not between 5 and 500 then raise exception 'Add a reason (5–500 characters)'; end if;
  if not public.is_admin(u) and exists(select 1 from public.campus_transfers where post_id=p.id and status='active') then raise exception 'Cancel the active collection before withdrawing your post'; end if;
  for t in select * from public.campus_transfers where post_id=p.id and status='active' loop perform borrowbuddy_private.campus_close(t.id,'cancelled',reason); end loop;
  update public.campus_posts set status='hidden',updated_at=now() where id=p.id;
  update public.campus_claims set status='closed',decision_note='This post was withdrawn.' where post_id=p.id and status='pending';
  perform public.write_audit('campus.post.hidden','campus_post',p.id::text,jsonb_build_object('reason',reason));
  return jsonb_build_object('id',p.id);
 elsif p_action='save_schedule' then
  if (p_data->>'slot_minutes')::int not in(15,30,60) then raise exception 'Choose 15, 30 or 60 minutes'; end if;
  if jsonb_typeof(p_data->'weekly')<>'array' or jsonb_typeof(p_data->'exceptions')<>'array' or jsonb_array_length(p_data->'weekly')>7 or jsonb_array_length(p_data->'exceptions')>90 then raise exception 'Invalid schedule'; end if;
  if not exists(select 1 from public.pickup_locations where id=(p_data->>'pickup_location_id')::uuid and is_active) then raise exception 'Choose an active pickup location'; end if;
  if (select count(distinct entry.value->>'day') from jsonb_array_elements(p_data->'weekly') as entry(value))<>jsonb_array_length(p_data->'weekly') or
     (select count(distinct entry.value->>'date') from jsonb_array_elements(p_data->'exceptions') as entry(value))<>jsonb_array_length(p_data->'exceptions') then raise exception 'Each weekday or date may appear once'; end if;
  for x in select value from jsonb_array_elements((p_data->'weekly')||(p_data->'exceptions')) loop
   if x ? 'day' then if (x->>'day')::int not between 0 and 6 then raise exception 'Invalid weekday'; end if;
   else if (x->>'date')::date is null then raise exception 'Invalid exception date'; end if; end if;
   if not coalesce((x->>'blocked')::boolean,false) then
    if coalesce(x->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(x->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (x->>'start')::time>=(x->>'end')::time then raise exception 'Windows must start and finish on the same day'; end if;
   end if;
  end loop;
  insert into public.campus_schedules(host_id,pickup_location_id,slot_minutes,weekly,exceptions)
  values(u,(p_data->>'pickup_location_id')::uuid,(p_data->>'slot_minutes')::int,p_data->'weekly',p_data->'exceptions')
  on conflict(host_id) do update set pickup_location_id=excluded.pickup_location_id,slot_minutes=excluded.slot_minutes,weekly=excluded.weekly,exceptions=excluded.exceptions,updated_at=now();
  return jsonb_build_object('id',u);
 elsif p_action='cancel_appointment' then
  select * into a from public.campus_appointments where id=ident for update;
  if a.id is null or u not in(a.host_id,a.recipient_id) then raise exception 'Appointment not found'; end if;
  if a.status='booked' then
   update public.campus_appointments set status='cancelled' where id=a.id;
   delete from borrowbuddy_private.campus_occupancy where appointment_id=a.id;
   perform borrowbuddy_private.campus_notice(case when u=a.host_id then a.recipient_id else a.host_id end,'Handover cancelled','Choose another time in your handover details.',case when a.loan_id is not null then jsonb_build_object('loan_id',a.loan_id) else jsonb_build_object('campus_transfer_id',a.transfer_id) end);
  end if;
  return jsonb_build_object('id',a.id);
 elsif p_action='book' then
  v_kind:=p_data->>'kind';
  if nullif(p_data->>'loan_id','') is not null then
   select * into l from public.loans where id=(p_data->>'loan_id')::uuid for update;
   host:=l.owner_id; recipient:=l.borrower_id;
   if l.id is null or u not in(host,recipient) or (v_kind='pickup' and l.status<>'awaiting_pickup') or (v_kind='return' and l.status not in('active','return_pending','overdue')) or v_kind not in('pickup','return') then raise exception 'This loan cannot schedule that handover'; end if;
  else
   select post_id into v_id from public.campus_transfers where id=(p_data->>'transfer_id')::uuid;
   perform 1 from public.campus_posts where id=v_id for update;
   select * into t from public.campus_transfers where id=(p_data->>'transfer_id')::uuid for update;
   host:=t.host_id; recipient:=t.recipient_id;
   if t.id is null or u not in(host,recipient) or v_kind<>'collection' or t.status<>'active' then raise exception 'Collection not available'; end if;
   if t.expires_at<=now() then perform borrowbuddy_private.campus_close(t.id,'expired','The giveaway reservation expired.'); return jsonb_build_object('ok',false,'error','This reservation expired.'); end if;
  end if;
  if not public.is_verified(host) or not public.is_verified(recipient) then raise exception 'Both members must remain verified'; end if;
  -- Serialize every participating member, including reversed host/recipient roles.
  perform pg_advisory_xact_lock(hashtextextended(member.id::text,0)) from unnest(array[host,recipient]) as member(id) order by member.id;
  select * into a from public.campus_appointments where status='booked' and kind=v_kind and
   ((l.id is not null and loan_id=l.id) or (t.id is not null and transfer_id=t.id)) for update;
  starts:=(p_data->>'starts_at')::timestamptz;
  if a.id is not null and a.starts_at=starts then return jsonb_build_object('id',a.id); end if;
  if a.id is not null then
   update public.campus_appointments set status='cancelled' where id=a.id;
   delete from borrowbuddy_private.campus_occupancy where appointment_id=a.id;
  end if;
  select * into schedule from public.campus_schedules where host_id=host;
  -- Same validation as the rendered slots, under member locks.
  select value into chosen from jsonb_array_elements(public.campus_slots(host,(starts at time zone 'Asia/Kolkata')::date)) where (value->>'starts_at')::timestamptz=starts;
  if chosen is null then raise exception 'That time is no longer available. Choose another slot.'; end if;
  ends:=(chosen->>'ends_at')::timestamptz;
  if exists(select 1 from borrowbuddy_private.campus_occupancy where user_id in(host,recipient) and during && tstzrange(starts,ends,'[)')) then raise exception 'A participant already has a handover at that time'; end if;
  if t.expires_at is not null and ends>t.expires_at then raise exception 'Collection must finish before the reservation expires'; end if;
  if l.id is not null and ((starts at time zone 'Asia/Kolkata')::date<l.start_date or (v_kind='pickup' and (starts at time zone 'Asia/Kolkata')::date>l.due_date)) then raise exception 'Pickup must fit the loan dates'; end if;
  insert into public.campus_appointments(host_id,recipient_id,loan_id,transfer_id,kind,starts_at,ends_at,pickup_location_id)
  values(host,recipient,l.id,t.id,v_kind,starts,ends,(chosen->>'pickup_location_id')::uuid) returning id into v_id;
  insert into borrowbuddy_private.campus_occupancy values(v_id,host,tstzrange(starts,ends,'[)')),(v_id,recipient,tstzrange(starts,ends,'[)'));
  perform borrowbuddy_private.campus_notice(case when u=host then recipient else host end,'Handover time booked','View your appointment in campus handovers.',case when l.id is not null then jsonb_build_object('loan_id',l.id) else jsonb_build_object('campus_transfer_id',t.id) end);
  perform public.write_audit('campus.appointment.booked','campus_appointment',v_id::text,'{}');
  return jsonb_build_object('id',v_id);
 end if;
 raise exception 'Unknown campus action';
end; $$;
