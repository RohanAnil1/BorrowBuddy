"use client";

/* eslint-disable react-hooks/immutability -- three.js materials/textures are
   imperative engine state animated inside useFrame and repainted in effects by
   design; the react-compiler immutability rule does not map to WebGL code. */

import { SpotLight } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { paintIdPlate, paintSign } from "./paint";
import { clamp01, type GateDef, type GatePhase } from "./timeline";

export type SharedTextures = {
  hazard: THREE.Texture;
  glow: THREE.Texture;
  curtain: THREE.Texture;
  lens: THREE.Texture;
};

const ACCENT = new THREE.Color("#cb840e");
const ACCENT_HOT = new THREE.Color("#ffd08a").multiplyScalar(1.9);
const GREEN = new THREE.Color("#47d18a");
const GREEN_SOFT = new THREE.Color("#47d18a").multiplyScalar(0.55);
const OFF = new THREE.Color("#2b2b2b");

const CURTAIN_COUNT = 8;
const LED_COUNT = 12;

export function Station3D({
  compact,
  gate,
  index,
  phase,
  reduced,
  shared,
  x,
}: {
  compact: boolean;
  gate: GateDef;
  index: number;
  phase: GatePhase;
  reduced: boolean;
  shared: SharedTextures;
  x: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<THREE.Group>(null);
  const ledMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const lensMat = useRef<THREE.MeshBasicMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const lampMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const strobeMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const curtains = useRef<THREE.Group[]>([]);
  const sonars = useRef<THREE.Mesh[]>([]);
  const spot = useRef<THREE.SpotLight>(null);
  const poolMat = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.Group>(null);
  const beamCore = useRef<THREE.MeshBasicMaterial>(null);
  const beamEdgeL = useRef<THREE.MeshBasicMaterial>(null);
  const beamEdgeR = useRef<THREE.MeshBasicMaterial>(null);
  const beamSpot = useRef<THREE.Mesh>(null);
  const beamSpotMat = useRef<THREE.MeshBasicMaterial>(null);
  const phaseStart = useRef(0);
  const lastPhase = useRef<GatePhase | null>(null);
  const spotPower = useRef(1.2);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);

  const textures = useMemo(() => {
    const make = (paint: (canvas: HTMLCanvasElement) => void) => {
      const canvas = document.createElement("canvas");
      paint(canvas);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return {
      plate: make((canvas) => {
        canvas.width = 160;
        canvas.height = 240;
        paintIdPlate(canvas, gate.code, "idle");
      }),
      sign: make((canvas) => paintSign(canvas, gate.code, gate.label, "idle")),
    };
  }, [gate.code, gate.label]);

  // fonts may land after first paint — repaint the text-bearing textures once
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (!alive) return;
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 240;
      paintIdPlate(canvas, gate.code, phase === "still" ? "still" : phase);
      textures.plate.image = canvas;
      textures.plate.needsUpdate = true;
      const signCanvas = document.createElement("canvas");
      paintSign(signCanvas, gate.code, gate.label, phase === "still" ? "still" : phase);
      textures.sign.image = signCanvas;
      textures.sign.needsUpdate = true;
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [gate.code, gate.label, invalidate, phase, textures]);

  // ID plate + sign repaint on every phase change (data flip / name tint)
  useEffect(() => {
    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 160;
    plateCanvas.height = 240;
    paintIdPlate(plateCanvas, gate.code, phase);
    textures.plate.image = plateCanvas;
    textures.plate.needsUpdate = true;
    const signCanvas = document.createElement("canvas");
    paintSign(signCanvas, gate.code, gate.label, phase === "still" ? "still" : phase);
    textures.sign.image = signCanvas;
    textures.sign.needsUpdate = true;
    invalidate();
  }, [gate.code, gate.label, invalidate, phase, textures]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    if (reduced) return;

    const lit = phase === "scan" || phase === "still";
    const awake = phase === "wake" || phase === "scan";
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      phaseStart.current = t;
    }
    const phaseT = t - phaseStart.current;
    const scanP = phase === "scan" ? clamp01(phaseT / 0.78) : 0;

    // ---- LED strip: green breathe → amber chase → hot chase → green line
    ledMats.current.forEach((mat, i) => {
      if (!mat) return;
      if (phase === "wake") {
        const head = (t * 3.4) % LED_COUNT;
        const d = Math.abs(((i - head + LED_COUNT * 1.5) % LED_COUNT) - LED_COUNT / 2);
        mat.color.copy(ACCENT_HOT).multiplyScalar(clamp01(1 - d / 3) + 0.12);
      } else if (phase === "scan") {
        const head = (t * 9) % LED_COUNT;
        const d = Math.abs(((i - head + LED_COUNT * 1.5) % LED_COUNT) - LED_COUNT / 2);
        mat.color.copy(ACCENT_HOT).multiplyScalar(clamp01(1 - d / 2.2) + 0.35);
      } else if (phase === "after") {
        if (phaseT < 0.85) {
          const sweep = phaseT / 0.85;
          mat.color.copy(i / LED_COUNT <= sweep ? GREEN : OFF);
        } else {
          mat.color.copy(GREEN_SOFT).multiplyScalar(0.8 + Math.sin(t * 1.1 + i * 0.4) * 0.2);
        }
      } else {
        // idle / still — green systems check
        mat.color.copy(GREEN_SOFT).multiplyScalar(0.7 + Math.sin(t * 1.1 + i * 0.34) * 0.3);
      }
    });

    // ---- scanner head
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + index);
    const headBase = phase === "scan" ? 1.9 + Math.sin(t * 34) * 0.18 : awake ? 1.1 + pulse * 0.35 : 0.42 + pulse * 0.12;
    if (ringMat.current) ringMat.current.color.copy(ACCENT_HOT).multiplyScalar(headBase);
    if (lensMat.current) lensMat.current.opacity = phase === "scan" ? 0.95 : awake ? 0.6 : 0.3;
    if (haloMat.current) haloMat.current.opacity = phase === "scan" ? 0.5 + Math.sin(t * 28) * 0.08 : awake ? 0.3 : 0.1;
    lampMats.current.forEach((mat, i) => {
      if (!mat) return;
      const chase = 0.5 + 0.5 * Math.sin(t * (phase === "scan" ? 10 : 2.4) - i * 1.1);
      mat.color.copy(awake || lit ? ACCENT_HOT : OFF).multiplyScalar(awake ? 0.5 + chase * 0.9 : 0.35);
    });

    // ---- curtains: idle sway → wake quiver → scan push → settle
    curtains.current.forEach((strip, i) => {
      if (!strip) return;
      if (phase === "scan") {
        const q = clamp01((phaseT - i * 0.045) / 0.55);
        strip.rotation.z = Math.sin(q * Math.PI) * -0.18;
      } else if (phase === "wake") {
        strip.rotation.z = Math.sin(t * 3 + i * 1.3) * 0.045;
      } else {
        const target = Math.sin(t * 0.6 + i * 0.7) * 0.016;
        strip.rotation.z += (target - strip.rotation.z) * Math.min(1, delta * 2.4);
      }
    });

    // ---- sonar pings (wake + scan)
    sonars.current.forEach((ring, k) => {
      if (!ring) return;
      const mat = ring.material as THREE.MeshBasicMaterial;
      if (!awake) {
        mat.opacity = 0;
        return;
      }
      const cycle = (t * 0.85 + k / 3) % 1;
      ring.scale.setScalar(0.55 + cycle * 1.9);
      mat.opacity = (1 - cycle) * 0.75;
    });

    // ---- spot light + volumetric cone
    const spotTargetPower = phase === "scan" ? 7.2 + Math.sin(t * 36) * 0.5 : phase === "wake" ? 2.6 : phase === "after" ? 1.4 : 0.85;
    spotPower.current += (spotTargetPower - spotPower.current) * Math.min(1, delta * 4.5);
    if (spot.current) spot.current.intensity = spotPower.current;

    if (poolMat.current) {
      const poolTarget = phase === "scan" ? 0.8 + Math.sin(t * 22) * 0.1 : phase === "wake" ? 0.42 : phase === "after" ? 0.22 : 0.16;
      poolMat.current.opacity += (poolTarget - poolMat.current.opacity) * Math.min(1, delta * 4);
    }

    // ---- strobes
    strobeMats.current.forEach((mat, i) => {
      if (!mat) return;
      const blink = (t * 11 + i * 0.5) % 1 < 0.5;
      mat.opacity = phase === "scan" ? (blink ? 1 : 0.12) : 0.1;
    });

    // ---- scan beam assembly
    if (beam.current) {
      const show = phase === "scan";
      beam.current.visible = show;
      if (show) {
        if (beamCore.current) {
          beamCore.current.opacity = clamp01(phaseT / 0.16) * (1 - clamp01((phaseT - 0.6) / 0.3));
        }
        if (beamEdgeL.current) beamEdgeL.current.opacity = beamCore.current ? beamCore.current.opacity * 0.5 : 0;
        if (beamEdgeR.current) beamEdgeR.current.opacity = beamEdgeL.current ? beamEdgeL.current.opacity : 0;
        if (beamSpot.current) {
          beamSpot.current.position.y = 2.9 - scanP * 2.3;
        }
        if (beamSpotMat.current) {
          beamSpotMat.current.opacity =
            phaseT < 0.1 ? phaseT * 10 : phaseT > 0.75 ? clamp01((0.9 - phaseT) / 0.15) : 0.9;
        }
      }
    }

    // ---- recoil on stamp impact
    if (group.current) {
      const recoil = phase === "scan" && phaseT < 0.45 ? Math.exp(-phaseT * 7) * Math.sin(phaseT * 46) * 0.035 : 0;
      group.current.position.y = recoil;
    }
  });

  const steel = "#666b74";
  const steelDark = "#3c4046";
  const bolt = "#8b9099";
  const coneOpacity = phase === "scan" ? 0.85 : phase === "wake" ? 0.38 : phase === "after" ? 0.2 : 0.12;

  return (
    <group position={[x, 0, 0]}>
      <group ref={group}>
        {/* ---------------------------------------------------------- posts */}
        {[-1.05, 1.05].map((px) => (
          <group key={px}>
            <mesh castShadow position={[px, 2.05, 0]}>
              <boxGeometry args={[0.44, 4.1, 0.44]} />
              <meshStandardMaterial color={steel} metalness={0.42} roughness={0.52} />
            </mesh>
            {/* inner face plate */}
            <mesh position={[px - Math.sign(px) * 0.24, 2.05, 0]}>
              <boxGeometry args={[0.03, 3.9, 0.34]} />
              <meshStandardMaterial color={steelDark} metalness={0.4} roughness={0.6} />
            </mesh>
            {/* corner bolts */}
            {[0.7, 1.9, 3.1, 3.9].map((by) => (
              <mesh key={by} position={[px, by, 0.235]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.035, 0.035, 0.03, 10]} />
                <meshStandardMaterial color={bolt} metalness={0.7} roughness={0.35} />
              </mesh>
            ))}
            {/* plinth + hazard wrap */}
            <mesh position={[px, 0.26, 0]}>
              <boxGeometry args={[0.62, 0.52, 0.66]} />
              <meshStandardMaterial color={steelDark} metalness={0.35} roughness={0.6} />
            </mesh>
            <mesh position={[px, 0.26, 0.336]}>
              <planeGeometry args={[0.62, 0.52]} />
              <meshStandardMaterial map={shared.hazard} roughness={0.7} />
            </mesh>
            <mesh position={[px + Math.sign(px) * 0.316, 0.26, 0]} rotation={[0, Math.sign(px) * (Math.PI / 2), 0]}>
              <planeGeometry args={[0.66, 0.52]} />
              <meshStandardMaterial map={shared.hazard} roughness={0.7} />
            </mesh>
            {/* strobe lamp on the plinth */}
            <mesh position={[px, 0.56, 0.22]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshBasicMaterial
                color={ACCENT_HOT}
                ref={(m) => {
                  if (m) strobeMats.current[px < 0 ? 0 : 1] = m;
                }}
                toneMapped={false}
                transparent
              />
            </mesh>
          </group>
        ))}

        {/* --------------------------------------------------------- lintel */}
        <mesh position={[0, 4.45, 0]}>
          <boxGeometry args={[3.1, 0.52, 0.66]} />
          <meshStandardMaterial color={steel} metalness={0.45} roughness={0.48} />
        </mesh>
        <mesh position={[0, 4.76, 0]}>
          <boxGeometry args={[3.3, 0.1, 0.74]} />
          <meshStandardMaterial color={steelDark} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0, 4.14, 0.02]}>
          <boxGeometry args={[2.7, 0.16, 0.56]} />
          <meshStandardMaterial color={steelDark} metalness={0.4} roughness={0.6} />
        </mesh>

        {/* LED strip (12 segments) */}
        {Array.from({ length: LED_COUNT }).map((_, i) => (
          <mesh key={i} position={[-0.99 + i * 0.18, 4.02, 0.3]}>
            <boxGeometry args={[0.13, 0.075, 0.05]} />
            <meshBasicMaterial
              color="#2b2b2b"
              ref={(m) => {
                if (m) ledMats.current[i] = m;
              }}
              toneMapped={false}
            />
          </mesh>
        ))}

        {/* ---------------------------------------------------- X-truss bay */}
        <mesh position={[0, 3.86, 0]} rotation={[0, 0, 0.36]}>
          <boxGeometry args={[0.07, 1.5, 0.07]} />
          <meshStandardMaterial color={steelDark} metalness={0.45} roughness={0.5} />
        </mesh>
        <mesh position={[0, 3.86, 0]} rotation={[0, 0, -0.36]}>
          <boxGeometry args={[0.07, 1.5, 0.07]} />
          <meshStandardMaterial color={steelDark} metalness={0.45} roughness={0.5} />
        </mesh>

        {/* ------------------------------------------------------- gantry bar */}
        <mesh position={[0, 3.42, 0.1]}>
          <boxGeometry args={[2.6, 0.18, 0.36]} />
          <meshStandardMaterial color={steel} metalness={0.45} roughness={0.5} />
        </mesh>

        {/* ------------------------------------------------------- curtains */}
        {Array.from({ length: CURTAIN_COUNT }).map((_, i) => (
          <group
            key={i}
            position={[-0.84 + i * 0.24, 3.3, 0.14]}
            ref={(g) => {
              if (g) curtains.current[i] = g;
            }}
          >
            <mesh position={[0, -1.42, 0]}>
              <planeGeometry args={[0.2, 2.84]} />
              <meshBasicMaterial map={shared.curtain} opacity={0.6} side={THREE.DoubleSide} transparent />
            </mesh>
          </group>
        ))}

        {/* --------------------------------------------------- scanner head */}
        <group position={[0, 3.32, 0.34]}>
          <mesh>
            <boxGeometry args={[1.2, 0.72, 0.52]} />
            <meshStandardMaterial color="#14161c" metalness={0.55} roughness={0.42} />
          </mesh>
          {/* halo */}
          <mesh position={[0, 0, 0.1]}>
            <planeGeometry args={[2.5, 2.5]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              map={shared.glow}
              opacity={0.12}
              ref={haloMat}
              toneMapped={false}
            />
          </mesh>
          {/* outer ring */}
          <mesh position={[0, 0, 0.29]}>
            <torusGeometry args={[0.27, 0.05, 16, 48]} />
            <meshBasicMaterial color={ACCENT_HOT} ref={ringMat} toneMapped={false} />
          </mesh>
          {/* lens */}
          <mesh position={[0, 0, 0.3]}>
            <circleGeometry args={[0.24, 40]} />
            <meshBasicMaterial map={shared.lens} opacity={0.3} ref={lensMat} toneMapped={false} transparent />
          </mesh>
          {/* sensor eyes */}
          {[-0.44, 0.44].map((ex) => (
            <mesh key={ex} position={[ex, 0.14, 0.28]}>
              <circleGeometry args={[0.045, 16]} />
              <meshBasicMaterial color={ACCENT_HOT} opacity={0.5} toneMapped={false} transparent />
            </mesh>
          ))}
          {/* lamp cluster */}
          {[-0.14, 0, 0.14].map((lx, i) => (
            <mesh key={lx} position={[lx, -0.48, 0.16]}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshBasicMaterial
                color={ACCENT_HOT}
                ref={(m) => {
                  if (m) lampMats.current[i] = m;
                }}
                toneMapped={false}
                transparent
              />
            </mesh>
          ))}
          {/* sonar rings */}
          {[0, 1, 2].map((k) => (
            <mesh
              key={k}
              position={[0, 0, 0.32]}
              ref={(m) => {
                if (m) sonars.current[k] = m;
              }}
            >
              <ringGeometry args={[0.3, 0.335, 48]} />
              <meshBasicMaterial color={ACCENT_HOT} opacity={0} toneMapped={false} transparent />
            </mesh>
          ))}
        </group>

        {/* ------------------------------------------------------- signal sign */}
        <group position={[0, 5.9, 0.06]} scale={compact ? 0.85 : 1}>
          <mesh>
            <boxGeometry args={[3.6, 0.1, 0.16]} />
            <meshStandardMaterial color={steelDark} metalness={0.4} roughness={0.6} />
          </mesh>
          {[-1.1, 1.1].map((wx) => (
            <mesh key={wx} position={[wx, -0.24, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 0.48, 8]} />
              <meshStandardMaterial color={bolt} metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, -0.68, 0]}>
            <planeGeometry args={[3.4, 0.78]} />
            <meshBasicMaterial map={textures.sign} side={THREE.DoubleSide} toneMapped={false} transparent />
          </mesh>
        </group>

        {/* --------------------------------------------------------- ID plate */}
        <mesh position={[-1.05, 2.78, 0.26]}>
          <planeGeometry args={[0.62, 0.93]} />
          <meshBasicMaterial map={textures.plate} toneMapped={false} transparent />
        </mesh>

        {/* --------------------------------------------------- junction boxes */}
        <mesh position={[-1.05, 1.52, 0.32]}>
          <boxGeometry args={[0.42, 0.54, 0.24]} />
          <meshStandardMaterial color={steelDark} metalness={0.45} roughness={0.5} />
        </mesh>
        <mesh position={[-1.05, 1.58, 0.445]}>
          <planeGeometry args={[0.26, 0.2]} />
          <meshBasicMaterial color={ACCENT} opacity={phase === "scan" ? 0.9 : 0.4} toneMapped={false} transparent />
        </mesh>
        <mesh position={[1.05, 1.3, 0.32]}>
          <boxGeometry args={[0.36, 0.42, 0.22]} />
          <meshStandardMaterial color={steelDark} metalness={0.45} roughness={0.5} />
        </mesh>
        {/* conduit down the outer post */}
        <mesh position={[1.32, 2.4, 0.1]}>
          <boxGeometry args={[0.08, 2.2, 0.08]} />
          <meshStandardMaterial color={steelDark} metalness={0.4} roughness={0.6} />
        </mesh>

        {/* --------------------------------------------------------- floor pool */}
        <mesh position={[0, 0.575, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.9, 48]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={ACCENT_HOT}
            depthWrite={false}
            map={shared.glow}
            opacity={0.16}
            ref={poolMat}
            toneMapped={false}
          />
        </mesh>

        {/* ------------------------------------------------------- scan beam */}
        <group position={[0, 0, 0.34]} ref={beam} visible={false}>
          <mesh position={[0, 1.9, 0]}>
            <planeGeometry args={[0.09, 2.7]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color={ACCENT_HOT}
              depthWrite={false}
              opacity={0}
              ref={beamCore}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[-0.16, 1.9, -0.02]}>
            <planeGeometry args={[0.02, 2.7]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color="#ffffff"
              depthWrite={false}
              opacity={0}
              ref={beamEdgeL}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0.16, 1.9, -0.02]}>
            <planeGeometry args={[0.02, 2.7]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color="#ffffff"
              depthWrite={false}
              opacity={0}
              ref={beamEdgeR}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 2.9, 0.06]} ref={beamSpot}>
            <planeGeometry args={[0.7, 0.07]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color="#fff1d6"
              depthWrite={false}
              opacity={0}
              ref={beamSpotMat}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>

      {/* volumetric scanner light */}
      <primitive object={spotTarget} position={[0, 0.6, 0]} />
      <SpotLight
        angle={0.42}
        attenuation={7}
        anglePower={5}
        color="#ffb24d"
        decay={1.4}
        distance={15}
        intensity={1.2}
        opacity={coneOpacity}
        penumbra={0.75}
        position={[0, 5.7, 1.0]}
        ref={spot}
        target={spotTarget}
      />
    </group>
  );
}
