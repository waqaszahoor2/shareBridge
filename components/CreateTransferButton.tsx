'use client';

interface CreateTransferButtonProps {
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  loading?: boolean;
  fileCount: number;
}

export default function CreateTransferButton({
  onClick,
  disabled = false,
  loading = false,
  fileCount
}: CreateTransferButtonProps) {
  const isButtonDisabled = disabled || loading || fileCount === 0;

  return (
    <button
      type="button"
      className="button buttonPrimary createTransferBtn"
      disabled={isButtonDisabled}
      onClick={onClick}
    >
      {loading ? (
        <>
          <span className="spinner" aria-hidden="true" /> Generating Code...
        </>
      ) : (
        <>
          <span>⚡</span> Generate Transfer Code ({fileCount})
        </>
      )}
    </button>
  );
}
