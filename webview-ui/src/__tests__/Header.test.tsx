import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Header } from '../components/Header';

describe('Header Component', () => {
    it('renders with default props', () => {
        const onToggleSessionDrawer = vi.fn();
        const onNewSession = vi.fn();

        render(
            <Header
                status="running"
                currentSession={null}
                isGenerating={false}
                onToggleSessionDrawer={onToggleSessionDrawer}
                onNewSession={onNewSession}
            />
        );

        // Verify elements exist
        expect(screen.getByTitle('New Session')).toBeInTheDocument();
        expect(screen.getByTitle('Session History')).toBeInTheDocument();
        expect(screen.getByTitle('SERVER CONNECTED')).toBeInTheDocument();
    });

    it('displays GENERATING status when isGenerating is true', () => {
        render(
            <Header
                status="running"
                currentSession={null}
                isGenerating={true}
                onToggleSessionDrawer={vi.fn()}
                onNewSession={vi.fn()}
            />
        );

        expect(screen.getByTitle('GENERATING')).toBeInTheDocument();

        // Buttons should be disabled when generating
        const newSessionBtn = screen.getByTitle('New Session');
        const sessionHistoryBtn = screen.getByTitle('Session History');

        expect(newSessionBtn).toBeDisabled();
        expect(sessionHistoryBtn).toBeDisabled();
    });

    it('displays the actual status when not running or generating', () => {
        render(
            <Header
                status="stopped"
                currentSession={null}
                isGenerating={false}
                onToggleSessionDrawer={vi.fn()}
                onNewSession={vi.fn()}
            />
        );

        expect(screen.getByTitle('STOPPED')).toBeInTheDocument();
    });

    it('calls onToggleSessionDrawer when the history button is clicked', () => {
        const onToggleSessionDrawer = vi.fn();

        render(
            <Header
                status="running"
                currentSession={null}
                isGenerating={false}
                onToggleSessionDrawer={onToggleSessionDrawer}
                onNewSession={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Session History'));
        expect(onToggleSessionDrawer).toHaveBeenCalledTimes(1);
    });

    it('calls onNewSession when the new session button is clicked', () => {
        const onNewSession = vi.fn();

        render(
            <Header
                status="running"
                currentSession={null}
                isGenerating={false}
                onToggleSessionDrawer={vi.fn()}
                onNewSession={onNewSession}
            />
        );

        fireEvent.click(screen.getByTitle('New Session'));
        expect(onNewSession).toHaveBeenCalledTimes(1);
    });
}); 
