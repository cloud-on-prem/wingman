import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import * as shiki from 'shiki';

interface ShikiContextType {
    highlighter: shiki.Highlighter | null;
    isLoading: boolean;
    error: Error | null;
    theme: string; // Add theme to the context type
}

// Provide a default context value matching the type
const defaultContextValue: ShikiContextType = {
    highlighter: null,
    isLoading: true,
    error: null,
    theme: 'dark-plus', // Default theme
};

const ShikiContext = createContext<ShikiContextType>(defaultContextValue); // Use default value

interface ShikiProviderProps {
    theme: string; // Theme identifier from useVSCodeMessaging
    children: ReactNode;
}

// List of common languages to preload (using string type)
const commonLangs: string[] = [
    'javascript', 'typescript', 'jsx', 'tsx',
    'python', 'java', 'csharp', 'go', 'rust',
    'html', 'css', 'json', 'yaml', 'markdown',
    'shellscript', 'sql', 'dockerfile', 'diff',
    'plaintext' // Ensure plaintext is included as a fallback
];

export const ShikiProvider: React.FC<ShikiProviderProps> = ({ theme, children }) => {
    const [highlighter, setHighlighter] = useState<shiki.Highlighter | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setError(null);
        setHighlighter(null); // Clear previous highlighter instance

        console.log(`Initializing Shiki with theme: ${theme}`);

        // Use createHighlighter instead of getHighlighter
        shiki.createHighlighter({
            themes: [theme], // Load the specific theme
            langs: commonLangs,
        }).then((hl: shiki.Highlighter) => { // Add type for hl
            if (isMounted) {
                console.log('Shiki highlighter initialized successfully.');
                setHighlighter(hl);
                setIsLoading(false);
            }
        }).catch((err: unknown) => { // Add type for err
            if (isMounted) {
                console.error('Failed to initialize Shiki highlighter:', err);
                setError(err instanceof Error ? err : new Error('Shiki initialization failed'));
                setIsLoading(false);
            }
        });

        return () => {
            isMounted = false;
            console.log('ShikiProvider unmounting or theme changing...');
        };
    }, [theme]); // Re-initialize whenever the theme changes

    // Include the current theme in the context value
    const value = { highlighter, isLoading, error, theme };

    return (
        <ShikiContext.Provider value={value}>
            {children}
        </ShikiContext.Provider>
    );
};

export const useShiki = (): ShikiContextType => {
    const context = useContext(ShikiContext);
    // No need to check for undefined if we provide a default value
    return context;
};
