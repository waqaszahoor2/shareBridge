'use client';

import { fileCategory, formatBytes } from '@/lib/client/files';
import type { FileMeta } from '@/lib/types';

interface FileMetadataProps {
  files: { meta: FileMeta }[] | FileMeta[];
  totalBytes: number;
  sendMode?: 'files' | 'text';
}

export default function FileMetadata({ files, totalBytes, sendMode }: FileMetadataProps) {
  const list = files.map((item) => ('meta' in item ? item.meta : item));
  const isTextMode = sendMode === 'text' || (list.length > 0 && list.every((f) => f.name.endsWith('.txt')));
  const itemLabel = isTextMode ? (list.length === 1 ? 'Item' : 'Items') : (list.length === 1 ? 'File' : 'Files');

  return (
    <div className="fileMetadataBar">
      <div className="metaBadge">
        <strong>{list.length}</strong> {itemLabel} selected
      </div>
      <div className="metaTotal">
        Total size: <strong>{formatBytes(totalBytes)}</strong>
      </div>
      <div className="metaTypes">
        {Array.from(new Set(list.map((f) => fileCategory(f.name)))).map((cat) => (
          <span key={cat} className="typeChip">
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
