import React, { useRef } from 'react';
import { Plus, Image as ImageIcon, Camera, ClipboardPaste } from 'lucide-react';
import { Popover } from '../ui/Popover';

interface AttachMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAttachFile: () => void;
  onScreenshot: () => void;
  onClipboardPaste: () => void;
}

export const AttachMenu: React.FC<AttachMenuProps> = ({ 
  isOpen, 
  onToggle, 
  onClose, 
  onAttachFile, 
  onScreenshot,
  onClipboardPaste
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="attach-container" style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        className={`attach-toggle-btn${isOpen ? ' active' : ''}`}
        onClick={onToggle}
        title="Attach file, screenshot, or clipboard"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
      
      <Popover
        isOpen={isOpen}
        onClose={onClose}
        triggerRef={triggerRef}
        className="attach-menu-popover"
        style={{ left: 0, bottom: '100%', marginBottom: 8 }}
      >
        <div className="attach-menu">
          <button className="attach-menu-item" onClick={onAttachFile}>
            <span className="attach-menu-icon"><ImageIcon size={16} /></span>
            <span className="attach-menu-copy">
              <strong>Choose file</strong>
              <small>Images, documents, code</small>
            </span>
          </button>
          <button className="attach-menu-item" onClick={onClipboardPaste}>
            <span className="attach-menu-icon"><ClipboardPaste size={16} /></span>
            <span className="attach-menu-copy">
              <strong>Paste clipboard</strong>
              <small>Attach copied text as context</small>
            </span>
          </button>
          <button className="attach-menu-item" onClick={onScreenshot}>
            <span className="attach-menu-icon"><Camera size={16} /></span>
            <span className="attach-menu-copy">
              <strong>Add screenshot</strong>
              <small>Capture the current screen</small>
            </span>
          </button>
        </div>
      </Popover>
    </div>
  );
};
