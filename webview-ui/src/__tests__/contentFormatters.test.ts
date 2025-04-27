import { describe, it, expect } from 'vitest';
import { formatIntermediateContent } from '../utils/contentFormatters';

describe('contentFormatters', () => {
    describe('formatIntermediateContent', () => {
        it('should return empty string for null or undefined content', () => {
            expect(formatIntermediateContent(null)).toBe('');
            expect(formatIntermediateContent(undefined)).toBe('');
        });

        it('should handle thinking content', () => {
            const content = { type: 'thinking', thinking: 'Analyzing your code...' };
            expect(formatIntermediateContent(content)).toBe('Analyzing your code...');
        });

        it('should handle redacted_thinking content', () => {
            const content = { type: 'redacted_thinking', thinking: 'Evaluating solution...' };
            expect(formatIntermediateContent(content)).toBe('Evaluating solution...');
        });

        it('should handle empty thinking content', () => {
            const content = { type: 'thinking', thinking: '' };
            expect(formatIntermediateContent(content)).toBe('');
        });

        it('should handle text editor view tool request content', () => {
            const content = {
                type: 'toolRequest',
                toolCall: {
                    status: 'success',
                    value: {
                        name: 'developer__text_editor',
                        arguments: { command: 'view', path: '/path/to/file.js' }
                    }
                }
            };
            expect(formatIntermediateContent(content)).toContain('Using tool: developer__text_editor');
            expect(formatIntermediateContent(content)).toContain('Viewing file: /path/to/file.js');
        });

        it('should handle text editor edit tool request content', () => {
            const content = {
                type: 'toolRequest',
                toolCall: {
                    status: 'success',
                    value: {
                        name: 'developer__text_editor',
                        arguments: { command: 'edit', path: '/path/to/file.js' }
                    }
                }
            };
            expect(formatIntermediateContent(content)).toContain('Using tool: developer__text_editor');
            expect(formatIntermediateContent(content)).toContain('Editing file: /path/to/file.js');
        });

        it('should handle shell command tool request content', () => {
            const content = {
                type: 'toolRequest',
                toolCall: {
                    status: 'running',
                    value: {
                        name: 'developer__shell',
                        arguments: { command: 'npm install lodash' }
                    }
                }
            };
            expect(formatIntermediateContent(content)).toContain('Using tool: developer__shell');
            expect(formatIntermediateContent(content)).toContain('Running command: npm install lodash');
            expect(formatIntermediateContent(content)).toContain('Status: running');
        });

        it('should handle generic tool request content', () => {
            const content = {
                type: 'toolRequest',
                toolCall: {
                    status: 'success',
                    value: {
                        name: 'some_other_tool',
                        arguments: { 
                            param1: 'value1',
                            param2: 42
                        }
                    }
                }
            };
            expect(formatIntermediateContent(content)).toContain('Using tool: some_other_tool');
            expect(formatIntermediateContent(content)).toContain('"param1": "value1"');
            expect(formatIntermediateContent(content)).toContain('"param2": 42');
        });

        it('should handle tool request with no arguments', () => {
            const content = {
                type: 'toolRequest',
                toolCall: {
                    value: {
                        name: 'some_tool'
                    }
                }
            };
            expect(formatIntermediateContent(content)).toContain('Using tool: some_tool');
        });

        it('should handle malformed tool request content', () => {
            const content = {
                type: 'toolRequest',
                // Missing toolCall structure
            };
            expect(formatIntermediateContent(content)).toBe('Using a tool...');
        });

        it('should handle unknown content types', () => {
            const content = { type: 'unknown_type', someData: 'value' };
            expect(formatIntermediateContent(content)).toContain('Processing: unknown_type');
        });
    });
});
