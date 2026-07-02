import React, { useState } from 'react';
import type { AttachedFile } from '../store/overlayStore';
import { File, Code, Image as ImageIcon, FileText, Sheet, X } from 'lucide-react';

interface AttachmentChipProps {
  file: AttachedFile;
  onRemove?: () => void;
  variant: 'pending' | 'sent';
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getIcon = (ext: string, isImage: boolean) => {
  if (isImage) return <ImageIcon size={14} />;
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt'].includes(ext)) {
    return <Code size={14} />;
  }
  if (['txt', 'md', 'log'].includes(ext)) return <FileText size={14} />;
  if (['pdf'].includes(ext)) return <FileText size={14} />;
  if (['doc', 'docx'].includes(ext)) return <FileText size={14} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <Sheet size={14} />;
  return <File size={14} />;
};

const getKind = (ext: string, isImage: boolean): string => {
  if (isImage) return 'Image preview';
  if (['pdf'].includes(ext)) return 'PDF document';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'Document';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Spreadsheet';
  if (['ppt', 'pptx'].includes(ext)) return 'Presentation';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'html', 'css', 'scss', 'less', 'sql', 'graphql'].includes(ext)) return 'Code file';
  if (['txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'toml'].includes(ext)) return 'Text file';
  return ext ? `${ext.toUpperCase()} file` : 'File';
};

export const AttachmentChip: React.FC<AttachmentChipProps> = ({ file, onRemove, variant }) => {
  const isPending = variant === 'pending';
  const [imgError, setImgError] = useState(false);
  const imgSrc = `local-file://preview?path=${encodeURIComponent(file.path)}`;
  const meta = file.tooBig ? 'Path only' : formatSize(file.size);

  return (
    <div className={`attachment-chip attachment-chip--${variant} ${file.isImage ? 'attachment-chip--image' : 'attachment-chip--file'}`}>
      {file.isImage && !imgError ? (
        <div className="attachment-chip__preview attachment-chip__preview--image">
          <img
            src={imgSrc}
            alt={file.name}
            className="attachment-chip__thumbnail"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="attachment-chip__preview attachment-chip__preview--file">
          <div className="attachment-chip__icon">
            {getIcon(file.ext, file.isImage)}
          </div>
        </div>
      )}

      {/* Image chips: preview only, no text. File chips: full info */}
      {!file.isImage && (
        <div className="attachment-chip__info">
          <span className="attachment-chip__name">{file.name}</span>
          <span className="attachment-chip__meta">
            <span>{getKind(file.ext, file.isImage)}</span>
            <span aria-hidden="true">•</span>
            <span>{meta}</span>
          </span>
        </div>
      )}

      {isPending && onRemove && (
        <button className="attachment-chip__remove" onClick={onRemove} title="Remove attachment">
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};