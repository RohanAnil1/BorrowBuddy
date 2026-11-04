import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const here = new URL('./', import.meta.url);
const cache = join(tmpdir(), 'borrowbuddy-demo-catalog-20261021');
const preparedFile = new URL('prepared.json', here);
const receiptFile = new URL('published.json', here);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function jsonFile(url) {
  try { return JSON.parse(await readFile(url, 'utf8')); }
  catch (failure) { if (failure.code === 'ENOENT') return null; throw failure; }
}
async function fetchOk(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45_000) });
  assert(response.ok, `Request failed (${response.status}) at ${new URL(url).pathname}`);
  return response;
}

if (process.argv.includes('--prepare')) {
  const existing = await jsonFile(preparedFile);
  if (existing) {
    assert.equal(existing.products.length, 20);
    console.log('Using existing 20-product plan; no duplicate IDs generated.');
  } else {
    const specs = await jsonFile(new URL('products.json', here));
    assert.equal(specs.length, 20);
    const dataset = await (await fetchOk('https://dummyjson.com/products?limit=0')).json();
    await mkdir(cache, { recursive: true });
    const products = [];
    for (const spec of specs) {
      const source = dataset.products.find(product => product.id === spec.sourceId);
      assert(source?.images?.length, `Missing source product ${spec.sourceId}`);
      const images = [];
      for (const [index, url] of source.images.slice(0, 3).entries()) {
        assert.equal(new URL(url).hostname, 'cdn.dummyjson.com');
        const response = await fetchOk(url);
        const contentType = response.headers.get('content-type')?.split(';')[0];
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[contentType];
        assert(extension, 'Unsupported demo image format');
        const bytes = Buffer.from(await response.arrayBuffer());
        assert(bytes.length > 500 && bytes.length < 5 * 1024 * 1024, 'Demo image outside existing upload limits');
        const filename = `${source.id}-${index + 1}.${extension}`;
        await writeFile(join(cache, filename), bytes);
        images.push({ filename, contentType, bytes: bytes.length, sha256: sha(bytes), sourceUrl: url });
      }
      products.push({ ...spec, id: randomUUID(), title: spec.title ?? source.title, images,
        description: `DEMO INVENTORY — sample listing for exploring BorrowBuddy, not an actual borrowing offer.\n\n${spec.kit}\n\nSample condition: ${spec.condition}. Refundable demo deposit: ₹${spec.deposit}. Maximum loan: ${spec.days} days. Pickup/return: ${spec.pickup}; arrange a time in the private loan chat. Return all included accessories together.\n\nIllustrative product images: DummyJSON (dummyjson.com).` });
      console.log(`Prepared ${source.title}: ${images.length} image(s)`);
    }
    await writeFile(preparedFile, JSON.stringify({ batch: 'borrowbuddy-demo-20261021', source: 'https://dummyjson.com/docs/products', products }, null, 2));
  }
} else if (process.argv.includes('--publish')) {
  assert.equal(process.env.BORROWBUDDY_ALLOW_DEMO_CONTENT, '1', 'Explicit demo publication opt-in required');
  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.BORROWBUDDY_DEMO_EMAIL;
  const password = process.env.BORROWBUDDY_DEMO_PASSWORD;
  assert(base === 'https://oijteuxelpwziplqwkvi.supabase.co' && anon && service && email && password, 'Expected hosted development project and local demo credentials required');
  const plan = await jsonFile(preparedFile);
  assert.equal(plan?.products?.length, 20);
  let receipt = await jsonFile(receiptFile);
  async function api(path, method = 'GET', body, token = service) {
    const response = await fetchOk(`${base}${path}`, { method,
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  if (!receipt) {
    const account = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true,
      user_metadata: { full_name: 'BorrowBuddy Demo Library' }, app_metadata: { demo_catalog: true } });
    receipt = { batch: plan.batch, ownerId: account.id, itemIds: plan.products.map(item => item.id),
      imagePaths: [], productionInventory: false, published: false };
    await writeFile(receiptFile, JSON.stringify(receipt, null, 2));
  }
  const owner = await api(`/auth/v1/admin/users/${receipt.ownerId}`);
  assert(owner.email === email && owner.app_metadata?.demo_catalog === true, 'Receipt does not identify this dedicated demo lender');
  await api(`/rest/v1/profiles?id=eq.${receipt.ownerId}`, 'PATCH', { full_name: 'BorrowBuddy Demo Library',
    department: 'Demo Campus Collection', year_of_study: 3, verification_status: 'verified',
    verification_note: 'User-authorized synthetic demo lender; sample inventory, no real student ID submitted.', is_admin: false });
  const session = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, anon);
  const token = session.access_token;
  assert(token);
  try {
    const categories = await api('/rest/v1/categories?select=id,slug', 'GET', undefined, token);
    const locations = await api('/rest/v1/pickup_locations?select=id,name&is_active=eq.true', 'GET', undefined, token);
    const rows = [];
    for (const product of plan.products) {
      const images = [];
      for (const image of product.images) {
        const bytes = await readFile(join(cache, image.filename));
        assert.equal(sha(bytes), image.sha256, 'Prepared image changed');
        const path = `${receipt.ownerId}/demo-20261021/${image.filename}`;
        if (!receipt.imagePaths.includes(path)) {
          const upload = await fetch(`${base}/storage/v1/object/item-images/${path}`, { method: 'POST',
            headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': image.contentType, 'x-upsert': 'false' }, body: bytes, signal: AbortSignal.timeout(45_000) });
          if (!upload.ok) {
            // Resume only an identical object at our deterministic dedicated path.
            assert([400, 409].includes(upload.status), `Demo upload failed (${upload.status})`);
            const current = await fetchOk(`${base}/storage/v1/object/public/item-images/${path}`);
            assert.equal(sha(Buffer.from(await current.arrayBuffer())), image.sha256, 'Existing demo object differs; refusing overwrite');
          } else await upload.text();
          receipt.imagePaths.push(path);
          await writeFile(receiptFile, JSON.stringify(receipt, null, 2));
        }
        images.push(path);
      }
      const category = categories.find(entry => entry.slug === product.category);
      const pickup = locations.find(entry => entry.name === product.pickup);
      assert(category && pickup, 'Existing category/pickup missing; no schema changes permitted');
      rows.push({ id: product.id, owner_id: receipt.ownerId, category_id: category.id, title: product.title,
        description: product.description, condition: product.condition, images, deposit_amount: product.deposit,
        max_loan_days: product.days, pickup_location_id: pickup.id, status: 'available' });
    }
    const filter = `/rest/v1/items?id=in.(${rows.map(row => row.id).join(',')})`;
    const before = await api(filter, 'GET', undefined, token);
    assert(before.every(row => row.owner_id === receipt.ownerId && row.description.startsWith('DEMO INVENTORY')), 'Refusing to modify another inventory');
    const missing = rows.filter(row => !before.some(entry => entry.id === row.id));
    if (missing.length) await api('/rest/v1/items', 'POST', missing, token);
    const actual = await api(filter, 'GET', undefined, token);
    assert.equal(actual.length, 20);
    for (const expected of rows) {
      const found = actual.find(row => row.id === expected.id);
      for (const key of Object.keys(expected)) assert.deepEqual(found[key], expected[key], `Persisted demo field differs: ${key}`);
    }
    for (const path of receipt.imagePaths) {
      const response = await fetchOk(`${base}/storage/v1/object/public/item-images/${path}`);
      assert(response.headers.get('content-type')?.startsWith('image/'));
      await response.arrayBuffer();
    }
    receipt.published = true;
    receipt.verifiedAt = new Date().toISOString();
    receipt.productCount = actual.length;
    receipt.imageCount = receipt.imagePaths.length;
    await writeFile(receiptFile, JSON.stringify(receipt, null, 2));
    console.log(`Published and verified ${actual.length} available demo listings with ${receipt.imagePaths.length} hosted images under the dedicated non-admin lender.`);
  } finally { await api('/auth/v1/logout?scope=global', 'POST', undefined, token); }
} else {
  throw new Error('Use --prepare to download the 20-product plan or --publish with the explicit hosted demo opt-in.');
}
