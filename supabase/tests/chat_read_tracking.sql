begin;
create temp table chat_test_context(owner_id uuid, borrower_id uuid, outsider_id uuid, pending_id uuid,
  private_id uuid, community_id uuid, empty_id uuid);
grant select on chat_test_context to authenticated, anon;
do $$
declare
  v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
  v_item uuid; v_request uuid; v_loan public.loans; v_private uuid; v_community uuid; v_empty uuid;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (v_owner,'chat-qa-'||v_owner||'@bennett.edu.in','{"full_name":"Chat QA owner"}'),
    (v_borrower,'chat-qa-'||v_borrower||'@bennett.edu.in','{"full_name":"Chat QA borrower"}'),
    (v_outsider,'chat-qa-'||v_outsider||'@bennett.edu.in','{"full_name":"Chat QA outsider"}'),
    (v_pending,'chat-qa-'||v_pending||'@bennett.edu.in','{"full_name":"Chat QA pending"}');
  update public.profiles set verification_status='verified' where id in(v_owner,v_borrower,v_outsider);
  update public.profiles set is_admin=true where id=v_owner;
  insert into public.items(owner_id,category_id,title,description,max_loan_days)
    select v_owner,id,'Chat QA fixture','Rollback-only chat fixture',14 from public.categories order by sort_order limit 1 returning id into v_item;
  perform set_config('request.jwt.claims',json_build_object('sub',v_borrower)::text,true);
  insert into public.borrow_requests(item_id,borrower_id,start_date,end_date)
    values(v_item,v_borrower,current_date,current_date+1) returning id into v_request;
  perform set_config('request.jwt.claims',json_build_object('sub',v_owner)::text,true);
  v_loan:=public.approve_request(v_request);
  select id into v_private from public.conversations where loan_id=v_loan.id;
  v_community:=(public.create_community_conversation('Chat QA busy')).id;
  v_empty:=(public.create_community_conversation('Chat QA empty')).id;
  insert into public.messages(conversation_id,sender_id,body,created_at)
    values(v_private,v_owner,'quiet private latest',now()-interval '1 day');
  insert into public.messages(conversation_id,sender_id,body,created_at)
    select v_community,v_owner,'busy message '||i,now()-interval '1 hour'+i*interval '1 second' from generate_series(1,350)i;
  insert into public.conversation_members(conversation_id,user_id) values(v_private,v_pending);
  perform public.mark_conversation_read(v_community);
  insert into chat_test_context values(v_owner,v_borrower,v_outsider,v_pending,v_private,v_community,v_empty);
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',borrower_id)::text,true) from chat_test_context;
set local role authenticated;
do $$
declare v_context chat_test_context; v_before timestamptz;
begin
  select * into v_context from chat_test_context;
  if not exists(select 1 from public.get_conversation_message_heads() where conversation_id=v_context.private_id and body='quiet private latest') then
    raise exception 'FAIL: busy channel hides quiet private latest message'; end if;
  if not exists(select 1 from public.get_conversation_message_heads() where conversation_id=v_context.community_id and body='busy message 350') then
    raise exception 'FAIL: incorrect community head'; end if;
  if exists(select 1 from public.get_conversation_message_heads() where conversation_id=v_context.empty_id) then
    raise exception 'FAIL: empty channel invents a message'; end if;
  perform public.mark_conversation_read(v_context.community_id);
  if (select count(*) from public.conversation_members where conversation_id=v_context.community_id and user_id=v_context.borrower_id)<>1 then
    raise exception 'FAIL: reading community did not establish one own cursor'; end if;
  select last_read_at into v_before from public.conversation_members where conversation_id=v_context.community_id and user_id=v_context.borrower_id;
  perform public.mark_conversation_read(v_context.community_id);
  if (select last_read_at from public.conversation_members where conversation_id=v_context.community_id and user_id=v_context.borrower_id)<v_before then
    raise exception 'FAIL: read cursor moved backwards'; end if;
  if exists(select 1 from public.conversation_members where conversation_id=v_context.community_id and user_id<>v_context.borrower_id) then
    raise exception 'FAIL: community enrollment reveals another student read cursor'; end if;
  perform public.mark_conversation_read(v_context.private_id);
  begin
    insert into public.messages(conversation_id,sender_id,body) values(v_context.community_id,v_context.owner_id,'spoofed');
    raise exception 'FAIL: sender spoof accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',outsider_id)::text,true) from chat_test_context;
set local role authenticated;
do $$
declare v_context chat_test_context;
begin
  select * into v_context from chat_test_context;
  if exists(select 1 from public.get_conversation_message_heads() where conversation_id=v_context.private_id) then
    raise exception 'FAIL: outsider can read a private message head'; end if;
  begin
    perform public.mark_conversation_read(v_context.private_id);
    raise exception 'FAIL: outsider joined private channel';
  exception when others then
    if sqlerrm<>'You are not a member of this conversation' then raise; end if;
  end;
  perform public.mark_conversation_read(v_context.community_id);
  insert into public.messages(conversation_id,sender_id,body) values(v_context.community_id,v_context.outsider_id,'verified community message');
end;
$$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',pending_id)::text,true) from chat_test_context;
set local role authenticated;
do $$
declare v_context chat_test_context;
begin
  select * into v_context from chat_test_context;
  if exists(select 1 from public.conversations where id in(v_context.private_id,v_context.community_id)) or
      exists(select 1 from public.get_conversation_message_heads() where conversation_id in(v_context.private_id,v_context.community_id)) then
    raise exception 'FAIL: unverified student can read a channel or message head'; end if;
  begin
    perform public.mark_conversation_read(v_context.community_id);
    raise exception 'FAIL: unverified student established community cursor';
  exception when others then
    if sqlerrm<>'Only verified students can read conversations' then raise; end if;
  end;
  begin
    insert into public.messages(conversation_id,sender_id,body) values(v_context.community_id,v_context.pending_id,'forbidden');
    raise exception 'FAIL: unverified sender accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.get_conversation_message_heads(); raise exception 'FAIL: anonymous head access';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_conversation_read((select community_id from chat_test_context)); raise exception 'FAIL: anonymous read cursor';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'PASS: verified community cursors, private isolation, per-channel latest messages, sender identity and unverified/anonymous denial' as result;
rollback;
