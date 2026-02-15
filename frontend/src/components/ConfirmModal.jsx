import Modal from './Modal';

const ConfirmModal = ({
  isOpen,
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const confirmColors = {
    danger: { background: 'var(--error, #ef5350)', color: 'white' },
    warning: { background: 'var(--accent, #d4a574)', color: 'var(--primary-dark, #1a1a2e)' },
    default: { background: 'var(--accent, #d4a574)', color: 'var(--primary-dark, #1a1a2e)' },
  };

  const colors = confirmColors[variant] || confirmColors.default;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      variant={variant}
      size="small"
      showClose={false}
      closeOnOverlay={true}
    >
      <Modal.Body>
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message}</p>
      </Modal.Body>
      <Modal.Actions>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 24px',
            background: 'transparent',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
            color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-sm, 6px)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: '10px 24px',
            background: colors.background,
            color: colors.color,
            border: 'none',
            borderRadius: 'var(--radius-sm, 6px)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.95rem',
          }}
        >
          {confirmText}
        </button>
      </Modal.Actions>
    </Modal>
  );
};

export default ConfirmModal;
