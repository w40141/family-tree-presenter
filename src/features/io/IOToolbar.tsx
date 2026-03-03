type Props = {
  error: string | null;
  onNew: () => void | Promise<void>;
  onImport: (file: File) => void | Promise<void>;
  onExport: () => void;
  onClearLocal: () => void | Promise<void>;
};

export function IOToolbar({ error, onNew, onImport, onExport, onClearLocal }: Props) {
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => onNew()}>New (0スタート)</button>

        <label style={{ display: "inline-block" }}>
          <input
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) Promise.resolve(onImport(f));
              e.currentTarget.value = "";
            }}
          />
          <span style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
            Import (Upload JSON)
          </span>
        </label>

        <button onClick={onExport}>Export (Download JSON)</button>
        <button onClick={() => onClearLocal()} title="IndexedDBの保存も消します">
          Clear local storage
        </button>
      </div>

      {error && (
        <div style={{ background: "#ffe3e3", padding: 10, borderRadius: 6, marginBottom: 12 }}>
          <b>Error:</b> {error}
        </div>
      )}
    </>
  );
}
