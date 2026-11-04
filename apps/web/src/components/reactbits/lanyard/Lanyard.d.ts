import type { CSSProperties, ComponentType } from "react";
export interface LanyardProps {
  frontImage?: string; backImage?: string; strapImage?: string;
  imageFit?: "cover" | "contain"; cardColor?: string;
  orientation?: "portrait" | "landscape";
  finish?: "glossy" | "matte" | "holographic" | "metallic";
  cornerRadius?: number; size?: number; anchor?: "left" | "center" | "right";
  strapLength?: number; strapColor?: string; strapWidth?: number;
  metal?: "graphite" | "silver" | "gold"; gravity?: number; damping?: number;
  elasticity?: number; breeze?: number; interactive?: boolean; intro?: boolean;
  className?: string; style?: CSSProperties;
  onReady?: () => void; onError?: () => void; onFlip?: (back: boolean) => void;
  flipSignal?: number;
}
declare const Lanyard: ComponentType<LanyardProps>;
export default Lanyard;
