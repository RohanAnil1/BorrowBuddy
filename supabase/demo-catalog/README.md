# BorrowBuddy demo catalog

User-authorized persistent demo content, separate from disposable `android-qa-*`
fixtures. The user selected a dedicated demo lender on 21 October 2026.

The batch contains **20 available listings and 39 product images**: eight
electronics items, four camera/audio accessories and eight sports items. Every
listing has a descriptive sample kit, condition, refundable demo deposit, maximum
loan duration and an existing campus pickup point. The description explicitly
identifies the listing as demo inventory, rather than a real borrowing offer.

The non-admin owner is **BorrowBuddy Demo Library**. Its profile identifies a demo
campus collection. Only this synthetic account was marked verified so the normal
listing policy could be used; no fake student ID, review, completed loan, elevated
role, policy, schema or migration was added. The original inventory is preserved.

Search **DEMO INVENTORY** in Browse to find the batch. The website and Android app
use the same hosted database; refresh Browse to see it in either client. The public
profile deliberately keeps the website's twelve-listing preview limit, so Browse
and My Items are the places to view all twenty.

`products.json` contains the curated lending details. `prepared.json` records
stable item IDs and source image URLs/hashes. `published.json` records the dedicated
owner, created item IDs and uploaded object paths for precise maintenance.
Product imagery comes from the sample [DummyJSON products dataset](https://dummyjson.com/docs/products),
and is attributed in each description. It is copied into the existing `item-images`
bucket, so cards do not depend on third-party image hotlinks.

`node supabase/demo-catalog/seed-demo-catalog.mjs --prepare` downloads the image
plan into the Windows temporary directory. Existing plans retain their IDs.
`publish-demo-catalog.ps1` publishes/resumes this specific batch using the linked
hosted development project. It creates only the dedicated account using admin
credentials, then uploads images/inserts listings with that account's normal token.
Existing item edits or unrelated rows are never overwritten. No service key is
written into these files, browser code or APKs.

The demo account's random password is saved in the Git-ignored
`demo-account.local.clixml`. Windows DPAPI encrypts it for the current Windows user;
it is not a plaintext credential or a production signing secret. To use this account
locally, load it with `Import-Clixml` and access the resulting PSCredential in memory.
Do not commit or publish that local file. The publication script revokes its session
after completion, and browser verification signs out through the original website.

`verify-demo-catalog.mjs` checks the real website with normal demo credentials:
all 39 hosted images decode, all twenty catalog cards appear at 411/1024 px, every
detail page shows the correct demo description/pickup, and sign-out returns to the
source landing route. Results are recorded in `website-verification.json`; see the
report for the actual run status. The earlier lazy-image wait and sign-out URL
assertion failures are preserved separately; neither required a website UI change.
