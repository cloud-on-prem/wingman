import React, { useState } from 'react';
import { MessageContent as MessageContentType } from '../../types/index';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MessageContent.css';
import { CodeBlock } from './CodeBlock'; // Import the new CodeBlock component

interface MessageContentProps {
    content: MessageContentType[];
}

export const MessageContentRenderer: React.FC<MessageContentProps> = ({ content }) => {
    // State to track which code block has been copied
    const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null);

    // Get the messaging hooks for actions
    const { restartServer, serverStatus } = useVSCodeMessaging();

    // Handle action button clicks
    const handleAction = (action: string) => {
        console.log('Action clicked:', action);
        switch (action) {
            case 'restart-server':
                restartServer();
                break;
            default:
                console.warn('Unknown action:', action);
        }
    };

    // Handle copying code to clipboard
    const handleCopyCode = (code: string, blockId: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedCodeBlock(blockId);
            // Reset after animation completes
            setTimeout(() => setCopiedCodeBlock(null), 600);
        }).catch(err => {
            console.error('Failed to copy code:', err);
        });
    };

    // Check if the server is in a state where restart shouldn't be enabled
    const isServerBusy = serverStatus === 'starting' || serverStatus === 'running';

    // If content array is empty or null/undefined, show a placeholder
    if (!content || content.length === 0) {
        return (
            <div className="message-text empty-message">
                <i>Empty response. Waiting for content...</i>
            </div>
        );
    }

    // Create a filtered array of valid content items
    const validItems = content.filter(item => {
        // First check if item exists
        if (!item) {
            return false;
        }

        // Check if it's a text item (most common)
        if (item.type === 'text') {
            // Allow even empty strings during generation
            return typeof item.text === 'string';
        }

        // Other content types might be valid, keep them
        return true;
    });

    // If we have no valid items after filtering, show the fallback
    if (validItems.length === 0) {
        return (
            <div className="message-text empty-message">
                <i>Waiting for response content...</i>
            </div>
        );
    }

    // Map valid content items to components
    return (
        <>
            {validItems.map((item, index) => {
                // Ensure item and item.type are valid before proceeding
                if (!item || !item.type) {
                    console.warn('MessageContentRenderer: Encountered an item without a type or null item at index', index, item);
                    return null; 
                }

                if (item.type === 'text') {
                    // const textItem = item as import('../../types').TextContent; // No cast needed, item is already narrowed by item.type
                    // If the text is empty, show generating message
                    if (!item.text || item.text.trim() === '') {
                        return (
                            <div key={index} className="message-text empty-message">
                                <i>Generating content...</i>
                            </div>
                        );
                    }

                    // Check if the content appears to be JSON data that needs parsing
                    let textContentToRender = item.text; // Use item.text directly
                    if (typeof textContentToRender === 'string' && textContentToRender.trim().startsWith('data:')) {
                        try {
                            // Extract the JSON part
                            const jsonMatch = textContentToRender.match(/data:\s*(\{.*\})/);
                            if (jsonMatch && jsonMatch[1]) {
                                const jsonData = JSON.parse(jsonMatch[1]);
                                if (jsonData.message && typeof jsonData.message === 'string') {
                                    textContentToRender = jsonData.message;
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing JSON in message:', e);
                        }
                    }

                    return (
                        <div key={index} className="message-text">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    // Use the new CodeBlock component for fenced code blocks
                                    // and standard `code` for inline code
                                    code({ node, className, children, ...props }) { // Removed 'inline' prop
                                        const match = /language-(\w+)/.exec(className || '');
                                        const isCodeBlock = !!match; // Determine if it's a block based on class

                                        if (isCodeBlock) {
                                            // Render fenced code blocks using CodeBlock
                                            const codeContent = String(children).replace(/\n$/, '');
                                            const blockId = `code-block-${index}-${className || 'text'}-${codeContent.length}`;
                                            const isCopied = copiedCodeBlock === blockId;

                                            return (
                                                <div className="code-block-wrapper">
                                                    <div className="code-block-header">
                                                        {match && match[1] && (
                                                            <span className="code-block-language">
                                                                {match[1]}
                                                            </span>
                                                        )}
                                                        <button
                                                            className={`code-block-copy ${isCopied ? 'copied' : ''}`}
                                                            onClick={() => handleCopyCode(codeContent, blockId)}
                                                            title="Copy code"
                                                        >
                                                            <i className={`codicon ${isCopied ? 'codicon-check' : 'codicon-copy'}`}></i>
                                                        </button>
                                                    </div>
                                                    {/* Pass props down to CodeBlock */}
                                                    <CodeBlock className={className} {...props}>
                                                        {children}
                                                    </CodeBlock>
                                                </div>
                                            );
                                        } else {
                                            // Render inline code as standard `code` element
                                            return <code className={className} {...props}>{children}</code>;
                                        }
                                    }
                                }}
                            >
                                {textContentToRender}
                            </ReactMarkdown>
                        </div>
                    );
                } else if (item.type === 'code_context') {
                    // const codeContextItem = item as import('../../types').CodeContextPart; // No cast needed
                    const blockId = `code-context-${index}-${item.fileName}-${item.startLine}`;
                    const isCopied = copiedCodeBlock === blockId;
                    const languageClass = item.languageId ? `language-${item.languageId}` : '';

                    return (
                        <div key={`code-context-${index}`} className="message-code-context">
                            <div className="code-context-header">
                                <span className="code-context-filename">
                                    {item.fileName}:{item.startLine}-{item.endLine}
                                    {item.languageId && ` (${item.languageId})`}
                                </span>
                                <button
                                    className={`code-block-copy ${isCopied ? 'copied' : ''}`}
                                    onClick={() => handleCopyCode(item.selectedText, blockId)}
                                    title="Copy code"
                                >
                                    <i className={`codicon ${isCopied ? 'codicon-check' : 'codicon-copy'}`}></i>
                                </button>
                            </div>
                            <CodeBlock className={languageClass}>
                                {item.selectedText}
                            </CodeBlock>
                        </div>
                    );
                } else if (item.type === 'image') {
                    // const imageItem = item as import('../../types').ImageContent; // No cast needed
                    return (
                        <div key={index} className="message-image">
                            <img src={item.url} alt="Generated" />
                        </div>
                    );
                } else if (item.type === 'action') {
                    // const actionItem = item as import('../../types').ActionContent; // No cast needed
                    // If action is for restarting server, show appropriate status
                    const isRestartAction = item.action === 'restart-server';

                    // If server is running, don't show the restart button at all
                    if (isRestartAction && serverStatus === 'running') {
                        return (
                            <div key={index} className="message-action">
                                <div className="server-status-message">
                                    <span className="status-icon"><i className="codicon codicon-check"></i></span>
                                    Server is now running
                                </div>
                            </div>
                        );
                    }

                    // If server is starting, show a message indicating it's starting
                    if (isRestartAction && serverStatus === 'starting') {
                        return (
                            <div key={index} className="message-action">
                                <div className="server-status-message">
                                    <span className="status-icon"><i className="codicon codicon-loading codicon-modifier-spin"></i></span>
                                    Server is starting...
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={index} className="message-action">
                            <button
                                className="action-button"
                                onClick={() => handleAction(item.action)}
                                title={item.label}
                            >
                                {isRestartAction ? 'Restart Server' : item.label}
                            </button>
                        </div>
                    );
                }
                // Log unhandled item types for debugging, but don't render them to avoid errors
                console.warn('MessageContentRenderer: Unhandled item type or structure at index', index, item);
                return null;
            })}
        </>
    );
};
