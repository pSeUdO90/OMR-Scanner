export function BulkBar({
  count,
  onDelete,
}: {
  count: number;
  onDelete: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar">
      <span>{count} selected</span>
      <button type="button" className="btn-delete" onClick={onDelete}>
        Delete selected
      </button>
    </div>
  );
}

export function SelectAllCell({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <th className="check-col">
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate && !checked);
        }}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Select all"
      />
    </th>
  );
}

export function SelectCell({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <td className="check-col">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </td>
  );
}

export function toggleId(set: Set<number>, id: number, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function setAll(ids: number[], on: boolean) {
  return on ? new Set(ids) : new Set<number>();
}
