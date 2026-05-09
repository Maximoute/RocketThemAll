import type { ReactNode } from "react";

type Props = { title: string; subtitle?: string; right?: ReactNode };

export default function PageHeader({ title, subtitle, right }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="text-rta-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
