import { GATES } from "./timeline";

/** Static 2D stand-in for machines without WebGL — same four stations, no motion. */
export function LineFallback() {
  return (
    <div aria-hidden className="flex h-full w-full items-end justify-center overflow-hidden">
      <div className="relative flex h-[210px] w-full max-w-5xl items-end justify-around gap-3 px-6">
        {GATES.map((gate) => (
          <div className="relative flex w-[76px] flex-col items-center dt:w-[104px]" key={gate.code}>
            <p className="mb-2 font-label text-[8px] text-ink/45 dt:text-[10px]">[ {gate.label} ]</p>
            <div className="relative h-[130px] w-full border-x-[3px] border-t-[5px] border-ink/30 dt:h-[170px]">
              <span className="absolute -bottom-[3px] -left-[4px] h-[7px] w-[12px] bg-accent/50" />
              <span className="absolute -bottom-[3px] -right-[4px] h-[7px] w-[12px] bg-accent/50" />
              <span className="absolute left-1/2 top-[26px] flex size-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-ink/40 bg-black dt:size-6" />
              <span className="absolute inset-x-2 top-[34px] h-px bg-paper/15" />
            </div>
            <p className="mt-1.5 font-secondary text-[8px] text-ink/35">[ {gate.code} · 000 ]</p>
          </div>
        ))}
        <div className="absolute inset-x-4 bottom-6 h-9 border-y border-ink/15 bg-black/40" />
        <div className="absolute bottom-[62px] left-[13%] h-[86px] w-[58px] rounded-sm border border-line bg-[#8a6a44]">
          <span className="absolute inset-x-1 top-6 h-8 bg-paper/90" />
        </div>
      </div>
    </div>
  );
}
