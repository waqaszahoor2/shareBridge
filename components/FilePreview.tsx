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
        const iconSymbol =
          category.includes('Image') ? '🖼️' :
          category.includes('PowerPoint') || category.includes('Presentation') ? '📊' :
          category === 'JSON' || category === 'XML' || category === 'YAML' ? '📋' :
          category === 'PDF' ? '📄' :
          category === 'CSV' || category.includes('Excel') || category.includes('Spreadsheet') ? '📈' :
          category.includes('Archive') ? '📦' :
          category === 'Video' ? '🎬' :
          category === 'Audio' ? '🎵' :
          category.includes('Code') || category.includes('Script') || category.includes('React') || category === 'TypeScript' || category === 'JavaScript' ? '💻' : '📁';

        return (
          <li key={file.id} className="fileRow">
            <div className="fileRowIcon" title={category}>{iconSymbol}</div>
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
