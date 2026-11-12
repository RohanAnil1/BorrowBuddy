"use client";

import type { Notification } from "@borrowbuddy/shared";
import { Bell, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Parcel } from "@/components/assistant/mascot/parcel";
import { notificationHref } from "@/lib/notification-links";
import { createClient } from "@/lib/supabase/client";

type Toast = { id: string; title: string; body: string; href: string | null };

const TOAST_MS = 6500;

/**
 * The header bell, live: new notifications bump the badge and slide in a
 * small toast with Parcel, without a reload. The server count stays the
 * source of truth; live arrivals are added on top until the next render.
 */
export function NotificationBell({ userId, unreadCount }: { userId: string; unreadCount: number }) {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  // Live arrivals since the server last counted. Reset whenever that count changes.
  const [live, setLive] = useState({ base: unreadCount, extra: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ring, setRing] = useState(0);
  const seen = useRef(new Set<string>());

  if (live.base !== unreadCount) setLive({ base: unreadCount, extra: 0 });
  const count = unreadCount + live.extra;

  useEffect(() => {
    const db = createClient();
    let disposed = false;
    let refreshTimer: number | undefined;

    const channel = db.channel(`notifications-${userId}-${crypto.randomUUID()}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => {
        if (disposed) return;
        const row = payload.new as Notification;
        if (seen.current.has(row.id)) return;
        seen.current.add(row.id);

        setLive((current) => ({ ...current, extra: current.extra + 1 }));
        setRing((value) => value + 1);
        setToasts((current) =>
          [{ id: row.id, title: row.title, body: row.body, href: notificationHref(row) }, ...current].slice(0, 3),
        );
        window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== row.id)), TOAST_MS);

        // Let the page catch up (loan status, counts) once a burst settles.
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => router.refresh(), 1200);
      },
    );

    void (async () => {
      try {
        // Join with the signed-in session; the anon key cannot read private rows.
        const { data } = await db.auth.getSession();
        if (disposed || !data.session) return;
        await db.realtime.setAuth(data.session.access_token);
        if (!disposed) channel.subscribe();
      } catch {
        // Offline or blocked: the bell still shows the server count.
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
      void db.removeChannel(channel);
    };
  }, [userId, router]);

  const dismiss = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id));

  return (
    <>
      <Link
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
        className="relative flex size-9 items-center justify-center rounded-lg border border-line text-ink/60 transition-colors hover:border-accent hover:text-accent"
        href="/notifications"
      >
        <motion.span
          animate={ring > 0 && !reduce ? { rotate: [0, -18, 14, -8, 4, 0] } : { rotate: 0 }}
          className="flex"
          key={ring}
          transition={{ duration: 0.7 }}
        >
          <Bell className="size-4" />
        </motion.span>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center bg-accent font-secondary text-[8px] text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-20 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:w-80"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="pointer-events-auto flex w-full items-start gap-3 border border-accent/50 bg-black/95 p-3 shadow-2xl backdrop-blur"
              exit={{ opacity: 0, x: reduce ? 0 : 24 }}
              initial={{ opacity: 0, x: reduce ? 0 : 24 }}
              key={toast.id}
              layout={!reduce}
              role="status"
            >
              <Parcel mood="found" size={40} />
              <div className="min-w-0 flex-1">
                {toast.href ? (
                  <Link className="block hover:text-accent" href={toast.href} onClick={() => dismiss(toast.id)}>
                    <span className="block font-strong text-[12px] uppercase">{toast.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] normal-case text-ink/70">{toast.body}</span>
                  </Link>
                ) : (
                  <>
                    <span className="block font-strong text-[12px] uppercase">{toast.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] normal-case text-ink/70">{toast.body}</span>
                  </>
                )}
              </div>
              <button
                aria-label="Dismiss"
                className="rounded p-1 text-ink/50 hover:text-ink"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
