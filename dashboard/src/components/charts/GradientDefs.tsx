interface GradientDefProps {
  id: string;
  color: string;
  opacity?: [number, number];
}

export function GradientDef({ id, color, opacity = [0.8, 0.1] }: GradientDefProps) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={opacity[0]} />
      <stop offset="100%" stopColor={color} stopOpacity={opacity[1]} />
    </linearGradient>
  );
}

export function StrategyGradients() {
  return (
    <>
      <GradientDef id="grad-full-context" color="#3b82f6" />
      <GradientDef id="grad-window-6" color="#f59e0b" />
      <GradientDef id="grad-window-10" color="#d97706" />
      <GradientDef id="grad-rlm" color="#10b981" />
      <GradientDef id="grad-summarize" color="#06b6d4" />
      <GradientDef id="grad-structured" color="#84cc16" />
      <GradientDef id="grad-correction-aware" color="#8b5cf6" />
      <GradientDef id="grad-hybrid" color="#ec4899" />
    </>
  );
}
