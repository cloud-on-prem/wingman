import React from 'react';

interface VersionDisplayProps {
  version: string;
}

/**
 * Displays the extension version information at the bottom of the welcome screen.
 */
export const VersionDisplay: React.FC<VersionDisplayProps> = ({ version }) => {
  return (
    <div className="version-display">
      <span>Goose VS Code Extension v{version}</span>
    </div>
  );
};
