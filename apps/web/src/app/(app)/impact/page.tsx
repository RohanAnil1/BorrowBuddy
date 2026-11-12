import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Parcel } from "@/components/assistant/mascot/parcel";
import { EmptyState } from "@/components/app/empty-state";
import { CategoryBars, StatTile } from "@/components/app/impact-view";
import { requireVerified } from "@/lib/auth/guards";
import { getImpactRates, getImpactStats } from "@/lib/data/impact";

export const metadata = { title: "Campus impact" };

const inr = new Intl.NumberFormat("en-IN");

export default async function ImpactPage() {
  const profile = await requireVerified();
  const [campus, mine, rates] = await Promise.all([getImpactStats("campus"), getImpactStats("me"), getImpactRates()]);
  const firstName = profile.full_name.split(" ")[0];

  if (!campus || !mine) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
        <EmptyState
          body="The impact numbers couldn't load right now. Try again in a minute."
          code="SIGNAL LOST"
          mood="confused"
          title="Impact is warming up"
        />
      </div>
    );
  }

  const campusLine =
    campus.completed_loans === 0
      ? "No loans have come back yet. The first one starts the count."
      : `${inr.format(campus.completed_loans)} completed ${campus.completed_loans === 1 ? "loan" : "loans"} between ${inr.format(campus.lenders)} ${campus.lenders === 1 ? "lender" : "lenders"} and ${inr.format(campus.borrowers)} ${campus.borrowers === 1 ? "borrower" : "borrowers"}.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="status-bracket text-[11px]">[ CAMPUS IMPACT ]</p>
          <h1 className="type-title mt-2 text-[2rem] dt:text-[2.5rem]">What sharing saved us</h1>
          <p className="mt-3 text-[14px] normal-case leading-6 text-ink/75">
            Every borrow is something nobody had to buy or rent. Here&apos;s the running tally for campus, and your part in it.
          </p>
        </div>
        <Parcel mood="happy" size={110} title="Parcel celebrating" />
      </div>

      <section aria-labelledby="campus-heading" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-secondary text-[12px] uppercase text-ink/75" id="campus-heading">Campus so far</h2>
          <p className="text-[12px] normal-case text-ink/60">{campusLine}</p>
        </div>
        {/* Headline left (two rows tall on wide screens), four supporting numbers in a 2x2. */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="col-span-2 grid lg:col-span-1 lg:row-span-2">
            <StatTile hero hint="Rental value of the days things were borrowed. An estimate, see below." kind="money" label="Est. money saved" value={campus.money_saved} />
          </div>
          <StatTile hint="Returned and done" label="Completed loans" value={campus.completed_loans} />
          <StatTile hint="Days items spent with a borrower" label="Borrow-days" value={campus.borrow_days} />
          <StatTile hint={`Different items lent out · ${inr.format(campus.listed_items)} on the shelf now`} label="Items shared" value={campus.items_shared} />
          <StatTile hint="Returned without damage or loss" kind="money" label="Deposits kept safe" value={campus.deposits_returned} />
        </div>
        {campus.rehomed > 0 && (
          <p className="mt-3 text-[12px] normal-case text-ink/60">
            Plus {inr.format(campus.rehomed)} {campus.rehomed === 1 ? "thing" : "things"} found or given away through Campus.
          </p>
        )}
      </section>

      {campus.categories.length > 0 && (
        <section className="mt-8">
          <CategoryBars caption="Estimated savings by category, campus-wide" categories={campus.categories} />
        </section>
      )}

      <section aria-labelledby="you-heading" className="mt-12">
        <h2 className="font-secondary text-[12px] uppercase text-ink/75" id="you-heading">
          {firstName}&apos;s share
        </h2>
        {mine.completed_loans === 0 ? (
          <div className="mt-4">
            <EmptyState
              action={
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Link className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white hover:opacity-90" href="/items/new">
                    List an item <ArrowRight className="size-4" />
                  </Link>
                  <Link className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-strong text-[12px] uppercase hover:border-accent" href="/home">
                    Browse
                  </Link>
                </div>
              }
              body="Your numbers start with your first returned loan, whether you lend or borrow."
              code="NO TALLY YET"
              compact
              mood="wave"
              title="Your counter is at zero"
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <StatTile hint={`${mine.borrowed_loans} ${mine.borrowed_loans === 1 ? "loan" : "loans"} borrowed`} kind="money" label="You saved" value={mine.borrowed_saved} />
              <StatTile hint="Days you had something you didn't buy" label="Days borrowed" value={mine.borrowed_days} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatTile hint={`${mine.lent_loans} ${mine.lent_loans === 1 ? "loan" : "loans"} lent`} kind="money" label="You saved others" value={mine.lent_saved} />
              <StatTile hint="Different students who borrowed from you" label="Students helped" value={mine.students_helped} />
            </div>
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-line pt-6 text-[12px] normal-case leading-6 text-ink/55">
        <p>
          <strong className="font-normal text-ink/75">How the estimate works:</strong> each completed loan counts its days out
          (pickup date to return) times a rough daily rental value for its category
          {rates.length > 0 && (
            <>
              {" "}({rates.map((rate) => `${rate.name} ₹${rate.daily_value}`).join(", ")} per day)
            </>
          )}
          . Only returned loans count. It&apos;s a ballpark, not an exact number.
        </p>
      </footer>
    </div>
  );
}
