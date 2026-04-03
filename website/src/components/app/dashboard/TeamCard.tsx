interface Props {
  workers: number;
  supervisors: number;
  projects: number;
}

export default function TeamCard({ workers, supervisors, projects }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Team</h4>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Workers</span>
          <span className="text-sm font-semibold text-gray-900">{workers}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Supervisors</span>
          <span className="text-sm font-semibold text-gray-900">{supervisors}</span>
        </div>
        <div className="border-t border-gray-100 pt-2.5 flex items-center justify-between">
          <span className="text-sm text-gray-600">Active Projects</span>
          <span className="text-sm font-semibold text-[#1E40AF]">{projects}</span>
        </div>
      </div>
    </div>
  );
}
