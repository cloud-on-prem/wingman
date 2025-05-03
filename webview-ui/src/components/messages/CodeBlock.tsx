import React, { useState, useEffect } from 'react';
import { useShiki } from '../../context/ShikiContext';
import * as shiki from 'shiki'; // Import shiki namespace
import './MessageContent.css'; // Reuse existing styles for wrapper/header if applicable

// Basic escape function - trying different quote handling
function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/\"/g, '"') // Escape " in regex, use single quotes for replacement
         .replace(/'/g, "&#039;");
}


interface CodeBlockProps {
    className?: string;
    children?: React.ReactNode;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ className, children }) => {
    // Get theme name from context
    const { highlighter, isLoading: isShikiLoading, error: shikiError, theme: currentShikiTheme } = useShiki();
    const [highlightedCode, setHighlightedCode] = useState<string>('');
    const [isHighlighting, setIsHighlighting] = useState<boolean>(true);

    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : 'plaintext'; // Default to plaintext if no language class
    const code = String(children).replace(/\n$/, ''); // Clean up trailing newline

    useEffect(() => {
        if (isShikiLoading || !highlighter) {
            setHighlightedCode(`<pre><code>${escapeHtml(code)}</code></pre>`);
            setIsHighlighting(true);
            return;
        }

        if (shikiError) {
            console.error('Shiki initialization error, rendering plain code.');
            setHighlightedCode(`<pre><code>${escapeHtml(code)}</code></pre>`);
            setIsHighlighting(false);
            return;
        }

        setIsHighlighting(true);
        try {
            const loadedLangs = highlighter.getLoadedLanguages();
            const effectiveLang = loadedLangs.includes(lang as shiki.BundledLanguage) ? lang : 'plaintext';

            // Pass lang and the current theme identifier from context
            const html = highlighter.codeToHtml(code, {
                lang: effectiveLang,
                theme: currentShikiTheme // Pass the theme name from context
            });
            setHighlightedCode(html);
        } catch (error) {
            console.error(`Shiki highlighting failed for lang ${lang} with theme ${currentShikiTheme}:`, error);
            setHighlightedCode(`<pre><code>${escapeHtml(code)}</code></pre>`);
        } finally {
            setIsHighlighting(false);
        }
    }, [highlighter, code, lang, isShikiLoading, shikiError, currentShikiTheme]); // Add currentShikiTheme dependency

    if (isShikiLoading || isHighlighting) {
        // Render basic pre/code block as placeholder to maintain structure and prevent layout shifts
        return <pre><code className={className || ''}>{code}</code></pre>;
    }

    // Render the highlighted code using dangerouslySetInnerHTML
    // Shiki's output includes the <pre> and <code> tags with inline styles
    return <div dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
};
