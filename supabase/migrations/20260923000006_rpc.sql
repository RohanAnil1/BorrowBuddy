-- ===========================================================================
-- BorrowBuddy RPCs
-- Every state-changing operation goes through one of these functions so the
-- rules cannot be bypassed by a client. They run as SECURITY DEFINER and
-- perform their own authorization checks.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

create or replace function public.approve_request(p_request_id uuid)
returns public.loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.borrow_requests;
  v_item public.items;
  v_loan public.loans;
  v_active int;
  v_declined record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req from public.borrow_requests where id = p_request_id for update;
  if v_req is null then
    raise exception 'Request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  select * into v_item from public.items where id = v_req.item_id for update;
  if v_item.owner_id <> v_uid then
    raise exception 'Only the owner can approve this request';
  end if;
  if v_item.status <> 'available' then
    raise exception 'This item is not currently available';
  end if;
  if not public.is_verified(v_req.borrower_id) then
    raise exception 'The borrower is not a verified student';
  end if;
  if v_req.end_date < current_date then
    raise exception 'The requested dates have already passed';
  end if;
  if (v_req.end_date - v_req.start_date) + 1 > v_item.max_loan_days then
    raise exception 'The requested period exceeds this item''s maximum loan length of % days',
      v_item.max_loan_days;
  end if;

  select count(*) into v_active
  from public.loans
  where borrower_id = v_req.borrower_id
    and status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed');
  if v_active >= 5 then
    raise exception 'The borrower already has the maximum number of active loans';
  end if;

  if exists (
    select 1 from public.availability_blocks b
    where b.item_id = v_item.id
      and daterange(b.start_date, b.end_date, '[]')
        && daterange(v_req.start_date, v_req.end_date, '[]')
  ) then
    raise exception 'Those dates are blocked by the owner';
  end if;

  begin
    insert into public.loans (request_id, item_id, owner_id, borrower_id, start_date, due_date)
    values (p_request_id, v_item.id, v_item.owner_id, v_req.borrower_id, v_req.start_date, v_req.end_date)
    returning * into v_loan;
  exception
    when exclusion_violation then
      raise exception 'Those dates are no longer available — someone else just booked them';
  end;

  update public.borrow_requests
  set status = 'approved', responded_at = now()
  where id = p_request_id;

  for v_declined in
    update public.borrow_requests r
    set status = 'declined',
        decline_reason = 'The dates were taken by another request',
        responded_at = now()
    where r.item_id = v_item.id
      and r.id <> p_request_id
      and r.status = 'pending'
      and daterange(r.start_date, r.end_date, '[]')
        && daterange(v_req.start_date, v_req.end_date, '[]')
    returning r.id, r.borrower_id, r.item_id
  loop
    perform public.create_notification(
      v_declined.borrower_id,
      'request_declined',
      'Request declined',
      'The dates you asked for were taken by another request.',
      jsonb_build_object('request_id', v_declined.id, 'item_id', v_declined.item_id)
    );
  end loop;

  insert into public.conversations (type, loan_id) values ('private', v_loan.id);
  insert into public.conversation_members (conversation_id, user_id)
  select c.id, u.user_id
  from public.conversations c
  cross join unnest(array[v_item.owner_id, v_req.borrower_id]) as u(user_id)
  where c.loan_id = v_loan.id;

  perform public.create_notification(
    v_req.borrower_id,
    'request_approved',
    'Request approved',
    format('Your request for "%s" was approved. Coordinate the pickup in chat.', v_item.title),
    jsonb_build_object('loan_id', v_loan.id, 'item_id', v_item.id)
  );

  perform public.write_audit(
    'request.approved', 'loan', v_loan.id::text,
    jsonb_build_object('request_id', p_request_id, 'item_id', v_item.id)
  );

  return v_loan;
end;
$$;

create or replace function public.decline_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.borrow_requests;
  v_item public.items;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req from public.borrow_requests where id = p_request_id for update;
  if v_req is null then
    raise exception 'Request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  select * into v_item from public.items where id = v_req.item_id;
  if v_item.owner_id <> v_uid then
    raise exception 'Only the owner can decline this request';
  end if;

  update public.borrow_requests
  set status = 'declined',
      decline_reason = nullif(trim(p_reason), ''),
      responded_at = now()
  where id = p_request_id;

  perform public.create_notification(
    v_req.borrower_id,
    'request_declined',
    'Request declined',
    coalesce(
      nullif(trim(p_reason), ''),
      format('Your request for "%s" was declined.', v_item.title)
    ),
    jsonb_build_object('request_id', p_request_id, 'item_id', v_item.id)
  );

  perform public.write_audit('request.declined', 'request', p_request_id::text);
end;
$$;

create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.borrow_requests;
  v_item public.items;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req from public.borrow_requests where id = p_request_id for update;
  if v_req is null then
    raise exception 'Request not found';
  end if;
  if v_req.borrower_id <> v_uid then
    raise exception 'Only the borrower can cancel this request';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled';
  end if;

  select * into v_item from public.items where id = v_req.item_id;

  update public.borrow_requests
  set status = 'cancelled', responded_at = now()
  where id = p_request_id;

  perform public.create_notification(
    v_item.owner_id,
    'request_cancelled',
    'Request cancelled',
    format('A borrower cancelled their request for "%s".', v_item.title),
    jsonb_build_object('request_id', p_request_id, 'item_id', v_item.id)
  );

  perform public.write_audit('request.cancelled', 'request', p_request_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Handover (QR / 6-digit codes)
--   Pickup: borrower shows the code, owner confirms.
--   Return: owner shows the code, borrower confirms.
-- ---------------------------------------------------------------------------

create or replace function public.generate_handover_token(
  p_loan_id uuid,
  p_kind public.handover_kind
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_code text;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.borrower_id then
      raise exception 'Only the borrower can show the pickup code';
    end if;
    if v_loan.status <> 'awaiting_pickup' then
      raise exception 'This loan is not awaiting pickup';
    end if;
  else
    if v_uid <> v_loan.owner_id then
      raise exception 'Only the owner can show the return code';
    end if;
    if v_loan.status not in ('active', 'return_pending', 'overdue') then
      raise exception 'This item is not currently out on loan';
    end if;
  end if;

  v_code := public.random_digits(6);
  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

  if p_kind = 'pickup' then
    update public.loans
    set handover_token_hash = v_hash,
        handover_token_expires_at = now() + interval '15 minutes',
        handover_attempts = 0
    where id = p_loan_id;
  else
    update public.loans
    set return_token_hash = v_hash,
        return_token_expires_at = now() + interval '15 minutes',
        return_attempts = 0
    where id = p_loan_id;
  end if;

  return v_code;
end;
$$;

create or replace function public.confirm_handover(
  p_loan_id uuid,
  p_token text,
  p_kind public.handover_kind
)
returns public.loans
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_hash text;
  v_expires timestamptz;
  v_attempts int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.owner_id then
      raise exception 'Only the owner can confirm the pickup';
    end if;
    v_hash := v_loan.handover_token_hash;
    v_expires := v_loan.handover_token_expires_at;
    v_attempts := v_loan.handover_attempts;
  else
    if v_uid <> v_loan.borrower_id then
      raise exception 'Only the borrower can confirm the return';
    end if;
    v_hash := v_loan.return_token_hash;
    v_expires := v_loan.return_token_expires_at;
    v_attempts := v_loan.return_attempts;
  end if;

  if v_hash is null then
    raise exception 'Ask the other student to show a fresh code';
  end if;
  if v_expires < now() then
    raise exception 'That code has expired — ask for a new one';
  end if;
  if v_attempts >= 5 then
    raise exception 'Too many incorrect attempts — ask for a new code';
  end if;

  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then
    if p_kind = 'pickup' then
      update public.loans set handover_attempts = handover_attempts + 1 where id = p_loan_id;
    else
      update public.loans set return_attempts = return_attempts + 1 where id = p_loan_id;
    end if;
    raise exception 'Incorrect code';
  end if;

  if p_kind = 'pickup' then
    update public.loans
    set status = 'active',
        pickup_confirmed_at = now(),
        handover_token_hash = null,
        handover_token_expires_at = null,
        handover_attempts = 0
    where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.borrower_id,
      'handover_confirmed',
      'Pickup confirmed',
      format('Enjoy! Please return the item by %s.', to_char(v_loan.due_date, 'DD Mon YYYY')),
      jsonb_build_object('loan_id', v_loan.id)
    );
  else
    update public.loans
    set status = 'returned',
        returned_at = now(),
        return_confirmed_at = now(),
        return_token_hash = null,
        return_token_expires_at = null,
        return_attempts = 0
    where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.owner_id,
      'loan_returned',
      'Item returned',
      'The borrower confirmed the return. Leave a rating for them.',
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.create_notification(
      v_loan.borrower_id,
      'loan_returned',
      'Return confirmed',
      'Thanks for returning the item. Leave a rating for the owner.',
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.notify_waitlist_for_item(v_loan.item_id);
  end if;

  return v_loan;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loan cancellation (no-show / change of mind before pickup)
-- ---------------------------------------------------------------------------

create or replace function public.cancel_loan(p_loan_id uuid, p_reason text default null)
returns public.loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_item public.items;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;

  if v_uid = v_loan.owner_id then
    if v_loan.status <> 'awaiting_pickup' then
      raise exception 'An active loan cannot be cancelled — open an incident instead';
    end if;
    v_other := v_loan.borrower_id;
  elsif v_uid = v_loan.borrower_id then
    if v_loan.status <> 'awaiting_pickup' then
      raise exception 'You can only cancel before pickup';
    end if;
    v_other := v_loan.owner_id;
  else
    raise exception 'You are not a party to this loan';
  end if;

  select * into v_item from public.items where id = v_loan.item_id;

  update public.loans set status = 'cancelled' where id = p_loan_id returning * into v_loan;

  perform public.create_notification(
    v_other,
    'loan_cancelled',
    'Loan cancelled',
    coalesce(nullif(trim(p_reason), ''), format('The loan for "%s" was cancelled.', v_item.title)),
    jsonb_build_object('loan_id', p_loan_id)
  );
  perform public.notify_waitlist_for_item(v_loan.item_id);

  perform public.write_audit(
    'loan.cancelled', 'loan', p_loan_id::text,
    jsonb_build_object('by', v_uid, 'reason', p_reason)
  );

  return v_loan;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------------

create or replace function public.join_waitlist(
  p_item_id uuid,
  p_start date,
  p_end date
)
returns public.waitlist_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.items;
  v_entry public.waitlist_entries;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  if not public.is_verified(v_uid) then
    raise exception 'Only verified students can join a waitlist';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if v_item is null then
    raise exception 'Item not found';
  end if;
  if v_item.owner_id = v_uid then
    raise exception 'You cannot waitlist your own item';
  end if;

  begin
    insert into public.waitlist_entries (item_id, user_id, desired_start, desired_end)
    values (p_item_id, v_uid, p_start, p_end)
    returning * into v_entry;
  exception
    when unique_violation then
      raise exception 'You are already on the waitlist for this item';
  end;

  return v_entry;
end;
$$;

create or replace function public.leave_waitlist(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.waitlist_entries
  set status = 'cancelled'
  where id = p_entry_id
    and user_id = v_uid
    and status in ('waiting', 'notified');

  if not found then
    raise exception 'Waitlist entry not found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = v_uid;

  if not found then
    raise exception 'You are not a member of this conversation';
  end if;
end;
$$;

create or replace function public.create_community_conversation(p_title text)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can create community channels';
  end if;

  insert into public.conversations (type, title)
  values ('community', trim(p_title))
  returning * into v_conv;

  perform public.write_audit('conversation.created', 'conversation', v_conv.id::text);
  return v_conv;
end;
$$;

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------

create or replace function public.open_incident(
  p_loan_id uuid,
  p_type public.incident_type,
  p_description text,
  p_photo_paths text[] default '{}'
)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_incident public.incidents;
  v_other uuid;
  v_admin record;
  v_path text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;
  if v_uid not in (v_loan.owner_id, v_loan.borrower_id) then
    raise exception 'You are not a party to this loan';
  end if;
  if v_loan.status in ('returned', 'cancelled') then
    raise exception 'This loan is already closed';
  end if;

  insert into public.incidents (loan_id, reporter_id, type, description)
  values (p_loan_id, v_uid, p_type, p_description)
  returning * into v_incident;

  foreach v_path in array coalesce(p_photo_paths, '{}'::text[])
  loop
    insert into public.incident_photos (incident_id, path, phase)
    values (v_incident.id, v_path, 'after');
  end loop;

  if p_type = 'lost' and v_loan.status <> 'lost' then
    update public.loans set status = 'lost' where id = p_loan_id;
  elsif p_type = 'damage' and v_loan.status not in ('disputed', 'lost') then
    update public.loans set status = 'disputed' where id = p_loan_id;
  end if;

  v_other := case when v_uid = v_loan.owner_id then v_loan.borrower_id else v_loan.owner_id end;

  perform public.create_notification(
    v_other,
    'incident_opened',
    'An incident was reported',
    'A report was filed on a loan you are part of. An admin will review it.',
    jsonb_build_object('incident_id', v_incident.id, 'loan_id', p_loan_id, 'type', p_type)
  );

  for v_admin in select id from public.profiles where is_admin
  loop
    perform public.create_notification(
      v_admin.id,
      'incident_opened',
      'New incident to review',
      p_description,
      jsonb_build_object('incident_id', v_incident.id, 'loan_id', p_loan_id, 'type', p_type)
    );
  end loop;

  perform public.write_audit(
    'incident.opened', 'incident', v_incident.id::text,
    jsonb_build_object('loan_id', p_loan_id, 'type', p_type)
  );

  return v_incident;
end;
$$;

create or replace function public.resolve_incident(
  p_incident_id uuid,
  p_decision text,
  p_resolution_note text,
  p_fine_amount int default null,
  p_fine_user_id uuid default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_incident public.incidents;
  v_loan public.loans;
  v_fine_user uuid;
  v_source public.fine_source;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can resolve incidents';
  end if;
  if p_decision not in ('resolved', 'rejected') then
    raise exception 'Decision must be resolved or rejected';
  end if;
  if char_length(trim(coalesce(p_resolution_note, ''))) < 5 then
    raise exception 'Add a short resolution note';
  end if;

  select * into v_incident from public.incidents where id = p_incident_id for update;
  if v_incident is null then
    raise exception 'Incident not found';
  end if;
  if v_incident.status not in ('open', 'under_review') then
    raise exception 'This incident is already closed';
  end if;

  select * into v_loan from public.loans where id = v_incident.loan_id for update;

  update public.incidents
  set status = p_decision::public.incident_status,
      resolution_note = p_resolution_note,
      resolved_by = v_uid,
      resolved_at = now()
  where id = p_incident_id
  returning * into v_incident;

  if p_fine_amount is not null and p_fine_amount > 0 then
    v_fine_user := coalesce(p_fine_user_id, v_loan.borrower_id);
    v_source := case v_incident.type
      when 'damage' then 'damage'
      when 'lost' then 'loss'
      when 'no_show' then 'no_show'
      else 'other'
    end;

    insert into public.fines (loan_id, user_id, amount, source, reason)
    values (
      v_loan.id, v_fine_user, p_fine_amount, v_source,
      format('Incident #%s: %s', left(v_incident.id::text, 8), v_incident.type)
    );

    perform public.create_notification(
      v_fine_user,
      'fine_created',
      'A fine was added',
      format('A fine of INR %s was added for a loan incident.', p_fine_amount),
      jsonb_build_object('incident_id', p_incident_id, 'loan_id', v_loan.id)
    );
  end if;

  if v_loan.status = 'disputed' then
    if v_incident.type = 'damage' then
      update public.loans
      set status = 'returned', returned_at = coalesce(returned_at, now())
      where id = v_loan.id;
    elsif v_incident.type = 'lost' then
      update public.loans set status = 'lost' where id = v_loan.id;
    else
      update public.loans
      set status = 'returned', returned_at = coalesce(returned_at, now())
      where id = v_loan.id;
    end if;
  end if;

  perform public.create_notification(
    v_incident.reporter_id,
    'incident_resolved',
    'Incident reviewed',
    p_resolution_note,
    jsonb_build_object('incident_id', p_incident_id, 'loan_id', v_loan.id, 'decision', p_decision)
  );

  perform public.write_audit(
    'incident.' || p_decision, 'incident', p_incident_id::text,
    jsonb_build_object('loan_id', v_loan.id, 'fine_amount', p_fine_amount)
  );

  return v_incident;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fines (settled offline, recorded here)
-- ---------------------------------------------------------------------------

create or replace function public.settle_fine(p_fine_id uuid, p_action text)
returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fine public.fines;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can settle fines';
  end if;
  if p_action not in ('settle', 'waive') then
    raise exception 'Action must be settle or waive';
  end if;

  update public.fines
  set status = case when p_action = 'settle' then 'settled'::public.fine_status
                    else 'waived'::public.fine_status end,
      settled_by = v_uid,
      settled_at = now()
  where id = p_fine_id and status = 'pending'
  returning * into v_fine;

  if v_fine is null then
    raise exception 'Pending fine not found';
  end if;

  perform public.create_notification(
    v_fine.user_id,
    'fine_settled',
    case when p_action = 'settle' then 'Fine marked as settled' else 'Fine waived' end,
    format('Your fine of INR %s was %s.', v_fine.amount,
      case when p_action = 'settle' then 'marked as settled' else 'waived' end),
    jsonb_build_object('fine_id', v_fine.id, 'loan_id', v_fine.loan_id)
  );

  perform public.write_audit(
    'fine.' || p_action, 'fine', p_fine_id::text,
    jsonb_build_object('amount', v_fine.amount, 'user_id', v_fine.user_id)
  );

  return v_fine;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: verification & reports
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_verification(
  p_profile_id uuid,
  p_status public.verification_status,
  p_note text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can review verifications';
  end if;
  if p_profile_id = v_uid then
    raise exception 'You cannot change your own verification status';
  end if;

  update public.profiles
  set verification_status = p_status,
      verification_note = nullif(trim(p_note), '')
  where id = p_profile_id
  returning * into v_profile;

  if v_profile is null then
    raise exception 'Profile not found';
  end if;

  perform public.create_notification(
    p_profile_id,
    (case when p_status = 'verified' then 'verification_approved' else 'verification_rejected' end)::public.notification_type,
    case
      when p_status = 'verified' then 'You are verified'
      when p_status = 'rejected' then 'Verification rejected'
      when p_status = 'suspended' then 'Account suspended'
      else 'Verification updated'
    end,
    coalesce(
      nullif(trim(p_note), ''),
      case
        when p_status = 'verified' then 'You can now borrow and lend items on BorrowBuddy.'
        else 'Your verification status was updated.'
      end
    ),
    jsonb_build_object('status', p_status)
  );

  perform public.write_audit(
    'verification.' || p_status, 'profile', p_profile_id::text,
    jsonb_build_object('note', p_note)
  );

  return v_profile;
end;
$$;

create or replace function public.admin_resolve_report(
  p_report_id uuid,
  p_decision text,
  p_note text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can resolve reports';
  end if;
  if p_decision not in ('resolved', 'dismissed') then
    raise exception 'Decision must be resolved or dismissed';
  end if;

  update public.reports
  set status = p_decision::public.report_status,
      resolved_by = v_uid,
      resolved_at = now()
  where id = p_report_id and status = 'open'
  returning * into v_report;

  if v_report is null then
    raise exception 'Open report not found';
  end if;

  perform public.create_notification(
    v_report.reporter_id,
    'report_resolved',
    'Report reviewed',
    coalesce(nullif(trim(p_note), ''), 'Thanks — our admins have reviewed your report.'),
    jsonb_build_object('report_id', p_report_id, 'decision', p_decision)
  );

  perform public.write_audit(
    'report.' || p_decision, 'report', p_report_id::text,
    jsonb_build_object('note', p_note)
  );

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron)
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_requests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_count int := 0;
  v_title text;
begin
  for v_req in
    update public.borrow_requests
    set status = 'expired', responded_at = now()
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning id, item_id, borrower_id
  loop
    select title into v_title from public.items where id = v_req.item_id;
    perform public.create_notification(
      v_req.borrower_id,
      'request_expired',
      'Request expired',
      format('Your request for "%s" expired without a response.', coalesce(v_title, 'an item')),
      jsonb_build_object('request_id', v_req.id, 'item_id', v_req.item_id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.flag_overdue_loans()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_count int := 0;
  v_days int;
  v_amount int;
  v_title text;
begin
  for v_loan in
    select * from public.loans
    where status in ('active', 'return_pending')
      and due_date < current_date
    for update
  loop
    update public.loans set status = 'overdue' where id = v_loan.id;

    v_days := current_date - v_loan.due_date;
    v_amount := least(v_days * 20, 1000);

    insert into public.fines (loan_id, user_id, amount, source, reason)
    values (
      v_loan.id, v_loan.borrower_id, v_amount, 'overdue',
      format('%s day(s) overdue', v_days)
    )
    on conflict (loan_id) where source = 'overdue'
    do update set amount = excluded.amount, reason = excluded.reason
    where fines.status = 'pending';

    select title into v_title from public.items where id = v_loan.item_id;

    perform public.create_notification(
      v_loan.borrower_id,
      'loan_overdue',
      'Item overdue',
      format('"%s" is overdue. A fine of INR %s has been recorded.', coalesce(v_title, 'An item'), v_amount),
      jsonb_build_object('loan_id', v_loan.id, 'amount', v_amount)
    );
    perform public.create_notification(
      v_loan.owner_id,
      'loan_overdue',
      'Your item is overdue',
      format('"%s" has not been returned yet.', coalesce(v_title, 'An item')),
      jsonb_build_object('loan_id', v_loan.id)
    );

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.notify_due_soon()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_count int := 0;
  v_title text;
begin
  for v_loan in
    select * from public.loans
    where status = 'active' and due_date = current_date + 1
  loop
    if exists (
      select 1 from public.notifications
      where type = 'loan_due_soon'
        and payload ->> 'loan_id' = v_loan.id::text
    ) then
      continue;
    end if;

    select title into v_title from public.items where id = v_loan.item_id;

    perform public.create_notification(
      v_loan.borrower_id,
      'loan_due_soon',
      'Due tomorrow',
      format('"%s" is due back tomorrow.', coalesce(v_title, 'Your borrowed item')),
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.create_notification(
      v_loan.owner_id,
      'loan_due_soon',
      'Return due tomorrow',
      format('"%s" is due back tomorrow.', coalesce(v_title, 'Your item')),
      jsonb_build_object('loan_id', v_loan.id)
    );

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.notify_waitlist_sweep()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_count int := 0;
begin
  for v_item_id in
    select distinct item_id from public.waitlist_entries where status = 'waiting'
  loop
    perform public.notify_waitlist_for_item(v_item_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Job functions must not be callable by regular users.
revoke execute on function public.expire_stale_requests() from public, anon, authenticated;
revoke execute on function public.flag_overdue_loans() from public, anon, authenticated;
revoke execute on function public.notify_due_soon() from public, anon, authenticated;
revoke execute on function public.notify_waitlist_sweep() from public, anon, authenticated;
grant execute on function public.expire_stale_requests() to service_role;
grant execute on function public.flag_overdue_loans() to service_role;
grant execute on function public.notify_due_soon() to service_role;
grant execute on function public.notify_waitlist_sweep() to service_role;
