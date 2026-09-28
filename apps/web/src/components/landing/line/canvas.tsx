"use client";

/* eslint-disable react-hooks/immutability -- the camera and scene objects are
   imperative three.js engine state driven inside useFrame/useLayoutEffect by
   design; the react-compiler immutability rule does not map to WebGL code. */

import { ContactShadows } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Belt } from "./belt";
import { paintCurtain, paintHazard, paintLens, paintRadialGlow, paintTrustChip } from "./paint";
import { PARCEL_RIDE_Y, Parcel3D, type ParcelHandle } from "./parcel";
import { Station3D, type SharedTextures } from "./station";
import {
  CRATES,
  CYCLE_MS,
  FLIP_BACK,
  FLIP_OUT,
  GATES,
  GATE_X,
  SEGMENTS,
  clamp01,
  easeInOutCubic,
  locate,
  toWorldX,
  type GatePhase,
  type LineSync,
} from "./timeline";

type Props = {
  onSync: (sync: LineSync) => void;
  reduced: boolean;
  rich: boolean;
  running: boolean;
  spread: boolean;
};

type LineMirror = { x: number; phases: string; stamps: number; cycle: number };

export default function CargoLineCanvas({ onSync, reduced, rich, running, spread }: Props) {
  const [software, setSoftware] = useState(false);
  return (
    <Canvas
      camera={{ fov: 26, position: [0, 3.1, 22] }}
      dpr={rich ? [1, 1.75] : [1, 1.25]}
      frameloop={reduced ? "demand" : running ? "always" : "never"}
      gl={{ antialias: rich, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        try {
          const context = gl.getContext();
          const debug = context.getExtension("WEBGL_debug_renderer_info");
          const renderer = debug
            ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
            : "";
          if (/swiftshader|software|llvmpipe/i.test(renderer)) {
            // software rasteriser (headless / very low-end) — skip postprocessing
            setSoftware(true);
          }
        } catch {
          setSoftware(true);
        }
      }}
    >
      <Scene onSync={onSync} reduced={reduced} rich={rich && !software} running={running} spread={spread} />
    </Canvas>
  );
}

function Scene({ onSync, reduced, rich, running, spread }: Props) {
  const span = spread ? 24 : 12;
  const invalidate = useThree((state) => state.invalidate);
  const [phases, setPhases] = useState<GatePhase[]>(() =>
    GATES.map(() => (reduced ? "still" : "idle")),
  );
  const [crateIndex, setCrateIndex] = useState(0);
  const [stamps, setStamps] = useState(reduced ? GATES.length - 1 : 0);
  const clock = useRef({ elapsed: 0, seg: -1, cycle: 0, wake: -1, active: -1, lastActive: -1, key: "" });
  const parcel = useRef<ParcelHandle | null>(null);
  const wash = useRef(0);
  const dwellT0 = useRef(0);
  const trust = useRef({ active: false, t0: 0 });
  const chip = useRef<THREE.Group>(null);
  const chipMat = useRef<THREE.MeshBasicMaterial>(null);
  const mirror = useRef<LineMirror>({ x: 0, phases: "idle,idle,idle,idle", stamps: 0, cycle: 0 });

  const shared: SharedTextures = useMemo(() => {
    const make = (paint: (canvas: HTMLCanvasElement) => void) => {
      const canvas = document.createElement("canvas");
      paint(canvas);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return {
      curtain: make(paintCurtain),
      glow: make(paintRadialGlow),
      hazard: make(paintHazard),
      lens: make(paintLens),
    };
  }, []);

  const chipTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    paintTrustChip(canvas);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  const onParcelReady = useCallback(
    (handle: ParcelHandle) => {
      parcel.current = handle;
      handle.group.position.x = reduced ? toWorldX(GATE_X[2], span) : toWorldX(-0.16, span);
      invalidate();
    },
    [invalidate, reduced, span],
  );

  const scanning = phases.includes("scan");
  const crate = CRATES[crateIndex];

  useFrame((state, rawDelta) => {
    const handle = parcel.current;
    if (!handle) return;

    if (reduced) {
      handle.group.position.set(toWorldX(GATE_X[2], span), PARCEL_RIDE_Y, 0);
      handle.group.rotation.set(0, 0, 0);
      handle.flip.rotation.y = 0;
      return;
    }
    if (!running) return;

    const c = clock.current;
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    c.elapsed += delta * 1000;

    const cycle = Math.floor(c.elapsed / CYCLE_MS);
    const { index: segmentIndex, local } = locate(c.elapsed % CYCLE_MS);
    const segment = SEGMENTS[segmentIndex];

    // parcel — eased travel, held dwell, idle bob and sway
    const fraction =
      segment.kind === "travel"
        ? segment.from + (segment.to - segment.from) * easeInOutCubic(local)
        : segment.from;
    const x = toWorldX(fraction, span);
    handle.group.position.x = x;
    handle.group.position.y = PARCEL_RIDE_Y + Math.sin(t * 1.7) * 0.035;
    handle.group.rotation.z = Math.sin(t * 2.3) * 0.012;

    // custody flip
    const flip =
      segmentIndex < FLIP_OUT
        ? 0
        : segmentIndex === FLIP_OUT
          ? clamp01((local - 0.34) / 0.26)
          : segmentIndex === FLIP_BACK
            ? 1 - clamp01((local - 0.25) / 0.3)
            : segmentIndex < FLIP_BACK
              ? 1
              : 0;
    handle.flip.rotation.y = flip * Math.PI;

    // discrete state — segment tracking drives the gate life-cycle
    const entered = segmentIndex !== c.seg;
    const previous = c.seg >= 0 ? SEGMENTS[c.seg] : null;
    if (entered) c.seg = segmentIndex;

    let active = -1;
    let wake = -1;
    let lastActive = c.lastActive;

    if (previous && previous.kind === "dwell" && previous.gate !== null && entered) {
      lastActive = previous.gate;
    }
    if (segment.kind === "dwell" && segment.gate !== null) {
      active = segment.gate;
      if (active !== c.active) {
        dwellT0.current = t;
        if (active === GATES.length - 1) {
          trust.current = { active: true, t0: t };
        }
      }
    } else if (local > 0.7) {
      const destination = GATE_X.indexOf(segment.to);
      if (destination >= 0) wake = destination;
    }
    c.active = active;
    c.wake = wake;
    c.lastActive = lastActive;

    // scan burst on the parcel
    const dwellLocal = segment.kind === "dwell" ? (t - dwellT0.current) : Infinity;
    const washing = segment.kind === "dwell" && dwellLocal < 0.72;
    handle.scanLine.visible = washing;
    if (washing) {
      handle.scanLine.position.y = 0.95 - clamp01(dwellLocal / 0.66) * 1.9;
      (handle.scanLine.material as THREE.MeshBasicMaterial).opacity = 1;
    }
    const washTarget = washing ? 0.13 + Math.sin(t * 30) * 0.04 : 0;
    wash.current += (washTarget - wash.current) * Math.min(1, delta * 8);
    handle.flash.opacity = wash.current;

    // trust chip
    if (chip.current && chipMat.current) {
      if (trust.current.active) {
        const age = t - trust.current.t0;
        chip.current.visible = age < 1.5;
        chip.current.position.set(x, PARCEL_RIDE_Y + 1.35 + age * 0.55, 0.4);
        chipMat.current.opacity = age < 0.15 ? age / 0.15 : 1 - clamp01((age - 0.8) / 0.6);
      } else {
        chip.current.visible = false;
      }
    }

    // phase + sync bookkeeping
    const nextKey = `${active},${wake},${lastActive}`;
    if (nextKey !== c.key) {
      c.key = nextKey;
      const nextStamps = active >= 0 ? active + 1 : mirror.current.stamps;
      const next = GATES.map((_, i): GatePhase =>
        active === i ? "scan" : wake === i ? "wake" : lastActive === i ? "after" : "idle",
      );
      setPhases(next);
      setStamps(nextStamps);
      onSync({
        activeGate: active >= 0 ? active : null,
        wakingGate: wake >= 0 ? wake : null,
        lastActive: lastActive >= 0 ? lastActive : null,
        stamps: nextStamps,
        crateIndex,
        count: cycle,
      });
      invalidate();
    }
    if (cycle !== c.cycle) {
      c.cycle = cycle;
      setCrateIndex((index) => (index + 1) % CRATES.length);
      setStamps(0);
      onSync({
        activeGate: null,
        wakingGate: null,
        lastActive: null,
        stamps: 0,
        crateIndex: (crateIndex + 1) % CRATES.length,
        count: cycle,
      });
      invalidate();
    }

    // debug/telemetry mirror for the parity probe
    mirror.current = {
      x,
      phases: GATES.map((_, i) =>
        active === i ? "scan" : wake === i ? "wake" : lastActive === i ? "after" : "idle",
      ).join(","),
      stamps: active >= 0 ? active + 1 : mirror.current.stamps,
      cycle,
    };
    (window as Window & { __line?: LineMirror }).__line = mirror.current;
  });

  return (
    <>
      <color attach="background" args={["#0b0805"]} />
      <fog attach="fog" args={["#0b0805", 20, 55]} />
      <ambientLight color="#ffe2bd" intensity={0.24} />
      <directionalLight color="#8fb0ff" intensity={0.3} position={[-7, 9, -5]} />
      <directionalLight color="#ffb24d" intensity={0.22} position={[6, 7, 6]} />

      <CameraRig reduced={reduced} span={span} />

      {/* hall floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[90, 46]} />
        <meshStandardMaterial color="#0d0a07" metalness={0.1} roughness={0.95} />
      </mesh>

      <Belt reduced={reduced} span={span} speed={(span * 0.25) / 1.9} />

      {GATES.map((gate, index) => (
        <Station3D
          gate={gate}
          index={index}
          key={gate.code}
          phase={reduced ? "still" : phases[index]}
          reduced={reduced}
          shared={shared}
          x={toWorldX(GATE_X[index], span)}
        />
      ))}

      <Parcel3D
        crate={crate}
        onReady={onParcelReady}
        reduced={reduced}
        scanning={scanning}
        stamps={stamps}
      />

      {/* trust chip */}
      <group ref={chip} position={[0, 3, 0.4]} visible={false}>
        <mesh>
          <planeGeometry args={[1.24, 0.465]} />
          <meshBasicMaterial map={chipTexture} ref={chipMat} toneMapped={false} transparent />
        </mesh>
      </group>

      {rich && !reduced && (
        <ContactShadows
          blur={2.4}
          far={3.2}
          frames={Infinity}
          opacity={0.55}
          position={[0, 0.575, 0]}
          resolution={512}
          scale={[span + 8, 3]}
        />
      )}

      {rich && !reduced && (
        <EffectComposer>
          <Bloom intensity={0.85} luminanceSmoothing={0.25} luminanceThreshold={0.72} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

/** Frames the line span to the current viewport and adds a gentle pointer sway. */
function CameraRig({ reduced, span }: { reduced: boolean; span: number }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const pointer = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    const fov = (26 * Math.PI) / 180;
    const z = Math.min(44, Math.max(13, (span + 2.6) / (2 * Math.tan(fov / 2) * aspect)));
    camera.position.set(0, 3.0, z);
    camera.lookAt(0, 2.35, 0);
    camera.updateProjectionMatrix();
  }, [camera, size, span]);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.current.x = (event.clientX - rect.left) / rect.width - 0.5;
      pointer.current.y = (event.clientY - rect.top) / rect.height - 0.5;
    };
    const onLeave = () => {
      pointer.current.x = 0;
      pointer.current.y = 0;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    if (reduced) return;
    const delta = Math.min(rawDelta, 0.05);
    const targetX = pointer.current.x * 0.7;
    const targetY = 3.0 - pointer.current.y * 0.3;
    camera.position.x += (targetX - camera.position.x) * Math.min(1, delta * 2.4);
    camera.position.y += (targetY - camera.position.y) * Math.min(1, delta * 2.4);
    camera.lookAt(0, 2.35, 0);
  });

  return null;
}
