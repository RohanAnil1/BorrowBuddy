import Link from "next/link";
import { notFound } from "next/navigation";
import { campusDate } from "@borrowbuddy/shared";
import {
  CampusBadge,
  CampusFrame,
  fieldClass,
  secondaryClass,
} from "@/components/campus/campus-ui";
import { ActionForm, Deadline, Label } from "@/components/campus/campus-forms";
import { AppointmentPicker } from "@/components/campus/campus-scheduling";
import { CollectionChat } from "@/components/campus/collection-chat";
import { requireVerified } from "@/lib/auth/guards";
import {
  campusAppointments,
  campusMessages,
  campusPeople,
  campusPost,
  campusTransfer,
} from "@/lib/data/campus";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireVerified();
  const { id } = await params;
  const transfer = await campusTransfer(id);
  if (
    !transfer ||
    ![transfer.host_id, transfer.recipient_id].includes(profile.id)
  )
    notFound();
  const [visiblePost, messages, appointments, people] = await Promise.all([
    campusPost(transfer.post_id),
    campusMessages(id),
    campusAppointments({ transfer: id }),
    campusPeople([transfer.host_id, transfer.recipient_id]),
  ]);
  // A hidden board post must not erase the participants' private chat record.
  const post = visiblePost ?? {
    id: transfer.post_id,
    title: "Collection record",
    kind: transfer.claim_id ? "found" : "giveaway",
    location: "Original post withdrawn",
  };
  const active =
    transfer.status === "active" &&
    (!transfer.expires_at || new Date(transfer.expires_at) > new Date());
  const isHost = transfer.host_id === profile.id;
  return (
    <CampusFrame
      title={post.title}
      eyebrow="YOUR PRIVATE COLLECTION"
      description={`${people[transfer.host_id]?.full_name ?? "Host"} → ${people[transfer.recipient_id]?.full_name ?? "Recipient"}`}
      action={
        <CampusBadge>
          {active
            ? "READY TO ARRANGE"
            : transfer.status === "active"
              ? "EXPIRED"
              : transfer.status}
        </CampusBadge>
      }
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {visiblePost && (
            <Link
              className={secondaryClass}
              href={`/campus/${post.kind === "found" ? "lost-found" : "giveaways"}/${post.id}`}
            >
              VIEW ORIGINAL POST →
            </Link>
          )}
          <div className="border border-line bg-black p-5">
            <p className="font-secondary text-[10px] text-accent">
              [ COLLECTION DETAILS ]
            </p>
            <p className="mt-3 text-sm text-ink/70">
              CAMPUS AREA · {post.location}
            </p>
            <p className="mt-3 text-sm normal-case text-ink/60">
              Confirm your meeting point here in chat or book a published slot.
              No payment is required.
            </p>
          </div>
          <CollectionChat
            key={id}
            transferId={id}
            userId={profile.id}
            initialMessages={messages}
            active={active}
          />
        </div>
        <aside className="space-y-5">
          {transfer.expires_at && transfer.status === "active" && (
            <Deadline value={transfer.expires_at} />
          )}
          {transfer.status === "completed" ? (
            <section
              className="border border-accent/50 bg-black p-6"
              data-testid="collection-receipt"
            >
              <CampusBadge>COLLECTION RECEIPT</CampusBadge>
              <h2 className="type-title mt-4 text-2xl">
                {post.kind === "found"
                  ? "Back with its owner."
                  : "A new chapter starts here."}
              </h2>
              <p className="mt-4 text-sm normal-case leading-6">
                {people[transfer.host_id]?.full_name} handed this item to{" "}
                {people[transfer.recipient_id]?.full_name}.
              </p>
              <p className="mt-3 font-secondary text-xs">
                {transfer.completed_at && campusDate(transfer.completed_at)} IST
              </p>
              <p className="mt-4 break-all font-secondary text-[9px] text-ink/40">
                RECEIPT {id}
              </p>
            </section>
          ) : active ? (
            <>
              <AppointmentPicker
                hostId={transfer.host_id}
                transferId={id}
                kind="collection"
                appointments={appointments}
                expiresAt={transfer.expires_at}
              />
              <section className="border border-line bg-black p-5">
                <h2 className="type-title mb-4 text-2xl">
                  Confirm at collection
                </h2>
                {isHost ? (
                  <ActionForm
                    action="confirm_code"
                    key={`${id}:confirm`}
                    payload={{ id }}
                    label="CONFIRM COLLECTION"
                  >
                    <Label text="RECIPIENT’S SIX-DIGIT CODE">
                      <input
                        name="code"
                        required
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        className={`${fieldClass} font-ticket text-2xl tracking-[.3em]`}
                        autoComplete="off"
                        placeholder="000000"
                      />
                    </Label>
                  </ActionForm>
                ) : (
                  <ActionForm
                    action="generate_code"
                    key={`${id}:generate`}
                    payload={{ id }}
                    label="GENERATE / REPLACE MY CODE"
                  />
                )}
                <p className="mt-4 text-xs normal-case leading-5 text-ink/50">
                  Codes work once for 15 minutes, within the collection
                  deadline. Five incorrect attempts require a replacement code.
                  Confirm only when the item changes hands.
                </p>
              </section>
              <section className="border border-line bg-black p-5">
                <ActionForm
                  action="cancel_transfer"
                  payload={{ id }}
                  label="CANCEL COLLECTION"
                  secondary
                  confirm="This closes your conversation and releases the item and appointment."
                >
                  <Label text="CANCELLATION REASON">
                    <input
                      name="reason"
                      required
                      minLength={5}
                      maxLength={500}
                      className={fieldClass}
                    />
                  </Label>
                </ActionForm>
              </section>
            </>
          ) : (
            <div className="border border-line bg-black p-5">
              <p className="text-sm normal-case text-ink/65">
                {transfer.closed_reason ??
                  "This collection is closed. Your conversation remains available as a read-only record."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </CampusFrame>
  );
}
