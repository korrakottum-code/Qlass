export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
      <span className="toast-icon">{toast.type === "success" ? "✅" : "⚠️"}</span>
      <span>{toast.msg}</span>
    </div>
  );
}
