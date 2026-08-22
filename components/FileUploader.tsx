'use client';

import { ChangeEvent, useRef } from 'react';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  buttonText?: string;
}

export default function FileUploader({
  onFilesSelected,
  disabled = false,
  buttonText = 'Select Files'
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((f) => f.size > 0);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    event.target.value = '';
  }

  return (
    <div className="fileUploader">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hiddenInput"
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        className="button buttonSecondary"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
      >
        <span>📁</span> {buttonText}
      </button>
    </div>
  );
}
