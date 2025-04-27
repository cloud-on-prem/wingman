import React from 'react';
import { CodeReference } from '../../types/index';
import './CodeReferenceChip.css';
// Import specific icons from react-simple-icons
// We'll need to add more imports as we map more languages
import {
    SiJavascript, SiTypescript, SiReact, SiHtml5, SiCss3, SiSass, SiLess,
    SiPython, /* SiJava removed */ SiSharp, SiCplusplus, SiC, SiGo, SiRust, SiRuby, SiPhp, SiSwift, SiKotlin, // Corrected SiCsharp to SiSharp
    SiJson, SiYaml, SiXml, SiMarkdown, SiGnubash, /* SiPowershell removed */ SiGit, SiDocker, // Corrected SiGnuBash, removed SiPowershell for now
    // Fallback icon (using a generic one from the pack if available, or a placeholder)
    // Let's use a generic code icon if possible, or fallback further
    // Note: Simple Icons might not have a perfect generic 'file' or 'code' icon.
    // We might need a different fallback strategy or library if needed.
    // For now, let's assume we can find *something* or return null/placeholder.
    // Using SiGnubash as the fallback for now.
} from '@icons-pack/react-simple-icons';
// Import X from lucide-react for the close button
import { X } from 'lucide-react';

// Map language IDs to React Simple Icons components
const getLanguageIconComponent = (languageId: string): React.FC<any> | null => {
    const map: Record<string, React.FC<any>> = {
        html: SiHtml5,
        css: SiCss3,
        scss: SiSass,
        less: SiLess,
        javascript: SiJavascript,
        typescript: SiTypescript,
        javascriptreact: SiReact,
        typescriptreact: SiReact,
        python: SiPython,
        java: SiGnubash, // Fallback for Java
        csharp: SiSharp, // Corrected name
        cpp: SiCplusplus,
        c: SiC,
        go: SiGo,
        rust: SiRust,
        ruby: SiRuby,
        php: SiPhp,
        swift: SiSwift,
        kotlin: SiKotlin,
        json: SiJson,
        yaml: SiYaml,
        xml: SiXml, // Simple Icons has XML
        markdown: SiMarkdown,
        shellscript: SiGnubash, // Corrected name
        bash: SiGnubash, // Corrected name
        powershell: SiGnubash, // Fallback for PowerShell, SiPowersHex seems wrong
        git: SiGit,
        gitignore: SiGit, // Use git icon for gitignore
        dockerfile: SiDocker,
        // Add more mappings...
    };

    // Return the component or the fallback
    return map[languageId] || SiGnubash; // Using Bash as fallback for now
};

interface CodeReferenceChipProps {
    codeReference: CodeReference;
    onRemove: (codeReference: CodeReference) => void;
    onClick?: (codeReference: CodeReference) => void;
}

const CodeReferenceChip: React.FC<CodeReferenceChipProps> = ({
    codeReference,
    onRemove,
    onClick
}) => {
    // Format the label to show filename and line numbers
    const getLabel = () => {
        const { fileName, startLine, endLine } = codeReference;
        const fileNameParts = fileName.split('/');
        const displayName = fileNameParts[fileNameParts.length - 1];

        if (startLine === endLine) {
            return `${displayName}:${startLine}`;
        }

        return `${displayName}:${startLine}-${endLine}`;
    };

    return (
        <div className="code-reference-chip">
            <button
                className="chip-button"
                onClick={() => {
                    if (onClick) {
                        onClick(codeReference);
                    }
                }}
                title={`${codeReference.fileName} (${codeReference.languageId})`}
            >
                {/* Render the SVG icon component */}
                {React.createElement(getLanguageIconComponent(codeReference.languageId) || 'span', { size: 14, className: 'language-icon' })}
                <span className="chip-label">{getLabel()}</span>
            </button>
            <button
                className="remove-button"
                onClick={() => onRemove(codeReference)}
                title="Remove code reference"
            >
                {/* Use Lucide X icon */}
                <X size={14} /> 
            </button>
        </div>
    );
};

export default CodeReferenceChip;
