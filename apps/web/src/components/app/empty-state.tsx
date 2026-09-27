import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  body,
  action,
  code = "EMPTY SHELF",
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  code?: string;
}) {
  return (
    <div className="flex flex-col items-center border border-line bg-panel px-6 py-12 text-center">
      {icon && <span className="text-accent">{icon}</span>}
      <p className="status-bracket mt-4 text-[10px]">[ {code} ]</p>
      <h2 className="type-title mt-3 text-xl">{title}</h2>
      <p className="type-body mt-3 max-w-sm text-[13px] leading-6 text-ink/60 uppercase">
        {body}
      </p>
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
