/**
 * Utility functions for formatting different types of content in user-friendly ways
 */

/**
 * Format any intermediate content item into a user-friendly string
 * @param contentItem The content item to format
 * @returns A formatted string representation of the content
 */
export function formatIntermediateContent(contentItem: any): string {
    if (!contentItem) return '';
    
    switch(contentItem.type) {
        case 'thinking':
        case 'redacted_thinking':
            return contentItem.thinking || '';
            
        case 'toolRequest':
            return formatToolRequestContent(contentItem);
            
        // Add other content types as needed
        
        default:
            return `Processing: ${contentItem.type || 'unknown operation'}`;
    }
}

/**
 * Format tool request content into a user-friendly string
 * @param toolRequestContent The tool request content to format
 * @returns A formatted string representation of the tool request
 */
function formatToolRequestContent(toolRequestContent: any): string {
    if (!toolRequestContent?.toolCall?.value) return 'Using a tool...';
    
    const toolCall = toolRequestContent.toolCall;
    const toolName = toolCall.value.name || 'unknown';
    let toolText = `Using tool: ${toolName}\n`;
    
    // Format arguments based on tool type
    if (toolCall.value.arguments) {
        const args = toolCall.value.arguments;
        
        // Special formatting for common tools
        if (toolName === 'developer__text_editor') {
            if (args.command === "view" && args.path) {
                toolText += `Viewing file: ${args.path}`;
            } else if (args.command === "edit" && args.path) {
                toolText += `Editing file: ${args.path}`;
            } else if (args.command) {
                toolText += `Command: ${args.command}`;
                if (args.path) {
                    toolText += `\nPath: ${args.path}`;
                }
            }
        } else if (toolName === 'developer__shell') {
            if (args.command) {
                toolText += `Running command: ${args.command}`;
            }
        } else {
            // Generic argument display
            try {
                toolText += `With arguments: ${JSON.stringify(args, null, 2)}`;
            } catch (error) {
                toolText += `With arguments: [Complex object]`;
            }
        }
    }
    
    // Add status information if available
    if (toolCall.status) {
        toolText += `\nStatus: ${toolCall.status}`;
    }
    
    return toolText;
}
