import { Pencil, Settings2, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageGallery } from "@/components/app/image-gallery";
import { RequestForm } from "@/components/app/request-form";
import { StatusBadge } from "@/components/app/status-badge";
import { conditionLabel, formatDeposit, itemStatusLabel } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getItem, getItemAvailability } from "@/lib/data/items";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  return { title: item?.title ?? "Item" };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const profile = await requireVerified();
  const { id } = await params;
  // Buddy's "Request" action links here with dates prefilled; the form still validates.
  const { start, end } = await searchParams;
  const prefill =
    start && end && ISO_DATE.test(start) && ISO_DATE.test(end) && start <= end ? { start, end } : null;

  const item = await getItem(id);
  if (!item) notFound();

  const windows = await getItemAvailability(id);
  const isOwner = item.owner_id === profile.id;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <Link
        className="font-secondary text-[10px] uppercase text-ink/50 transition-colors hover:text-accent"
        href="/home"
      >
        ← BACK TO THE CATALOG
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <ImageGallery images={item.images} title={item.title} />

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">{conditionLabel(item.condition)}</StatusBadge>
            {item.category && <StatusBadge tone="muted">{item.category.name}</StatusBadge>}
            {item.status !== "available" && (
              <StatusBadge tone="warning">{itemStatusLabel(item.status)}</StatusBadge>
            )}
          </div>

          <div>
            <h1 className="type-title text-[2rem] dt:text-[2.5rem]">{item.title}</h1>
            <p className="type-body mt-4 whitespace-pre-line text-[14px] leading-7 text-ink/60 uppercase">
              {item.description}
            </p>
          </div>

          <dl className="grid gap-4 border border-line bg-panel p-6 sm:grid-cols-3">
            <Spec label="DEPOSIT" value={formatDeposit(item.deposit_amount)} />
            <Spec label="MAX LOAN" value={`${item.max_loan_days} DAYS`} />
            <Spec
              label="PICKUP"
              value={(item.pickup_location?.name ?? "COORDINATE IN CHAT").toUpperCase()}
            />
          </dl>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="border border-line bg-panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-secondary text-[9px] text-ink/50">[ OWNER ]</p>
                <p className="type-body-alt mt-1 text-[16px] uppercase">
                  {item.owner.full_name}
                </p>
              </div>
              <span className="flex size-11 items-center justify-center bg-black font-title text-sm text-ink">
                {item.owner.full_name.slice(0, 1).toUpperCase()}
              </span>
            </div>

            {/* reputation badge */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 border border-accent/60 bg-accent/10 px-2.5 py-1 font-secondary text-[9px] uppercase text-accent">
                <Star className="size-3" />
                TRUST SCORE {Math.round(item.owner.trust_score)}
              </span>
              {item.owner.verification_status === "verified" && (
                <span className="border border-line px-2.5 py-1 font-secondary text-[9px] uppercase text-ink/60">
                  [ ID VERIFIED ]
                </span>
              )}
            </div>

            {isOwner && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
                <Link
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-strong text-[11px] uppercase transition-colors hover:border-accent"
                  href={`/items/${item.id}/edit`}
                >
                  <Pencil className="size-3.5" />
                  Edit listing
                </Link>
                <Link
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-strong text-[11px] uppercase transition-colors hover:border-accent"
                  href="/my/items"
                >
                  <Settings2 className="size-3.5" />
                  Manage
                </Link>
              </div>
            )}
          </div>

          <RequestForm
            canRequest={profile.verification_status === "verified"}
            initialRange={prefill}
            isOwner={isOwner}
            itemId={item.id}
            maxLoanDays={item.max_loan_days}
            windows={windows}
          />
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-secondary text-[9px] text-ink/50">{label}</dt>
      <dd className="type-body-alt mt-1 text-[13px] uppercase">{value}</dd>
    </div>
  );
}
