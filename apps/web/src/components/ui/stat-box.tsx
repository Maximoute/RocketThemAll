type Props = { value: string | number; label: string; color?: string };

export default function StatBox({ value, label, color = "text-rta-success" }: Props) {
  return (
    <div className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
      <div className={`text-xl font-black ${color}`}>{value}</div>
      <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted mt-0.5">{label}</div>
    </div>
  );
}
