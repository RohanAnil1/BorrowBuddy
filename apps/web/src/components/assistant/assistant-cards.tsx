"use client";

import { ArrowRight, ArrowUpRight, CalendarCheck, ImageOff, MapPin, Receipt } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { AssistantCard } from "@/lib/assistant/types";
import { buddy } from "./buddy-store";

const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const },
};

export function AssistantCardView({ card, onNavigate }: { card: AssistantCard; onNavigate?: () => void }) {
  const follow = () => {
    buddy.poke("happy");
    onNavigate?.();
  };

  switch (card.kind) {
    case "items":
      return (
        <motion.section {...enter} aria-label={card.title} className="buddy-card">
          <p className="buddy-card-label">[ {card.title.toUpperCase()} ]</p>
          <div className="buddy-rail">
            {card.items.map((item) => (
              <Link className="buddy-item" href={`/items/${item.id}`} key={item.id} onClick={follow}>
                <span className="buddy-item-photo">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" loading="lazy" src={item.image} />
                  ) : (
                    <ImageOff aria-hidden className="size-6" />
                  )}
                  <span className="buddy-item-chip">{item.condition}</span>
                </span>
                <span className="buddy-item-body">
                  <span className="buddy-item-title">{item.title}</span>
                  <span className="buddy-item-meta">
                    <span className="buddy-item-deposit">{item.deposit}</span>
                    <span>★ {item.trust}</span>
                  </span>
                  {item.spot && (
                    <span className="buddy-item-spot">
                      <MapPin aria-hidden className="size-3" />
                      {item.spot}
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {card.moreHref && card.items.length > 1 && (
              <Link className="buddy-item buddy-item-more" href={card.moreHref} onClick={follow}>
                <ArrowRight aria-hidden className="size-5" />
                <span>See the whole shelf</span>
              </Link>
            )}
          </div>
        </motion.section>
      );

    case "loans":
      return (
        <motion.section {...enter} aria-label={card.title} className="buddy-card">
          <p className="buddy-card-label">[ {card.title.toUpperCase()} ]</p>
          <ul className="buddy-rows">
            {card.loans.map((loan) => (
              <li key={loan.id}>
                <Link className="buddy-row" data-tone={loan.tone} href={`/loans/${loan.id}`} onClick={follow}>
                  <span className="buddy-row-main">
                    <span className="buddy-row-title">{loan.title}</span>
                    <span className="buddy-row-sub">
                      {loan.role === "borrowing" ? "Borrowing" : "Lending"} · {loan.statusLabel}
                    </span>
                  </span>
                  <span className="buddy-row-due">{loan.dueLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      );

    case "requests":
      return (
        <motion.section {...enter} aria-label={card.title} className="buddy-card">
          <p className="buddy-card-label">[ {card.title.toUpperCase()} ]</p>
          <ul className="buddy-rows">
            {card.requests.map((request) => (
              <li key={request.id}>
                <Link
                  className="buddy-row"
                  data-tone={request.status === "pending" ? "soon" : request.status === "declined" || request.status === "expired" ? "done" : "ok"}
                  href={request.direction === "incoming" ? "/my/items" : `/items/${request.itemId}`}
                  onClick={follow}
                >
                  <span className="buddy-row-main">
                    <span className="buddy-row-title">{request.title}</span>
                    <span className="buddy-row-sub">
                      {request.direction === "incoming" ? "Waiting on you" : "You asked"} · {request.dates}
                    </span>
                  </span>
                  <span className="buddy-row-due">{request.statusLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      );

    case "fines":
      return (
        <motion.section {...enter} aria-label={card.title} className="buddy-card buddy-ledger">
          <div className="buddy-ledger-head">
            <Receipt aria-hidden className="size-4" />
            <span className="buddy-card-label">[ OUTSTANDING ]</span>
            <span className="buddy-ledger-total">{card.total}</span>
          </div>
          {card.fines.length > 0 && (
            <ul className="buddy-ledger-lines">
              {card.fines.map((fine) => (
                <li key={fine.id}>
                  <span>
                    {fine.itemTitle ?? fine.reason}
                    <small>{fine.status}</small>
                  </span>
                  <span>{fine.amount}</span>
                </li>
              ))}
            </ul>
          )}
          <Link className="buddy-ledger-link" href="/fines" onClick={follow}>
            Open your ledger <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </motion.section>
      );

    case "action":
      return (
        <motion.div {...enter}>
          <Link className="buddy-action" data-variant={card.variant} href={card.href} onClick={follow}>
            {card.variant === "request" ? (
              <CalendarCheck aria-hidden className="size-4 shrink-0" />
            ) : (
              <ArrowUpRight aria-hidden className="size-4 shrink-0" />
            )}
            <span className="buddy-action-text">
              <span>{card.label}</span>
              {card.description && <small>{card.description}</small>}
            </span>
          </Link>
        </motion.div>
      );
  }
}
