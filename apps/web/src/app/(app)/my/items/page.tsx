import { Check, Inbox, Pause, Play, PlusCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge, requestTone } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateRange, relativeTime } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getMyItems } from "@/lib/data/items";
import { getIncomingRequests } from "@/lib/data/requests";
import { BUCKETS, publicUrl } from "@/lib/storage";
import { deleteItem, setItemStatus } from "../../items/actions";
import { approveRequest, declineRequest } from "../actions";

export const metadata = { title: "My items" };

export default async function MyItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireVerified();
  const { error } = await searchParams;

  const [items, requests] = await Promise.all([
    getMyItems(profile.id),
    getIncomingRequests(profile.id),
  ]);

  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests.filter((request) => request.status !== "pending").slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="status-bracket text-[10px]">[ LOGBOOK — LENDING ]</p>
          <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">My items</h1>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90"
          href="/items/new"
        >
          <PlusCircle className="size-4" />
          List an item
        </Link>
      </div>

      {error && (
        <p className="mt-6 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {error} ]
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ REQUESTS WAITING ON YOU ]
          {pending.length > 0 && (
            <span className="ml-3 bg-accent px-2 py-0.5 font-secondary text-[10px] text-white">
              {pending.length}
            </span>
          )}
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          {pending.length === 0 ? (
            <p className="border border-line bg-panel px-6 py-8 text-center font-secondary text-[10px] text-ink/50">
              NO PENDING REQUESTS. REQUESTS EXPIRE AUTOMATICALLY AFTER 48 HOURS.
            </p>
          ) : (
            pending.map((request) => (
              <article className="border border-line bg-panel p-6" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="type-body-alt text-[15px] uppercase">
                      {request.borrower.full_name}
                      <span className="ml-2 font-secondary text-[9px] text-accent">
                        TRUST {Math.round(request.borrower.trust_score)}
                      </span>
                    </p>
                    <p className="font-secondary mt-1 text-[9px] text-ink/50">
                      {request.item.title.toUpperCase()} ·{" "}
                      {formatDateRange(request.start_date, request.end_date).toUpperCase()}
                    </p>
                    {request.message && (
                      <p className="type-body mt-3 max-w-xl border border-line bg-black px-4 py-3 text-[13px] leading-6 text-ink/70">
                        “{request.message}”
                      </p>
                    )}
                    <p className="font-secondary mt-3 text-[9px] text-ink/40">
                      ASKED {relativeTime(request.created_at).toUpperCase()}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <form action={approveRequest}>
                      <input name="request_id" type="hidden" value={request.id} />
                      <SubmitButton pendingLabel="APPROVING…">
                        <Check className="size-4" />
                        Approve
                      </SubmitButton>
                    </form>
                    <form action={declineRequest} className="flex flex-col gap-2">
                      <input name="request_id" type="hidden" value={request.id} />
                      <input
                        className="w-full rounded-lg border border-line bg-black px-4 py-2 text-[12px] outline-none transition-colors focus:border-accent dt:w-48"
                        maxLength={300}
                        name="reason"
                        placeholder="Reason (optional)"
                      />
                      <SubmitButton pendingLabel="DECLINING…" variant="danger">
                        Decline
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ YOUR LISTINGS ]</h2>

        {items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              action={
                <Link
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90"
                  href="/items/new"
                >
                  <PlusCircle className="size-4" />
                  List your first item
                </Link>
              }
              body="ANYTHING YOU OWN AND RARELY USE COULD BE EARNING TRUST ON CAMPUS."
              code="NO LISTINGS"
              icon={<Inbox className="size-7" />}
              title="Nothing listed yet"
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {items.map((item) => {
              const cover = publicUrl(BUCKETS.itemImages, item.images[0]);
              return (
                <article
                  className="flex flex-wrap items-center gap-5 border border-line bg-panel p-4"
                  key={item.id}
                >
                  <Link
                    className="size-20 shrink-0 overflow-hidden bg-black"
                    href={`/items/${item.id}`}
                  >
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="size-full object-cover" src={cover} />
                    )}
                  </Link>

                  <div className="min-w-40 flex-1">
                    <Link
                      className="type-body-alt text-[15px] uppercase transition-colors hover:text-accent"
                      href={`/items/${item.id}`}
                    >
                      {item.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={
                          item.status === "available"
                            ? "success"
                            : item.status === "paused"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {item.status}
                      </StatusBadge>
                      <span className="font-secondary text-[9px] text-ink/50">
                        {item.deposit_amount > 0
                          ? `₹${item.deposit_amount} DEPOSIT`
                          : "NO DEPOSIT"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setItemStatus}>
                      <input name="item_id" type="hidden" value={item.id} />
                      <input
                        name="status"
                        type="hidden"
                        value={item.status === "available" ? "paused" : "available"}
                      />
                      <SubmitButton pendingLabel="…" variant="secondary">
                        {item.status === "available" ? (
                          <>
                            <Pause className="size-3.5" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="size-3.5" />
                            Activate
                          </>
                        )}
                      </SubmitButton>
                    </form>
                    <Link
                      className="rounded-lg border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent"
                      href={`/items/${item.id}/edit`}
                    >
                      Edit
                    </Link>
                    <form action={deleteItem}>
                      <input name="item_id" type="hidden" value={item.id} />
                      <SubmitButton pendingLabel="…" variant="danger">
                        <Trash2 className="size-3.5" />
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-14">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">
            [ RECENT DECISIONS ]
          </h2>
          <div className="mt-4 divide-y divide-line border border-line bg-panel">
            {decided.map((request) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={request.id}>
                <span className="type-body text-[13px] uppercase text-ink/70">
                  {request.borrower.full_name} · {request.item.title} ·{" "}
                  {formatDateRange(request.start_date, request.end_date)}
                </span>
                <StatusBadge tone={requestTone(request.status)}>{request.status}</StatusBadge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
