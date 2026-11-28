/**
 * 4 Unified Spring Physics Presets (Strict Motion Consistency — 60–120fps)
 * F = -k * x - c * v via motion/react
 */
export const SPRINGS = {
  /** Buttons, switches, caption controls, micro-feedback */
  snappy: { type: "spring" as const, stiffness: 450, damping: 32 },
  /** Modals, command palette, context menus, popovers */
  smooth: { type: "spring" as const, stiffness: 300, damping: 26 },
  /** Side panels, detail drawer, large card entrances */
  gentle: { type: "spring" as const, stiffness: 120, damping: 20 },
  /** Elastic drag release / playful bounce */
  wobbly: { type: "spring" as const, stiffness: 200, damping: 10 },
} as const;
