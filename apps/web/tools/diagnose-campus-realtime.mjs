import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { syntheticPng } from '../../android/tools/qa-image.mjs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES, '1');
const base=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const users=[],events=[],password=`Qa!${randomUUID()}A9`,postId=randomUUID();let object,client,browser,page;
async function api(token,path,method='GET',body){const r=await fetch(base+path,{method,headers:{apikey:token===service?service:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();assert(r.ok,`${path.split('?')[0]}: ${r.status}`);return text?JSON.parse(text):null;}
async function actor(name){const email=`android-qa-realtime-${name}-${randomUUID()}@bennett.edu.in`;const u=await api(service,'/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push(u.id);await api(service,`/rest/v1/profiles?id=eq.${u.id}`,'PATCH',{full_name:'Realtime QA '+name,verification_status:'verified'});const s=await api(anon,'/auth/v1/token?grant_type=password','POST',{email,password});return{id:u.id,email,token:s.access_token};}
try{
 const host=await actor('host'),recipient=await actor('recipient');
 const category=(await api(service,'/rest/v1/categories?select=id&limit=1'))[0].id;
 object=`${host.id}/${postId}/test.png`;
 const upload=await fetch(`${base}/storage/v1/object/campus-photos/${object}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${host.token}`,'Content-Type':'image/png'},body:syntheticPng});assert(upload.ok);
 await api(host.token,'/rest/v1/rpc/campus_api','POST',{p_action:'save_post',p_data:{id:postId,kind:'giveaway',title:'Realtime QA giveaway',description:'Temporary isolated realtime diagnostic, removed afterward.',category_id:category,location:'Library',condition:'good',images:[object]}});
 const transfer=await api(recipient.token,'/rest/v1/rpc/campus_api','POST',{p_action:'reserve',p_data:{id:postId}});
 client=createClient(base,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 await client.auth.signInWithPassword({email:host.email,password});
 client.channel('campus-diagnostic-'+transfer.id)
 .on('system',{},p=>{events.push({event:'system',...p});console.log('SYSTEM',JSON.stringify(p));})
 .on('postgres_changes',{event:'*',schema:'public',table:'campus_messages',filter:`transfer_id=eq.${transfer.id}`},p=>{events.push({event:p.eventType,table:p.table});console.log('RECEIVED',p.eventType,p.table);})
 .subscribe((status,error)=>{events.push({status,error:error?.message});console.log('STATUS',status,error?.message??'');});
 if(process.env.BORROWBUDDY_QA_WEB_URL){
   const require=createRequire(import.meta.url);const {chromium}=require(join(process.env.NODE_MODULES_PATH,'playwright'));
   browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
   page=await browser.newPage();
   page.on('websocket',socket=>{
     if(!socket.url().includes('/realtime/'))return;
     const trace=(direction,frame)=>{try{const packet=JSON.parse(frame.payload),event=Array.isArray(packet)?packet[3]:packet.event,data=Array.isArray(packet)?packet[4]:packet.payload;
       let detail;if(event==='phx_join') { const claims=data.access_token?JSON.parse(Buffer.from(data.access_token.split('.')[1],'base64url')):{};detail={changes:data.config?.postgres_changes,role:claims.role,authenticatedSubject:claims.sub===host.id}; }
       if(event==='system')detail=data;
       if(event==='phx_reply')detail={status:data.status,changes:data.response?.postgres_changes,reason:data.response?.reason};
       if(detail){events.push({direction,event,...detail});console.log(direction,event,JSON.stringify(detail));}
     }catch{}};
     socket.on('framesent',f=>trace('SENT',f));socket.on('framereceived',f=>trace('RECEIVED',f));
   });
   await page.goto(process.env.BORROWBUDDY_QA_WEB_URL+'/login');await page.locator('input[name=email]').fill(host.email);await page.locator('input[name=password]').fill(password);await page.locator('form button[type=submit]').click();await page.waitForURL('**/home');
   await page.goto(process.env.BORROWBUDDY_QA_WEB_URL+'/campus/collections/'+transfer.id);
 }
 await new Promise(resolve=>setTimeout(resolve,15000));
 await api(recipient.token,'/rest/v1/rpc/campus_api','POST',{p_action:'send_message',p_data:{id:transfer.id,client_id:randomUUID(),body:'Realtime diagnostic message'}});
 console.log('WRITE SUCCEEDED; keeping subscription open for inspection');
 await new Promise(resolve=>setTimeout(resolve,30000));
 if(page)assert(await page.getByText('Realtime diagnostic message',{exact:true}).count()>0,'Browser did not receive realtime message');
 assert(events.some(e=>e.event==='INSERT'),'No INSERT received through realtime');
}finally{
 if(page){events.push({browserState:await page.getByTestId('collection-connection').getAttribute('data-connection')});}
 if(browser)await browser.close();
 if(client)await client.removeAllChannels();
 if(object)await api(service,'/storage/v1/object/campus-photos','DELETE',{prefixes:[object]});
 await api(service,`/rest/v1/campus_posts?id=eq.${postId}`,'DELETE');
 for(const id of users){await api(service,`/rest/v1/notifications?user_id=eq.${id}`,'DELETE');await api(service,`/rest/v1/audit_log?actor_id=eq.${id}`,'DELETE');await api(service,`/auth/v1/admin/users/${id}`,'DELETE');}
 await writeFile('apps/web/verification/campus-realtime-diagnostic.json',JSON.stringify(events,null,2));
}
