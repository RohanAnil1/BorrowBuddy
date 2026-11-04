import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { syntheticPng } from '../../android/tools/qa-image.mjs';
assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES,'1');
const base=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY,web=process.env.BORROWBUDDY_QA_WEB_URL;
const users=[],password=`Qa!${randomUUID()}A9`,post=randomUUID();let object,browser;
async function api(token,path,method='GET',body){const r=await fetch(base+path,{method,headers:{apikey:token===service?service:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();assert(r.ok,`${path.split('?')[0]}: ${r.status}`);const data=text?JSON.parse(text):null;assert(data?.ok!==false);return data;}
const rpc=(u,a,p)=>api(u.token,'/rest/v1/rpc/campus_api','POST',{p_action:a,p_data:p});
async function actor(name){const email=`android-qa-zoom-${randomUUID()}@bennett.edu.in`;const u=await api(service,'/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push(u.id);await api(service,`/rest/v1/profiles?id=eq.${u.id}`,'PATCH',{full_name:'Zoom QA '+name,verification_status:'verified'});const s=await api(anon,'/auth/v1/token?grant_type=password','POST',{email,password});return{id:u.id,email,token:s.access_token};}
try{
 const host=await actor('host'),recipient=await actor('recipient');
 const category=(await api(service,'/rest/v1/categories?select=id&limit=1'))[0].id,location=(await api(service,'/rest/v1/pickup_locations?is_active=eq.true&select=id&limit=1'))[0].id;
 object=`${host.id}/${post}/test.png`;
 assert((await fetch(`${base}/storage/v1/object/campus-photos/${object}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${host.token}`,'Content-Type':'image/png'},body:syntheticPng})).ok);
 await rpc(host,'save_post',{id:post,kind:'giveaway',title:'Zoom QA giveaway',description:'Temporary isolated accessibility fixture, removed afterward.',category_id:category,location:'Library',condition:'good',images:[object]});
 const transfer=await rpc(recipient,'reserve',{id:post});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date(Date.now()+86400000));
 await rpc(host,'save_schedule',{slot_minutes:30,pickup_location_id:location,weekly:[],exceptions:[{date,start:'09:00',end:'12:00'}]});
 const slots=await api(recipient.token,'/rest/v1/rpc/campus_slots','POST',{p_host:host.id,p_date:date});
 await rpc(recipient,'book',{transfer_id:transfer.id,kind:'collection',starts_at:slots[0].starts_at});
 const require=createRequire(import.meta.url);const{chromium}=require(join(process.env.NODE_MODULES_PATH,'playwright'));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});const page=await browser.newPage({viewport:{width:411,height:1000}});
 await page.goto(web+'/login');await page.locator('input[name=email]').fill(recipient.email);await page.locator('input[name=password]').fill(password);await page.locator('form button[type=submit]').click();await page.waitForURL('**/home');
 await page.goto(web+'/campus/handovers');await page.addStyleTag({content:'html{font-size:200%!important}nextjs-portal{display:none!important}'});await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>{let e=document.querySelector('main');while(e){if(Number(getComputedStyle(e).opacity)<.999)return false;e=e.parentElement;}return true;});
 const result=await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('body *')].filter(e=>!e.closest('.status-ticker') && e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,class:String(e.className),width:e.clientWidth,scroll:e.scrollWidth,text:e.textContent.slice(0,80)}));
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),texts=[];let n;while((n=walker.nextNode())){if(n.parentElement.closest('.status-ticker,script,style'))continue;const range=document.createRange();range.selectNodeContents(n);const r=range.getBoundingClientRect();if(r.right>innerWidth+1)texts.push({text:n.textContent,parent:n.parentElement.outerHTML.slice(0,400),right:r.right});}
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,nodes,texts};
 });
 await writeFile('apps/web/verification/campus-zoom-diagnostic.json',JSON.stringify(result,null,2));await page.screenshot({path:'apps/web/verification/campus-zoom-411.png',fullPage:true});
 console.log(JSON.stringify(result));assert(result.scroll<=result.width+1,'Populated handovers overflow at 200% zoom');
 const code=await rpc(recipient,'generate_code',{id:transfer.id});await rpc(host,'confirm_code',{id:transfer.id,code:code.code});
 await page.goto(web+'/campus/collections/'+transfer.id);await page.getByTestId('collection-receipt').waitFor();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
 await page.waitForFunction(()=>{let e=document.querySelector('main');while(e){if(Number(getComputedStyle(e).opacity)<.999)return false;e=e.parentElement;}return scrollY===0;});
 await page.screenshot({path:'apps/web/verification/campus-final-receipt-411.png',fullPage:true});
}finally{
 if(browser)await browser.close();if(object)await api(service,'/storage/v1/object/campus-photos','DELETE',{prefixes:[object]});
 await api(service,`/rest/v1/campus_posts?id=eq.${post}`,'DELETE');for(const id of users){await api(service,`/rest/v1/notifications?user_id=eq.${id}`,'DELETE');await api(service,`/rest/v1/audit_log?actor_id=eq.${id}`,'DELETE');await api(service,`/auth/v1/admin/users/${id}`,'DELETE');}
}
