export default function Modal({ children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose }) {
  return (
    <div className="modal-header">
      <h3>{title}</h3>
      <button className="modal-close" onClick={onClose}>✕</button>
    </div>
  );
}

export function ModalBody({ children }) {
  return <div className="modal-body">{children}</div>;
}

export function ModalFooter({ onClose, onSave, saveLabel = "💾 บันทึก", disabled = false }) {
  return (
    <div className="modal-footer">
      <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" onClick={onSave} disabled={disabled}>{saveLabel}</button>
    </div>
  );
}
