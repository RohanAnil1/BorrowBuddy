import { MapPin, Navigation } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { requireVerified } from "@/lib/auth/guards";
import { getPickupLocationStats } from "@/lib/data/items";

export const metadata = { title: "Pickup map" };

const WIDTH = 1000;
const HEIGHT = 640;

export default async function MapPage() {
  await requireVerified();
  const stats = await getPickupLocationStats();

  const withCoords = stats.filter(
    (entry) => entry.location.lat !== null && entry.location.lng !== null,
  );

  if (withCoords.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
        <h1 className="type-title">Pickup map</h1>
        <div className="mt-6">
          <EmptyState
            body="CAMPUS PICKUP SPOTS WILL APPEAR HERE ONCE THEY HAVE COORDINATES."
            icon={<MapPin className="size-7" />}
            title="No spots mapped yet"
          />
        </div>
      </div>
    );
  }

  const lats = withCoords.map((entry) => entry.location.lat as number);
  const lngs = withCoords.map((entry) => entry.location.lng as number);
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.35 + 0.0004;
  const padLng = (Math.max(...lngs) - Math.min(...lngs)) * 0.35 + 0.0004;

  const minLat = Math.min(...lats) - padLat;
  const maxLat = Math.max(...lats) + padLat;
  const minLng = Math.min(...lngs) - padLng;
  const maxLng = Math.max(...lngs) + padLng;

  const toX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * WIDTH;
  const toY = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * HEIGHT;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ CAMPUS ROUTES ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Pickup map</h1>
      <p className="type-body mt-2 max-w-xl text-[13px] leading-6 uppercase text-ink/60">
        Every handover happens at one of these spots. Tap a pin to see what&apos;s
        waiting there.
      </p>

      <div className="mt-8 border border-line bg-deep p-1">
        <svg
          aria-label="Map of campus pickup spots"
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <radialGradient cx="50%" cy="50%" id="glow" r="50%">
              <stop offset="0%" stopColor="#6176c9" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#6176c9" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect fill="#021249" height={HEIGHT} width={WIDTH} />
          <circle cx={WIDTH * 0.78} cy={HEIGHT * 0.24} r="170" fill="url(#glow)" />

          {/* campus blocks — abstract schematic */}
          <path
            d={`M0,${HEIGHT * 0.62} C${WIDTH * 0.2},${HEIGHT * 0.5} ${WIDTH * 0.42},${HEIGHT * 0.72} ${WIDTH * 0.62},${HEIGHT * 0.6} C${WIDTH * 0.8},${HEIGHT * 0.5} ${WIDTH * 0.9},${HEIGHT * 0.64} ${WIDTH},${HEIGHT * 0.56} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`}
            fill="#10174a"
            opacity="0.9"
          />
          <path
            d={`M0,${HEIGHT * 0.78} C${WIDTH * 0.25},${HEIGHT * 0.68} ${WIDTH * 0.5},${HEIGHT * 0.86} ${WIDTH * 0.75},${HEIGHT * 0.74} C${WIDTH * 0.88},${HEIGHT * 0.68} ${WIDTH * 0.95},${HEIGHT * 0.78} ${WIDTH},${HEIGHT * 0.72} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`}
            fill="#10174a"
            opacity="0.6"
          />

          {withCoords.map(({ location, availableCount }) => {
            const x = toX(location.lng as number);
            const y = toY(location.lat as number);

            return (
              <g key={location.id}>
                <line
                  className="[stroke-width:4px] dt:[stroke-width:3px]"
                  strokeLinecap="round"
                  stroke="#1e1e1e"
                  strokeOpacity="0.9"
                  strokeWidth="3"
                  x1={x}
                  x2={x + 26}
                  y1={y}
                  y2={y + 26}
                />
                <circle
                  className="[r:20px] dt:[r:13px] [stroke-width:4px] dt:[stroke-width:3px]"
                  cx={x}
                  cy={y}
                  fill="#f0f0f0"
                  r="13"
                  stroke="#1e1e1e"
                  strokeWidth="3"
                />
                <circle className="[r:7px] dt:[r:4.5px]" cx={x} cy={y} fill="#cb840e" r="4.5" />
                <text
                  className="text-[24px] dt:text-[15px]"
                  fill="#ffffff"
                  fontFamily="var(--ff-gotham-med), sans-serif"
                  fontSize="15"
                  fontWeight="400"
                  x={x + 26}
                  y={y + 6}
                >
                  {location.name}
                </text>
                <text
                  className="text-[18px] dt:text-[11px]"
                  fill="#cb840e"
                  fontFamily="var(--ff-noto-mono), monospace"
                  fontSize="11"
                  x={x + 26}
                  y={y + 30}
                >
                  {availableCount} AVAILABLE
                </text>
              </g>
            );
          })}

          <g transform={`translate(${WIDTH - 70}, 40)`}>
            <circle cx="0" cy="0" fill="#f0f0f0" fillOpacity="0.12" r="22" />
            <path d="M0,-12 L5,6 L0,2 L-5,6 Z" fill="#f0f0f0" />
            <text
              fill="#f0f0f0"
              fontFamily="var(--ff-noto-mono), monospace"
              fontSize="10"
              textAnchor="middle"
              y="34"
            >
              N
            </text>
          </g>
        </svg>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {stats.map(({ location, availableCount }) => (
          <Link
            className="flex items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
            href={`/home?spot=${location.id}`}
            key={location.id}
          >
            <div>
              <p className="flex items-center gap-2 font-secondary text-[12px] uppercase text-ink">
                <Navigation className="size-4 text-accent" />
                {location.name}
              </p>
              {location.description && (
                <p className="type-body mt-1 text-[12px] text-ink/60 uppercase">
                  {location.description}
                </p>
              )}
            </div>
            <span className="shrink-0 border border-line px-3 py-1.5 font-secondary text-[9px] uppercase text-ink/60">
              {availableCount} ITEM{availableCount === 1 ? "" : "S"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
