'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export default function FileDropzone({ onFilesSelected, disabled = false, maxFiles = 20 }: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const droppedFiles = Array.from(e.dataTransfer.files || []).filter((f) => f.size > 0);
    if (droppedFiles.length > 0) {
      onFilesSelected(droppedFiles.slice(0, maxFiles));
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const selected = Array.from(e.target.files || []).filter((f) => f.size > 0);
    if (selected.length > 0) {
      onFilesSelected(selected.slice(0, maxFiles));
    }
    e.target.value = '';
  }

  return (
    <div
      className={`dropzone ${isDragOver ? 'dragOver' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="region"
      aria-label="File dropzone"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hiddenInput"
        onChange={handleChange}
        disabled={disabled}
        aria-hidden="true"
      />
      <div className="dropzoneIcon">📂</div>
      <h3>Drag &amp; drop your files here</h3>
      <p className="dropzoneSub">or click to browse files (PDF, ZIP, CSV, XLSX, PPTX, etc.)</p>
      <div className="dropzoneMeta">
        <span>Up to {maxFiles} files</span>
        <span>·</span>
        <span>500 MB+ ready</span>
      </div>
    </div>
  );
}
