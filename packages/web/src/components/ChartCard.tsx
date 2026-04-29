import type { ReactNode } from "react";

type Props = {
  label: string;
  title: ReactNode;
  subtitle?: string | undefined;
  children: ReactNode;
  caption?: ReactNode | undefined;
  chartRef?: ((el: HTMLDivElement | null) => void) | undefined;
};

export function ChartCard({ label, title, subtitle, children, caption, chartRef }: Props) {
  return (
    <section className="card" ref={chartRef}>
      <div className="label">{label}</div>
      <h2>{title}</h2>
      {subtitle && <div className="chart-subtitle">{subtitle}</div>}
      <div className="chart-svg-wrap">{children}</div>
      {caption && <div className="caption">{caption}</div>}
    </section>
  );
}
