import React, { useState } from 'react';

interface GooseLogoProps {
  gooseIcon?: string; // The resource URI for the goose icon
}

/**
 * Component to display the Goose logo.
 * Uses the provided gooseIcon URI if available, otherwise falls back to a placeholder SVG.
 */
export const GooseLogo: React.FC<GooseLogoProps> = ({ gooseIcon }) => {
  const [imageError, setImageError] = useState(false);
  console.log('[GooseLogo] Rendering. gooseIcon URI:', gooseIcon, 'Image Error State:', imageError);

  // If we have a valid gooseIcon URI and no error loading it
  if (gooseIcon && !imageError) {
    return (
      <div className="goose-logo">
        <img 
          src={gooseIcon}
          alt="Goose Logo" 
          width="120"
          height="120"
          onError={() => {
            console.error('Failed to load Goose icon from:', gooseIcon);
            setImageError(true);
          }}
        />
      </div>
    );
  }
  
  // Fallback to SVG
  return (
    <div className="goose-logo">
      <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" fill="currentColor" fillOpacity="0.2" />
        <text x="50" y="58" fontSize="20" fill="currentColor" textAnchor="middle" fontWeight="bold">Goose</text>
      </svg>
    </div>
  );
};
