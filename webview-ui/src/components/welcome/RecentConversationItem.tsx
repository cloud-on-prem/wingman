import React from 'react';

interface RecentConversationItemProps {
  id: string;
  title: string;
  timestamp: string; // This can be a formatted date string
  onClick: (id: string) => void;
}

/**
 * Component to display a single recent conversation item in the welcome screen list.
 */
export const RecentConversationItem: React.FC<RecentConversationItemProps> = ({ 
  id, 
  title, 
  timestamp, 
  onClick 
}) => {
  const handleClick = () => {
    onClick(id);
  };

  return (
    <div className="recent-conversation-item" onClick={handleClick}>
      <div className="recent-conversation-title">{title}</div>
      <div className="recent-conversation-timestamp">{timestamp}</div>
    </div>
  );
};
