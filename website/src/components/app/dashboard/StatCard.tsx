interface Props {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}

const colorMap: Record<string, string> = {
  green: "text-emerald-500",
  red: "text-red-500",
  blue: "text-[#1E40AF]",
  gray: "text-gray-900",
};

const dotMap: Record<string, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  blue: "bg-[#1E40AF]",
  gray: "bg-gray-400",
};

export default function StatCard({ label, value, color = "gray", sub }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dotMap[color] || dotMap.gray}`} />
        <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={`text-[28px] font-bold leading-tight ${colorMap[color] || colorMap.gray}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
