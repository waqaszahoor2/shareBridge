'use client';

import { fileCategory, formatBytes } from '@/lib/client/files';
import type { FileMeta } from '@/lib/types';

interface FileMetadataProps {
  files: { meta: FileMeta }[] | FileMeta[];
  totalBytes: number;
}

export default function FileMetadata({ files, totalBytes }: FileMetadataProps) {
  const list = files.map((item) => ('meta' in item ? item.meta : item));

  return (
    <div className="fileMetadataBar">
      <div className="metaBadge">
        <strong>{list.length}</strong> {list.length === 1 ? 'File' : 'Files'} selected
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
