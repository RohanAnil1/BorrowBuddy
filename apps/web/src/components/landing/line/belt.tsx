"use client";

/* eslint-disable react-hooks/immutability -- texture offset is imperative
   three.js engine state advanced inside useFrame by design. */

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { paintSlats } from "./paint";

/** Scrolling slat conveyor. Slat period is 0.6 world units; the texture offset
 *  advances with the parcel speed so belt and cargo move together. */
export function Belt({ span, speed, reduced }: { span: number; speed: number; reduced: boolean }) {
  const length = span + 12;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    paintSlats(canvas);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.repeat.set(length / 0.6, 1);
    return map;
  }, [length]);

  useFrame((_, rawDelta) => {
    if (reduced) return;
    texture.offset.x -= (speed / 0.6) * Math.min(rawDelta, 0.05);
  });

  const legs = useMemo(() => {
    const positions: number[] = [];
    const half = length / 2;
    for (let x = -half + 2; x <= half - 2; x += 4) positions.push(x);
    return positions;
  }, [length]);

  return (
    <group>
      {/* slat surface */}
      <mesh position={[0, 0.56, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, 1.8]} />
        <meshStandardMaterial map={texture} metalness={0.35} roughness={0.62} />
      </mesh>
      {/* body */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[length, 0.52, 1.8]} />
        <meshStandardMaterial color="#191510" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* rails */}
      {[-0.92, 0.92].map((z) => (
        <mesh key={z} position={[0, 0.62, z]}>
          <boxGeometry args={[length, 0.09, 0.09]} />
          <meshStandardMaterial color="#3c4046" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* legs */}
      {legs.map((x) => (
        <mesh key={x} position={[x, 0.18, 0]}>
          <boxGeometry args={[0.22, 0.36, 1.2]} />
          <meshStandardMaterial color="#12100c" metalness={0.35} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
