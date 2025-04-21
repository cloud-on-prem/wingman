import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within as _within } from '@testing-library/react';
import { SessionList, SessionMetadata } from '../components/SessionList';

describe('SessionList Component', () => {
    it('renders empty state when no sessions are available', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        render(
            <SessionList
                sessions={[]}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        expect(screen.getByText('Sessions')).toBeInTheDocument();
        expect(screen.getByText('No saved sessions')).toBeInTheDocument();
    });

    it('renders a list of sessions', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session 1',
                    description: 'Description 1',
                    created: Date.now() - 10000,
                    updated: Date.now()
                }
            },
            {
                id: 'session-2',
                metadata: {
                    title: 'Session 2',
                    description: 'Description 2',
                    created: Date.now() - 20000,
                    updated: Date.now() - 5000
                }
            }
        ];

        render(
            <SessionList
                sessions={sessions}
                currentSessionId="session-1"
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        expect(screen.getByText('Description 1')).toBeInTheDocument();
        expect(screen.getByText('Description 2')).toBeInTheDocument();
        expect(screen.queryByText('No saved sessions')).not.toBeInTheDocument();
    });

    it('highlights the current session', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session 1',
                    description: 'Description 1',
                    created: Date.now(),
                    updated: Date.now()
                }
            },
            {
                id: 'session-2',
                metadata: {
                    title: 'Session 2',
                    description: 'Description 2',
                    created: Date.now(),
                    updated: Date.now()
                }
            }
        ];

        const { container } = render(
            <SessionList
                sessions={sessions}
                currentSessionId="session-1"
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        // Find the element containing "Description 1" to check if its parent has the "active" class
        const sessionItems = container.querySelectorAll('.vscode-session-item');
        expect(sessionItems[0]).toHaveClass('active');
        expect(sessionItems[1]).not.toHaveClass('active');
    });

    it('calls onSessionSelect when a session is clicked', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session 1',
                    description: 'Description 1',
                    created: Date.now(),
                    updated: Date.now()
                }
            }
        ];

        render(
            <SessionList
                sessions={sessions}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        fireEvent.click(screen.getByText('Description 1'));
        expect(mockSessionSelect).toHaveBeenCalledWith('session-1');
    });

    it('calls onCreateSession when the create button is clicked', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        render(
            <SessionList
                sessions={[]}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        // Find the "+" button by its codicon
        const createButton = screen.getByTitle('Create new session');
        fireEvent.click(createButton);
        expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });

    it('displays "New Chat" for session with isLocal=true', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session Title',
                    description: 'Session Description',
                    created: Date.now(),
                    updated: Date.now()
                },
                isLocal: true
            }
        ];

        render(
            <SessionList
                sessions={sessions}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        expect(screen.getByText('New Chat')).toBeInTheDocument();
    });

    it('displays description for session with description', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session Title',
                    description: 'My Custom Description',
                    created: Date.now(),
                    updated: Date.now()
                }
            }
        ];

        render(
            <SessionList
                sessions={sessions}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        expect(screen.getByText('My Custom Description')).toBeInTheDocument();
    });

    it('displays "Untitled Session" for session with empty description', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session Title',
                    description: '',  // Empty description
                    created: Date.now(),
                    updated: Date.now()
                }
            }
        ];

        render(
            <SessionList
                sessions={sessions}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        expect(screen.getByText('Untitled Session')).toBeInTheDocument();
    });

    it('displays "Untitled Session" for session with null/undefined description', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session Title',
                    // No description property
                    created: Date.now(),
                    updated: Date.now()
                }
            }
        ];

        render(
            <SessionList
                sessions={sessions}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        expect(screen.getByText('Untitled Session')).toBeInTheDocument();
    });

    it('applies truncation class to session names', () => {
        const mockSessionSelect = vi.fn();
        const mockCreateSession = vi.fn();

        const sessions: SessionMetadata[] = [
            {
                id: 'session-1',
                metadata: {
                    title: 'Session Title',
                    description: 'A very long description that should be truncated in the UI because it exceeds the width of the container',
                    created: Date.now(),
                    updated: Date.now()
                }
            }
        ];

        const { container } = render(
            <SessionList
                sessions={sessions}
                currentSessionId={null}
                onSessionSelect={mockSessionSelect}
                onCreateSession={mockCreateSession}
            />
        );

        const nameElement = container.querySelector('.vscode-session-item-name');
        expect(nameElement).toHaveClass('session-name-truncated');
    });
}); 
