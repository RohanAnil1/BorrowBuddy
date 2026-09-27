-- Search & browse
create index items_owner_idx on public.items (owner_id);
create index items_category_idx on public.items (category_id);
create index items_status_created_idx on public.items (status, created_at desc);
create index items_search_idx on public.items using gin (search_vector);
create index items_title_trgm_idx on public.items using gin (title extensions.gin_trgm_ops);

-- Availability
create index availability_blocks_item_dates_idx
  on public.availability_blocks (item_id, start_date, end_date);

-- Requests
create index borrow_requests_item_status_idx on public.borrow_requests (item_id, status);
create index borrow_requests_borrower_idx on public.borrow_requests (borrower_id, created_at desc);
create unique index borrow_requests_one_pending_per_item_borrower
  on public.borrow_requests (item_id, borrower_id)
  where status = 'pending';

-- Loans
create index loans_item_status_idx on public.loans (item_id, status);
create index loans_borrower_idx on public.loans (borrower_id, status);
create index loans_owner_idx on public.loans (owner_id, status);
create index loans_due_idx on public.loans (due_date)
  where status in ('active', 'return_pending', 'overdue');

-- Waitlist
create index waitlist_item_idx on public.waitlist_entries (item_id, status);
create unique index waitlist_one_active_per_user_item
  on public.waitlist_entries (item_id, user_id)
  where status in ('waiting', 'notified');

-- Chat
create unique index conversations_one_private_per_loan
  on public.conversations (loan_id) where type = 'private';
create unique index conversations_community_title
  on public.conversations (title) where type = 'community';
create index conversation_members_user_idx on public.conversation_members (user_id);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- Reviews / incidents / fines
create index reviews_reviewee_idx on public.reviews (reviewee_id);
create index incidents_loan_idx on public.incidents (loan_id);
create index incidents_status_idx on public.incidents (status, created_at desc);
create index fines_user_status_idx on public.fines (user_id, status);
create unique index fines_one_overdue_per_loan
  on public.fines (loan_id) where source = 'overdue';

-- Notifications / moderation / audit
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;
create index reports_status_idx on public.reports (status, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
