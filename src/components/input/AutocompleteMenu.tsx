import React from 'react';

export interface AutocompleteSuggestion {
  name: string;
  isDir: boolean;
  size: number;
}

interface AutocompleteMenuProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export const AutocompleteMenu: React.FC<AutocompleteMenuProps> = ({ suggestions, selectedIndex, onSelect }) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="autocomplete-menu">
      {suggestions.map((sug, idx) => (
        <div
          key={sug.name}
          className={`autocomplete-item ${idx === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(idx)}
        >
          <span className="autocomplete-name">{sug.name}{sug.isDir ? '/' : ''}</span>
          <span className="autocomplete-meta">
            {sug.isDir ? 'dir' : (sug.size > 1024 * 1024 ? (sug.size / (1024 * 1024)).toFixed(1) + 'M' : (sug.size > 1024 ? Math.round(sug.size / 1024) + 'K' : sug.size + 'B'))}
          </span>
        </div>
      ))}
    </div>
  );
};
