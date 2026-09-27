"use client";

/* eslint-disable react-hooks/immutability -- three.js imperative animation:
   pose/drag refs are engine state mutated inside useFrame and pointer
   handlers by design; the react-compiler immutability rule does not map
   to WebGL frame-loop code. */

import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  RoundedBox,
  Sparkles,
} from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  loadBuLogo,
  paintBrushedMetal,
  paintCargoScreen,
  paintContactShadow,
  paintGrille,
  SCREEN_H,
  SCREEN_W,
} from "./screen-art";

const BOOT_DELAY = 1.35;
const BOOT_DUR = 1.15;

type Drag = { active: boolean; lastX: number; lastY: number; velRy: number };

type Pose = {
  rest: { ry: number; rx: number };
  target: { ry: number; rx: number };
  cur: { ry: number; rx: number };
  glow: number;
};

export default function CargoDeviceCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const ledRef = useRef<THREE.MeshBasicMaterial>(null);
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState(true);

  const { texture, repaint, dispose } = useMemo(() => createScreenTexture(), []);
  // roughness/bump maps are data — linear color space, not sRGB
  const brushed = useMemo(() => createTextureFrom(paintBrushedMetal, 2, 2, false), []);
  const grille = useMemo(() => createTextureFrom(paintGrille), []);
  const shadow = useMemo(() => createTextureFrom(paintContactShadow), []);

  // Repaint once web fonts (device type) and the Bennett shield have loaded.
  useEffect(() => {
    let alive = true;
    Promise.all([document.fonts.ready, loadBuLogo()]).then(() => {
      if (alive) repaint();
    });
    return () => {
      alive = false;
    };
  }, [repaint]);

  // Pause the render loop when the device is scrolled away.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(
    () => () => {
      dispose();
      brushed.dispose();
      grille.dispose();
      shadow.dispose();
    },
    [dispose, brushed, grille, shadow],
  );

  const pose = useRef<Pose>({
    rest: { ry: 0.16, rx: -0.05 },
    target: { ry: 0.16, rx: -0.05 },
    cur: { ry: 0.16, rx: -0.05 },
    glow: 0.4,
  });
  const drag = useRef<Drag>({ active: false, lastX: 0, lastY: 0, velRy: 0 });

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      drag.current = { active: true, lastX: event.clientX, lastY: event.clientY, velRy: 0 };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const d = drag.current;
      const p = pose.current;
      if (d.active) {
        const dx = event.clientX - d.lastX;
        const dy = event.clientY - d.lastY;
        d.lastX = event.clientX;
        d.lastY = event.clientY;
        const step = dx * 0.006;
        p.rest.ry = THREE.MathUtils.clamp(p.rest.ry + step, -0.62, 0.62);
        p.rest.rx = THREE.MathUtils.clamp(p.rest.rx + dy * 0.004, -0.3, 0.2);
        d.velRy = step;
        p.target.ry = p.rest.ry;
        p.target.rx = p.rest.rx;
      } else {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        p.target.ry = p.rest.ry + nx * 0.16;
        p.target.rx = p.rest.rx - ny * 0.09;
      }
    },
    onPointerUp: (event: React.PointerEvent) => {
      drag.current.active = false;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onPointerLeave: () => {
      drag.current.active = false;
      setDragging(false);
    },
  };

  return (
    <div
      className="absolute inset-0 select-none"
      onPointerDown={handlers.onPointerDown}
      onPointerLeave={handlers.onPointerLeave}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      ref={containerRef}
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "pan-y" }}
    >
      <Canvas
        camera={{ fov: 30, position: [0, 0.1, 7.4] }}
        dpr={[1, 1.75]}
        frameloop={visible ? "always" : "never"}
        gl={{ alpha: true, antialias: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <DeviceRig
          brushed={brushed}
          drag={drag}
          groupRef={groupRef}
          grille={grille}
          ledRef={ledRef}
          matRef={matRef}
          pose={pose}
          shadow={shadow}
          texture={texture}
        />
      </Canvas>
    </div>
  );
}

function DeviceRig({
  brushed,
  drag,
  groupRef,
  grille,
  ledRef,
  matRef,
  pose,
  shadow,
  texture,
}: {
  brushed: THREE.Texture;
  drag: React.RefObject<Drag>;
  groupRef: React.RefObject<THREE.Group | null>;
  grille: THREE.Texture;
  ledRef: React.RefObject<THREE.MeshBasicMaterial | null>;
  matRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  pose: React.RefObject<Pose>;
  shadow: THREE.Texture;
  texture: THREE.Texture;
}) {
  useFrame((st, rawDt) => {
    const g = groupRef.current;
    const mat = matRef.current;
    const led = ledRef.current;
    if (!g || !mat || !led) return;

    const dt = Math.min(rawDt, 0.05);
    const t = st.clock.elapsedTime;
    const p = pose.current;
    const d = drag.current;

    // drag inertia after release
    if (!d.active && Math.abs(d.velRy) > 0.0004) {
      p.rest.ry = THREE.MathUtils.clamp(p.rest.ry + d.velRy, -0.62, 0.62);
      d.velRy *= Math.exp(-dt * 3.4);
    }

    // idle sway when untouched
    if (!d.active) {
      p.target.ry = p.rest.ry + Math.sin(t * 0.55) * 0.07;
      p.target.rx = p.rest.rx + Math.cos(t * 0.42) * 0.028;
    }

    // damped follow
    p.cur.ry += (p.target.ry - p.cur.ry) * Math.min(1, dt * 5.5);
    p.cur.rx += (p.target.rx - p.cur.rx) * Math.min(1, dt * 5.5);

    // boot entry — settle from the right with a bounce
    const bootT = Math.min(Math.max((t - BOOT_DELAY) / BOOT_DUR, 0), 1);
    const e = easeOutCubic(bootT);
    const s = easeOutBack(bootT);

    g.rotation.y = THREE.MathUtils.lerp(0.95, p.cur.ry, e);
    g.rotation.x = THREE.MathUtils.lerp(0.42, p.cur.rx, e);
    g.position.x = THREE.MathUtils.lerp(2.7, 0, e);
    g.position.y = THREE.MathUtils.lerp(1.5, Math.sin(t * 0.7) * 0.05, e);
    g.scale.setScalar(THREE.MathUtils.lerp(0.84, 1, Math.min(s, 1.12)));

    // screen boot flicker → steady glow → drag boost
    let intensity: number;
    if (t < BOOT_DELAY) {
      intensity = 0.03;
    } else if (t < BOOT_DELAY + 0.38) {
      intensity = Math.sin((t - BOOT_DELAY) * 85) > 0 ? 2.1 : 0.1;
    } else {
      p.glow += ((d.active ? 1.9 : 1.15) - p.glow) * Math.min(1, dt * 4);
      intensity = p.glow + Math.sin(t * 2.2) * 0.06;
    }
    mat.emissiveIntensity = intensity;

    // LED: double-blink during boot, then steady amber
    if (t < BOOT_DELAY) {
      led.opacity = 0;
    } else if (t < BOOT_DELAY + 0.5) {
      led.opacity = Math.sin((t - BOOT_DELAY) * 55) > 0 ? 1 : 0.1;
    } else {
      led.opacity = 0.85 + Math.sin(t * 3.1) * 0.15;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* body — brushed gunmetal */}
        <RoundedBox args={[2.4, 3.5, 0.4]} radius={0.28} smoothness={10}>
          <meshPhysicalMaterial
            bumpMap={brushed}
            bumpScale={0.0016}
            clearcoat={0.9}
            clearcoatRoughness={0.18}
            color="#c9cdd4"
            envMapIntensity={1.15}
            metalness={0.82}
            roughness={0.34}
            roughnessMap={brushed}
          />
        </RoundedBox>

        {/* dark satin faceplate — proud of the body, reads as the screen module */}
        <RoundedBox args={[2.24, 3.34, 0.07]} position={[0, 0, 0.2]} radius={0.16} smoothness={10}>
          <meshStandardMaterial color="#0b0d12" envMapIntensity={0.6} metalness={0.5} roughness={0.45} />
        </RoundedBox>

        {/* screen — sits on the faceplate */}
        <mesh position={[0, -0.05, 0.242]}>
          <planeGeometry args={[1.9, (1.9 * SCREEN_H) / SCREEN_W]} />
          <meshPhysicalMaterial
            clearcoat={0.55}
            clearcoatRoughness={0.22}
            emissive="#ffffff"
            emissiveIntensity={0.4}
            emissiveMap={texture}
            envMapIntensity={0.25}
            map={texture}
            ref={matRef}
            roughness={0.4}
            toneMapped={false}
          />
        </mesh>

        {/* top ticket slot — recessed into the faceplate */}
        <RoundedBox args={[1.02, 0.17, 0.1]} position={[0, 1.5, 0.2]} radius={0.05} smoothness={6}>
          <meshStandardMaterial color="#05070e" metalness={0.4} roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 1.5, 0.243]}>
          <boxGeometry args={[0.86, 0.03, 0.02]} />
          <meshBasicMaterial color="#000000" />
        </mesh>

        {/* LED status indicator */}
        <mesh position={[0.88, 1.5, 0.235]}>
          <sphereGeometry args={[0.032, 16, 16]} />
          <meshBasicMaterial color="#ff9f00" ref={ledRef} transparent toneMapped={false} />
        </mesh>

        {/* speaker grille strip on the lower bezel */}
        {/* speaker grille strip on the lower faceplate */}
        <mesh position={[0, -1.52, 0.236]}>
          <planeGeometry args={[1.7, 0.2]} />
          <meshBasicMaterial
            depthWrite={false}
            map={grille}
            opacity={0.9}
            transparent
            toneMapped={false}
          />
        </mesh>

        {/* side buttons */}
        <RoundedBox args={[0.1, 0.34, 0.14]} position={[1.23, 0.85, 0]} radius={0.045} smoothness={8}>
          <meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.35} />
        </RoundedBox>
        <RoundedBox args={[0.1, 0.22, 0.14]} position={[1.23, 0.35, 0]} radius={0.045} smoothness={8}>
          <meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.35} />
        </RoundedBox>

        {/* back brand strip */}
        <mesh position={[0, -0.7, -0.201]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.3, 0.22]} />
          <meshBasicMaterial color="#6176c9" />
        </mesh>
      </group>

      {/* soft real contact shadow */}
      <ContactShadows
        blur={2.6}
        far={2.8}
        frames={Infinity}
        opacity={0.6}
        position={[0, -2.12, 0]}
        resolution={512}
        scale={5.6}
      />

      {/* static canvas radial shadow as a base tint under the real one */}
      <mesh position={[0, -2.12, 0.001]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.8, 1.4]} />
        <meshBasicMaterial depthWrite={false} map={shadow} opacity={0.35} transparent />
      </mesh>

      {/* amber dust — subtle sparkles */}
      <Sparkles
        color="#ff9f00"
        count={34}
        opacity={0.4}
        scale={[4.6, 5.2, 2]}
        size={2.2}
        speed={0.35}
      />

      {/* studio environment — lightformers only, no network HDRI */}
      <Environment resolution={256} frames={1}>
        <Lightformer color="#e8ecf5" intensity={3} position={[0, 4, 3]} scale={[8, 3, 1]} />
        <Lightformer
          color="#8fb0ff"
          intensity={1.6}
          position={[-4.5, 0, 2]}
          rotation-y={Math.PI / 3}
          scale={[5, 1.6, 1]}
        />
        <Lightformer
          color="#ff9f00"
          intensity={1.1}
          position={[4.5, -1, 2]}
          rotation-y={-Math.PI / 3}
          scale={[5, 1.6, 1]}
        />
        <Lightformer
          color="#6176c9"
          intensity={0.7}
          position={[0, -3, 3]}
          rotation-x={Math.PI / 3}
          scale={[6, 1, 1]}
        />
      </Environment>
    </>
  );
}

/* ------------------------------- textures -------------------------------- */

function createScreenTexture() {
  const canvas = document.createElement("canvas");
  paintCargoScreen(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    repaint() {
      paintCargoScreen(canvas);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}

function createTextureFrom(
  painter: (canvas: HTMLCanvasElement) => void,
  repeatX = 1,
  repeatY = 1,
  srgb = true,
) {
  const canvas = document.createElement("canvas");
  painter(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function easeOutCubic(x: number): number {
  return x === 1 ? 1 : 1 - Math.pow(1 - x, 3);
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
