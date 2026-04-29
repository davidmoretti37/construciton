"use client";

import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import RowActions from "@/components/ui/RowActions";
import FileUpload from "@/components/ui/FileUpload";
import type { ProjectDocument } from "@/services/projectDetail";

interface Props {
  documents: ProjectDocument[];
  projectId: string;
}

const columns: Column<ProjectDocument>[] = [
  {
    key: "name",
    header: "Name",
    render: (d) => (
      <span className="text-[14px] font-medium text-[#1d1d1f] truncate">
        {d.file_name}
      </span>
    ),
  },
  {
    key: "type",
    header: "Type",
    render: (d) => (
      <span className="inline-flex items-center h-5 px-2 rounded-md bg-[#f5f5f7] text-[#6e6e73] text-[11px] font-mono uppercase">
        {d.file_type || "file"}
      </span>
    ),
  },
  {
    key: "uploaded",
    header: "Uploaded",
    align: "right",
    render: (d) => (
      <span className="text-[12px] text-[#86868b] font-mono tabular-nums">
        {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>
    ),
  },
  {
    key: "actions",
    header: "",
    width: "60px",
    align: "right",
    render: () => (
      <RowActions
        items={[
          { label: "Download", disabled: true },
          { label: "Replace", disabled: true },
          { separator: true },
          { label: "Delete", danger: true, disabled: true },
        ]}
      />
    ),
  },
];

export default function ProjectDocuments({ documents, projectId }: Props) {
  return (
    <div className="space-y-6">
      <FileUpload projectId={projectId} />

      {documents.length === 0 ? (
        <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
          <EmptyState
            icon="file"
            title="No documents yet"
            description="Drop contract PDFs, plans, or photos to keep everything in one place."
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          rowKey={(d) => d.id}
          density="compact"
        />
      )}
    </div>
  );
}
