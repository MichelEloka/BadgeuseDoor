import { motion } from "framer-motion";

import type { Hinge } from "@/types/floor";

interface DoorGlyphProps {
  angle: number;
  open: boolean;
  hinge: Hinge;
  label: string;
  labelColor?: string;
}

export function DoorGlyph({ angle, open, hinge, label, labelColor = "#334155" }: DoorGlyphProps) {
  const jamb = 36;
  const leaf = 34;
  const leafThickness = 4;
  const openAngle = hinge === "left" ? -85 : 85;

  return (
    <g transform={`rotate(${(angle * 180) / Math.PI})`}>
      <rect x={-jamb / 2} y={-leafThickness / 2} width={jamb} height={leafThickness} fill="#0f172a" rx={2} />
      <motion.rect
        initial={false}
        animate={{ rotate: open ? openAngle : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        x={0}
        y={-leafThickness / 2}
        width={leaf}
        height={leafThickness}
        fill="#22c55e"
        rx={2}
        style={{ transformOrigin: "0px 0px" }}
      />
      <path
        d={`M0 0 A ${leaf} ${leaf} 0 0 ${hinge === "left" ? 1 : 0} ${
          Math.cos(((open ? openAngle : 0) * Math.PI) / 180) * leaf
        } ${Math.sin(((open ? openAngle : 0) * Math.PI) / 180) * leaf}`}
        stroke="#22c55e"
        strokeDasharray="3 4"
        fill="none"
        opacity={0.3}
      />
      <text x={0} y={-10} fontSize={10} textAnchor="middle" fill={labelColor} transform={`rotate(${-(angle * 180) / Math.PI}) translate(0 0)`}>
        {label}
      </text>
    </g>
  );
}
