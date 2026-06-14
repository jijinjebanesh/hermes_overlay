import React, { useState } from 'react';
import type { AttachedFile } from '../store/overlayStore';
import { File, Code, FileType, Image as ImageIcon, FileText, Sheet, X } from 'lucide-react';

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

export const AttachmentChip: React.FC<AttachmentChipProps> = ({ file, onRemove, variant }) => {
  const isPending = variant === 'pending';
  const [imgError, setImgError] = useState(false);
  
  // Create an object URL if there is content, else try file:// path
  // Usually file.path works in Electron if webSecurity allows it, or we use standard protocol
  const imgSrc = `local-file://${file.path.replace(/\\/g, '/')}`;
  
  return (
    <div className={`attachment-chip attachment-chip--${variant}`}>
      <div className="attachment-chip__icon-wrapper">
        {file.isImage && !imgError ? (
          <img 
            src={imgSrc} 
            alt={file.name} 
            className="attachment-chip__thumbnail"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="attachment-chip__icon">
            {getIcon(file.ext, file.isImage)}
          </div>
        )}
      </div>
      
      <div className="attachment-chip__info">
        <span className="attachment-chip__name">{file.name}</span>
        <span className="attachment-chip__size">
          {file.tooBig ? 'Path only (large file)' : formatSize(file.size)}
        </span>
      </div>
      
      {isPending && onRemove && (
        <button className="attachment-chip__remove" onClick={onRemove} title="Remove attachment">
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};