import React from 'react';

/**
 * Displays a welcome message to the user on the main welcome screen.
 */
export const WelcomeMessage: React.FC = () => {
  return (
    <div className="welcome-message">
      <h1 className="welcome-title">Hello! I'm Goose.</h1>
      <p className="welcome-tagline">Your local AI coding companion, ready to help.</p>
    </div>
  );
};
