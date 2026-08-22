'use client';

interface ErrorMessageProps {
  title?: string;
  message: string;
  reasons?: string[];
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorMessage({
  title = 'Unable to complete operation',
  message,
  reasons,
  onRetry,
  onDismiss
}: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div className="errorAlert" role="alert">
      <div className="errorIcon">⚠️</div>
      <div className="errorContent">
        <h4 className="errorTitle">{title}</h4>
        <p className="errorMainText">{message}</p>

        {reasons && reasons.length > 0 && (
          <div className="errorReasonsBox">
            <span className="reasonsLabel">Possible reasons:</span>
            <ul className="reasonsList">
              {reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="errorActions">
          {onRetry && (
            <button type="button" className="button buttonSmall buttonPrimary" onClick={onRetry}>
              🔄 Try Again
            </button>
          )}
          {onDismiss && (
            <button type="button" className="button buttonSmall buttonGhost" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
