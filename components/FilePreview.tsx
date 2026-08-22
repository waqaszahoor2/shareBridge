'use client';

import { fileCategory, formatBytes } from '@/lib/client/files';
import type { FileMeta } from '@/lib/types';

interface FilePreviewProps {
  files: { meta: FileMeta }[] | FileMeta[];
  onRemove?: (id: string) => void;
  readOnly?: boolean;
}

export default function FilePreview({ files, onRemove, readOnly = false }: FilePreviewProps) {
  const items = files.map((item) => ('meta' in item ? item.meta : item));

  if (!items.length) return null;

  return (
    <ul className="fileList" aria-label="Selected file list">
      {items.map((file) => {
        const category = fileCategory(file.name);
        return (
          <li key={file.id} className="fileRow">
            <div className="fileRowIcon">{category.slice(0, 3).toUpperCase()}</div>
            <div className="fileRowMain">
              <span className="fileName">{file.name}</span>
              <div className="fileRowMeta">
                <span className="fileSize">{formatBytes(file.size)}</span>
                <span className="fileType">{file.type || category}</span>
              </div>
            </div>
            {!readOnly && onRemove && (
              <button
                type="button"
                className="removeButton"
                onClick={() => onRemove(file.id)}
                title="Remove file"
                aria-label={`Remove ${file.name}`}
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
