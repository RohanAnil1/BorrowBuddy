"use client";

/* eslint-disable react-hooks/immutability -- three.js textures are imperative
   engine state: canvases are repainted and .needsUpdate flipped in effects by
   design; the react-compiler immutability rule does not map to WebGL code. */

import { RoundedBox, Sparkles } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { paintParcelBack, paintParcelFront } from "./paint";
import type { CrateDef } from "./timeline";

export type ParcelHandle = {
  group: THREE.Group;
  bob: THREE.Group;
  flip: THREE.Group;
  flash: THREE.MeshBasicMaterial;
  scanLine: THREE.Mesh;
  frontTexture: THREE.CanvasTexture;
  backTexture: THREE.CanvasTexture;
};

export const PARCEL_HEIGHT = 2.05;
export const PARCEL_RIDE_Y = 0.55 + PARCEL_HEIGHT / 2;

export function Parcel3D({
  crate,
  stamps,
  scanning,
  reduced,
  onReady,
}: {
  crate: CrateDef;
  stamps: number;
  scanning: boolean;
  reduced: boolean;
  onReady: (handle: ParcelHandle) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const flip = useRef<THREE.Group>(null);
  const flash = useRef<THREE.MeshBasicMaterial>(null);
  const scanLine = useRef<THREE.Mesh>(null);

  const facades = useMemo(() => {
    const frontCanvas = document.createElement("canvas");
    frontCanvas.width = 512;
    frontCanvas.height = 720;
    paintParcelBack(document.createElement("canvas"), crate);
    const backCanvas = document.createElement("canvas");
    backCanvas.width = 512;
    backCanvas.height = 720;
    paintParcelBack(backCanvas, crate);
    const frontTexture = new THREE.CanvasTexture(frontCanvas);
    frontTexture.colorSpace = THREE.SRGBColorSpace;
    frontTexture.anisotropy = 4;
    const backTexture = new THREE.CanvasTexture(backCanvas);
    backTexture.colorSpace = THREE.SRGBColorSpace;
    backTexture.anisotropy = 4;
    return { frontCanvas, backCanvas, frontTexture, backTexture };
  }, [crate]);

  // label repaint — on crate/stamp change, on first mount and after fonts land
  useEffect(() => {
    let alive = true;
    const repaint = () => {
      void paintParcelFront(facades.frontCanvas, crate, stamps).then(() => {
        if (!alive) return;
        facades.frontTexture.needsUpdate = true;
        invalidate();
      });
      paintParcelBack(facades.backCanvas, crate);
      facades.backTexture.needsUpdate = true;
      invalidate();
    };
    repaint();
    document.fonts.ready.then(() => {
      if (alive) repaint();
    });
    return () => {
      alive = false;
    };
  }, [crate, facades, invalidate, stamps]);

  useEffect(() => {
    if (!group.current || !bob.current || !flip.current || !flash.current || !scanLine.current) return;
    onReady({
      group: group.current,
      bob: bob.current,
      flip: flip.current,
      flash: flash.current,
      scanLine: scanLine.current,
      frontTexture: facades.frontTexture,
      backTexture: facades.backTexture,
    });
  }, [facades, onReady]);

  return (
    <group ref={group} position={[0, PARCEL_RIDE_Y, 0]}>
      <group ref={bob}>
        <group ref={flip}>
          {/* cardboard body */}
          <RoundedBox args={[1.5, PARCEL_HEIGHT, 1.15]} radius={0.05} smoothness={6}>
            <meshStandardMaterial color="#8a6a44" metalness={0.05} roughness={0.85} />
          </RoundedBox>
          {/* paper label — front */}
          <mesh position={[0, 0.01, 0.577]}>
            <planeGeometry args={[1.35, 1.9]} />
            <meshStandardMaterial
              emissive="#ffffff"
              emissiveIntensity={0.16}
              emissiveMap={facades.frontTexture}
              map={facades.frontTexture}
              metalness={0}
              roughness={0.9}
            />
          </mesh>
          {/* custody back */}
          <mesh position={[0, 0.01, -0.577]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[1.35, 1.9]} />
            <meshStandardMaterial
              emissive="#ffffff"
              emissiveIntensity={0.22}
              emissiveMap={facades.backTexture}
              map={facades.backTexture}
              metalness={0}
              roughness={0.7}
            />
          </mesh>
          {/* scan wash + scan line */}
          <mesh position={[0, 0.01, 0.585]}>
            <planeGeometry args={[1.36, 1.92]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color="#ffb24d"
              depthWrite={false}
              opacity={0}
              ref={flash}
              toneMapped={false}
              transparent
            />
          </mesh>
          <mesh position={[0, 0.9, 0.6]} ref={scanLine} visible={false}>
            <planeGeometry args={[1.4, 0.05]} />
            <meshBasicMaterial blending={THREE.AdditiveBlending} color="#fff1d6" depthWrite={false} toneMapped={false} transparent />
          </mesh>
        </group>
        {!reduced && (
          <Sparkles
            color="#ffcf7a"
            count={26}
            opacity={scanning ? 0.9 : 0}
            scale={[2.6, 2.9, 2]}
            size={3.4}
            speed={scanning ? 0.7 : 0}
          />
        )}
      </group>
    </group>
  );
}
