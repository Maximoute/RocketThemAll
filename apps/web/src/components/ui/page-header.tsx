import type { ReactNode } from "react";

type Props = { title: string; subtitle?: string; right?: ReactNode };

export default function PageHeader({ title, subtitle, right }: Props) {
  return (
    <header className="rta-page-header flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div className="rta-page-header__copy">
        <span className="rta-page-header__eyebrow">Rocket Them All</span>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="text-rta-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </header>
  );
}
