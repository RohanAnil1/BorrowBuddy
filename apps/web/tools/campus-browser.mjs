import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { syntheticPng } from '../../android/tools/qa-image.mjs';

export async function campusBrowser({ browser, web, recipient, host, admin, password, api, server, objects, giveaway, location, category, date, hiddenTransfer, loanThread, pass }) {
  const errors = [], pages = [], contexts = [], realtimeTrace = [];
  const requestedImages = new Map();
  async function login(user) {
    const context = await browser.newContext({ viewport: { width: 411, height: 1000 } }); contexts.push(context);
    const page = await context.newPage(); pages.push(page);
    const paths = new Set();
    requestedImages.set(page, paths);
    page.on('request', request => {
      if (request.resourceType() === 'image') paths.add(new URL(request.url()).pathname);
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('websocket', socket => {
      if (!socket.url().includes('/realtime/')) return;
      socket.on('framesent', frame => {
        try { const packet=JSON.parse(frame.payload); const event=Array.isArray(packet)?packet[3]:packet.event; const data=Array.isArray(packet)?packet[4]:packet.payload;
          if(event==='phx_join') realtimeTrace.push({user:user===host?'host':'recipient',event,config:data.config?.postgres_changes});
        } catch {}
      });
      socket.on('framereceived', frame => {
        try { const packet=JSON.parse(frame.payload); const event=Array.isArray(packet)?packet[3]:packet.event; const data=Array.isArray(packet)?packet[4]:packet.payload;
          if(event==='system') realtimeTrace.push({event,data});
          if(event==='phx_reply' && (data.response?.postgres_changes || data.response?.reason)) realtimeTrace.push({event,status:data.status,changes:data.response.postgres_changes,reason:data.response.reason});
        } catch {}
      });
    });
    page.on('response', response => {
      const marker = '/storage/v1/object/campus-photos/';
      if (response.ok() && response.request().method() === 'POST' && response.url().includes(marker)) {
        const path = decodeURIComponent(new URL(response.url()).pathname.split(marker)[1]);
        if (path.startsWith(user.id + '/')) objects.push(path);
      }
    });
    await page.goto(web + '/login');
    await page.locator('input[name=email]').fill(user.email); await page.locator('input[name=password]').fill(password);
    await page.locator('form button[type=submit]').click(); await page.waitForURL('**/home', { timeout: 60000 });
    return page;
  }
  async function overflow(page, name) {
    // The development toolbar is outside the shipped application and can add
    // its own overflow when text is enlarged. Production has no such portal.
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { let el=document.querySelector('main'); while(el){ if(Number(getComputedStyle(el).opacity)<.999)return false;el=el.parentElement; }return true; });
    const valid=await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    if(!valid) await writeFile('apps/web/verification/campus-overflow.json',JSON.stringify(await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,text:el.textContent.slice(0,70)}))})),null,2));
    assert(valid, `Horizontal overflow: ${name}`);
  }
  try {
    const page = await login(recipient);
    await page.goto(web + `/campus/collections/${hiddenTransfer}`);
    await page.getByRole('heading', { name: 'Collection record', exact: true }).waitFor();
    assert(await page.getByLabel('Collection message', { exact: true }).isDisabled());
    assert.equal(await page.locator('a').filter({ hasText: 'VIEW ORIGINAL POST' }).count(), 0);
    if (!process.env.BORROWBUDDY_CAMPUS_BROWSER_FOCUS) {
      for (const width of [320, 411, 768, 800, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of ['/campus', '/campus/giveaways', '/campus/lost-found', '/campus/handovers', '/campus/activity']) {
          await page.goto(web + route); await page.locator('h1').waitFor();
          // Wait for hydration before a screenshot can modify input caret styles.
          await page.waitForFunction(() => !document.querySelector('main') || getComputedStyle(document.querySelector('main').parentElement).opacity !== '0');
          await overflow(page, `${route} at ${width}`);
          await page.screenshot({ path: `apps/web/verification/campus-${route.split('/').pop()}-${width}.png`, fullPage: true, caret: 'initial' });
        }
      }
      pass('campus routes at 320/411/768/800/1440 with no horizontal overflow');
    }
    await page.setViewportSize({ width: 411, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(web + `/campus/giveaways/${giveaway}`);
    await page.getByRole('button', { name: 'RESERVE THIS GIVEAWAY' }).click();
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').count(), 1); assert(!await page.getByRole('dialog').isVisible());
    await page.getByRole('button', { name: 'RESERVE THIS GIVEAWAY' }).click();
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await page.waitForURL('**/campus/collections/**');
    const giveawayUrl = page.url();
    await page.getByRole('button', { name: 'GENERATE / REPLACE MY CODE' }).click();
    await page.getByTestId('collection-code').waitFor();
    const giftCode = (await page.getByTestId('collection-code').innerText()).trim(); assert.match(giftCode, /^\d{6}$/);
    const finder = await login(host);
    await finder.goto(giveawayUrl); await finder.locator('input[name=code]').fill(giftCode);
    await finder.getByRole('button', { name: 'CONFIRM COLLECTION', exact: true }).click();
    await finder.getByTestId('collection-receipt').waitFor();
    await page.getByTestId('collection-receipt').waitFor();
    assert(await page.getByLabel('Collection message', { exact: true }).isDisabled());
    pass('normal browser donor–recipient reservation, accessible confirmation/Escape, reduced motion, one-time code, realtime receipt and read-only chat');

    await finder.goto(web + '/campus/lost-found/new');
    const title = 'Campus browser test camera case';
    await finder.locator('input[name=title]').fill(title);
    await finder.locator('textarea[name=description]').fill('A camera case found beside the library. Tell admins what is inside to verify ownership.');
    await finder.locator('select[name=category_id]').selectOption(category);
    await finder.locator('input[name=location]').fill('Library reception');
    await finder.locator('select[name=pickup_location_id]').selectOption(location);
    await finder.locator('textarea[name=identifying_notes]').fill('Private finder detail: three amber stars inside the pocket.');
    const file = { name: 'camera-case.png', mimeType: 'image/png', buffer: syntheticPng };
    const uploadPattern = '**/storage/v1/object/campus-photos/**';
    await finder.route(uploadPattern, route => route.abort('internetdisconnected'));
    await finder.getByLabel('Campus photos').setInputFiles(file);
    await finder.locator('p[role=alert]').waitFor();
    assert.equal(await finder.locator('input[name=title]').inputValue(), title);
    await finder.unroute(uploadPattern);
    let release; const gate = new Promise(resolve => { release = resolve; });
    await finder.route(uploadPattern, async route => { await gate; await route.continue(); });
    await finder.getByLabel('Campus photos').setInputFiles(file);
    await finder.getByText('WAIT FOR UPLOADS TO FINISH BEFORE PUBLISHING.').waitFor();
    assert(await finder.getByRole('button', { name: 'PUBLISH TO CAMPUS' }).isDisabled());
    release(); await finder.getByAltText('Upload preview').waitFor();
    await finder.unroute(uploadPattern);
    await finder.getByRole('button', { name: 'PUBLISH TO CAMPUS' }).click();
    await finder.waitForURL(/\/campus\/lost-found\/[a-f0-9-]{36}$/);
    const postId = new URL(finder.url()).pathname.split('/').at(-1);
    const post = (await api(server, `/rest/v1/campus_posts?id=eq.${postId}`))[0];
    objects.push(...post.images);
    assert(post.images[0].endsWith('.webp'));
    await page.goto(finder.url());
    assert(!await page.locator('body').innerText().then(t => t.includes('three amber stars')));
    await page.locator('textarea[name=evidence]').fill('Private ownership proof: there are three amber stars inside the pocket.');
    await page.getByRole('button', { name: 'SEND PRIVATE OWNERSHIP CLAIM' }).click();
    await page.getByText('YOUR CLAIM · pending', { exact: false }).waitFor();
    const reviewer = await login(admin);
    await reviewer.goto(web + '/campus/admin');
    const review = reviewer.locator('article').filter({ has: reviewer.getByRole('heading', { name: title }) });
    await review.waitFor();
    assert((await review.innerText()).includes('three amber stars'));
    await review.getByLabel('APPROVE REASON').fill('Finder and claimant private identifying details match.');
    await review.getByRole('button', { name: 'APPROVE OWNERSHIP', exact: true }).click();
    await reviewer.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await review.waitFor({ state: 'detached' });
    const transfer = (await api(server, `/rest/v1/campus_transfers?post_id=eq.${postId}&status=eq.active`))[0]; assert(transfer);
    const collectionUrl = web + `/campus/collections/${transfer.id}`;
    await page.goto(web + '/notifications');
    await page.locator(`a[href="/campus/collections/${transfer.id}"]`).first().waitFor();
    assert(!await page.locator('body').innerText().then(t => t.includes('three amber stars')));
    await page.goto(collectionUrl); await finder.goto(collectionUrl);
    await finder.locator('[data-testid="collection-connection"][data-connection="LIVE"]').waitFor({ timeout: 60000 });
    // Block HTTP history refreshes on the receiving browser, so this assertion
    // proves delivery through the actual realtime subscription.
    await finder.route('**/rest/v1/campus_messages?*', route => route.abort('failed'));
    await page.route('**/rest/v1/rpc/campus_api', route => route.request().postDataJSON()?.p_action === 'send_message' ? route.abort('internetdisconnected') : route.continue());
    const message = 'Meet by reception. Original Case\nI will bring my campus ID.';
    await page.getByLabel('Collection message', { exact: true }).fill(message); await page.getByRole('button', { name: 'SEND MESSAGE', exact: true }).click();
    await page.locator('p[role=alert]').waitFor(); assert.equal(await page.getByLabel('Collection message', { exact: true }).inputValue(), message);
    await page.unroute('**/rest/v1/rpc/campus_api');
    await page.getByRole('button', { name: 'SEND MESSAGE', exact: true }).click();
    await finder.getByText(message, { exact: true }).waitFor();
    await finder.unroute('**/rest/v1/campus_messages?*');
    assert.equal((await api(host.token, `/rest/v1/campus_messages?transfer_id=eq.${transfer.id}`)).length, 1);
    await finder.goto(web + '/campus/handovers');
    await finder.getByLabel('APPOINTMENT LENGTH').selectOption('15');
    await finder.getByRole('button', { name: 'SAVE MY HANDOVER HOURS' }).click(); await finder.getByText('Saved successfully.', { exact: true }).waitFor();
    await page.locator('input[type=date]').fill(date);
    await page.getByRole('radio').first().waitFor(); await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'BOOK THIS TIME', exact: true }).click();
    await page.getByText('BOOKED ·', { exact: false }).waitFor();
    const appointment = (await api(host.token, `/rest/v1/campus_appointments?transfer_id=eq.${transfer.id}&status=eq.booked`))[0];
    assert.equal(new Date(appointment.ends_at) - new Date(appointment.starts_at), 15 * 60000);
    await page.getByRole('radio').last().check();
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/campus/collections/${transfer.id}`),
      page.getByRole('button', { name: 'RESCHEDULE HANDOVER' }).click(),
    ]);
    assert.equal((await api(host.token, `/rest/v1/campus_appointments?id=eq.${appointment.id}`))[0].status, 'cancelled');
    await page.getByRole('button', { name: 'GENERATE / REPLACE MY CODE' }).click(); await page.getByTestId('collection-code').waitFor();
    const code = (await page.getByTestId('collection-code').innerText()).trim();
    await finder.goto(collectionUrl); await finder.locator('input[name=code]').fill(code);
    await finder.getByRole('button', { name: 'CONFIRM COLLECTION', exact: true }).click();
    await finder.getByTestId('collection-receipt').waitFor(); await page.getByTestId('collection-receipt').waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.scrollY === 0);
    await page.screenshot({ path: 'apps/web/verification/campus-collection-receipt-411.png', fullPage: true, caret: 'initial' });
    pass('browser upload failure/retry and WebP preview, finder–admin–claimant review, private evidence, notifications, failed-send recovery, realtime text, hours editor, booking/rescheduling and collection receipt');
    await finder.goto(web + '/campus/giveaways/new');
    const giftTitle = 'Campus browser giveaway kit';
    await finder.locator('input[name=title]').fill(giftTitle);
    await finder.locator('textarea[name=description]').fill('Free bundle of clean notebooks and stationery for the next semester. Collect from the hostel reception desk.');
    await finder.locator('select[name=category_id]').selectOption(category);
    await finder.locator('input[name=location]').fill('Hostel reception');
    assert.equal(await finder.locator('select[name=hold_hours]').inputValue(), '48');
    await finder.locator('select[name=hold_hours]').selectOption('72');
    await finder.locator('select[name=condition]').selectOption('fair');
    await finder.getByLabel('Campus photos').setInputFiles([file, { ...file, name: 'bundle-detail.png' }]);
    await finder.getByRole('button', { name: 'PUBLISH TO CAMPUS' }).click();
    await finder.waitForURL(/\/campus\/giveaways\/[a-f0-9-]{36}$/);
    const giftId = new URL(finder.url()).pathname.split('/').at(-1);
    const gift = (await api(server, `/rest/v1/campus_posts?id=eq.${giftId}`))[0]; objects.push(...gift.images);
    assert.equal(gift.hold_hours, 72); assert.equal(gift.images.length, 2);
    await page.goto(web + '/campus/giveaways');
    await page.getByRole('textbox', { name: 'Search campus titles' }).fill(giftTitle);
    await page.getByRole('button', { name: 'SEARCH', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('q') === giftTitle);
    await page.getByRole('link').filter({ has: page.getByRole('heading', { name: giftTitle }) }).click();
    await page.getByRole('button', { name: 'Next photo', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Show photo 2', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('region', { name: giftTitle + ' photos' }).locator('[tabindex="0"]').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getByRole('button', { name: 'Show photo 1', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByText('Your exact deadline is set when the reservation succeeds.', { exact: true }).waitFor();
    pass('browser giveaway publication with two photos/condition/72-hour hold, default 48 hours, URL-persisted search, keyboard gallery and pre-reservation deadline');
    const thumbnail = reviewer.waitForResponse(response => new URL(response.url()).pathname === '/campus-map-thumb.webp' && response.ok());
    await reviewer.goto(web + '/admin');
    await reviewer.getByRole('heading', { name: /CAMPUS PINS/ }).scrollIntoViewIfNeeded();
    await thumbnail;
    const pinForm = reviewer.locator('form[data-pin-form="new"]');
    const pinMap = pinForm.getByRole('application');
    await pinMap.scrollIntoViewIfNeeded();
    await reviewer.waitForFunction(() => {
      const image = document.querySelector('form[data-pin-form="new"] img');
      return image?.complete && image.naturalWidth > 0;
    });
    const pinWidth = await pinMap.locator('img').evaluate(image => Number(new URL(image.currentSrc).searchParams.get('w')));
    assert(pinWidth > 0 && pinWidth <= 640, 'Mobile pin editor requested an oversized image');
    const mapBounds = await pinMap.boundingBox();
    await pinMap.click({ position: { x: mapBounds.width * 0.25, y: mapBounds.height * 0.75 } });
    assert(Math.abs(Number(await pinForm.locator('input[name=xp]').inputValue()) - 25) <= 1);
    assert(Math.abs(Number(await pinForm.locator('input[name=yp]').inputValue()) - 75) <= 1);
    const imagePaths = requestedImages.get(reviewer);
    assert(imagePaths.has('/bgpattern.webp'));
    assert(!imagePaths.has('/campus-map.png') && !imagePaths.has('/bgpattern.png'));
    pass('admin serves the small map thumbnail and WebP backdrop, mobile editor requests a responsive image, and pin coordinates stay aligned');

    const loanUrl = web + '/chat/' + loanThread;
    const messageReads = '**/rest/v1/messages?*';
    const blockHistory = route => route.request().method() === 'GET' ? route.abort() : route.continue();
    const waitForLoanListener = person => person
      .waitForEvent('websocket', { predicate: socket => socket.url().includes('/realtime/'), timeout: 30000 })
      .then(socket => socket.waitForEvent('framereceived', { timeout: 30000, predicate: frame => {
        try {
          const packet = JSON.parse(frame.payload);
          const [topic, event, data] = Array.isArray(packet)
            ? [packet[2], packet[3], packet[4]]
            : [packet.topic, packet.event, packet.payload];
          return topic?.includes(loanThread) && event === 'system'
            && data?.extension === 'postgres_changes' && data?.status === 'ok';
        } catch { return false; }
      }}));
    await Promise.all([page.route(messageReads, blockHistory), finder.route(messageReads, blockHistory)]);
    await Promise.all([waitForLoanListener(page), waitForLoanListener(finder), page.goto(loanUrl), finder.goto(loanUrl)]);
    await page.getByText('Long chat fixture 104', { exact: true }).waitFor();
    assert.equal(await page.getByText('Long chat fixture 0', { exact: true }).count(), 0);
    const sendLoanMessage = async (person, body) => {
      const composer = person.getByPlaceholder('Write a message…');
      await composer.fill(body);
      await composer.press('Enter');
    };
    const firstMessage = 'Private loan chat regression: browser message from the borrower.';
    const replyMessage = 'Private loan chat regression: browser reply from the owner.';
    await sendLoanMessage(page, firstMessage);
    await finder.getByText(firstMessage, { exact: true }).waitFor();
    await sendLoanMessage(finder, replyMessage);
    await page.getByText(replyMessage, { exact: true }).waitFor();
    pass('long loan chat opens at the latest messages and both browsers receive live messages with HTTP catch-up blocked');

    await finder.unroute(messageReads, blockHistory);
    await finder.routeWebSocket('**/realtime/v1/**', socket => socket.close());
    await finder.reload();
    await finder.getByPlaceholder('Write a message…').waitFor();
    const missedMessage = 'Private loan chat regression: message sent while the receiving socket is unavailable.';
    await sendLoanMessage(page, missedMessage);
    await finder.getByText(missedMessage, { exact: true }).waitFor({ timeout: 20000 });
    assert.equal(await finder.getByText(missedMessage, { exact: true }).count(), 1);
    pass('foreground loan chat recovers a missed message once when WebSocket access is unavailable');

    for (const [person, actor] of [[page, recipient], [reviewer, admin]]) {
      await person.goto(web + '/me'); await person.getByTestId('member-id-card').waitFor();
      await person.goto(web + `/users/${actor.id}`); await person.getByTestId('member-id-card').waitFor();
      assert(await person.locator('header svg path[d="M32 48H96L116 68V104H88V80H64V176H88V152H116V208H64L32 176Z"]').count() > 0);
    }
    for (const route of ['/campus/lost-found/new', '/campus/handovers', `/campus/collections/${transfer.id}`]) {
      await page.goto(web + route); await page.addStyleTag({ content: 'html{font-size:200%!important}' });
      await overflow(page, route + ' at 200% text zoom');
    }
    assert.deepEqual(errors, []);
    pass('student/admin account and public ID cards, approved Buddy Brackets header, 200% text zoom on posting/schedule/receipt');
  } catch (error) {
    for (const [i, page] of pages.entries()) if (!page.isClosed()) { await page.screenshot({ path: `apps/web/verification/campus-browser-failure-${i}.png`, fullPage: true, caret: 'initial' }); await writeFile(`apps/web/verification/campus-browser-failure-${i}.txt`, await page.locator('body').innerText()); }
    throw error;
  } finally { await writeFile('apps/web/verification/campus-realtime-browser-trace.json', JSON.stringify(realtimeTrace,null,2)); for (const context of contexts) await context.close(); }
}
