import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest'; 
import { ChatInput } from './ChatInput';
import { CodeReference } from '../../types';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  SendHorizonal: () => <svg data-testid="send-icon" />,
  StopCircle: () => <svg data-testid="stop-icon" />,
  X: () => <svg data-testid="x-icon" />,
}));

const mockCodeReferences: CodeReference[] = [
  {
    id: 'ref1',
    content: 'const a = 1;',
    fileName: 'test.ts',
    languageId: 'typescript',
    selection: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 10 },
  },
];

describe('ChatInput Component', () => {
  const mockOnInputChange = vi.fn();
  const mockOnSendMessage = vi.fn();
  const mockOnStopGeneration = vi.fn();
  const mockOnRemoveCodeReference = vi.fn();

  const defaultProps = {
    inputMessage: '',
    codeReferences: [],
    isLoading: false,
    onInputChange: mockOnInputChange,
    onSendMessage: mockOnSendMessage,
    onStopGeneration: mockOnStopGeneration,
    onRemoveCodeReference: mockOnRemoveCodeReference,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders textarea and send button', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText('What can Goose help with?')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('calls onInputChange when textarea value changes', () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('What can Goose help with?');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(mockOnInputChange).toHaveBeenCalledWith('Hello');
  });

  describe('Send Button State and Action', () => {
    test('send button is disabled and has correct title when input is empty (whitespace) and no code references', () => {
      render(<ChatInput {...defaultProps} inputMessage="   " codeReferences={[]} />);
      const button = screen.getByTitle('Type a message to send'); 
      expect(button).toBeDisabled();
    });

    test('send button is enabled and has correct title when input has text and no code references', () => {
      render(<ChatInput {...defaultProps} inputMessage="Hello" codeReferences={[]} />);
      const button = screen.getByTitle('Send message (Enter)');
      expect(button).not.toBeDisabled();
    });

    test('send button is DISABLED and has correct title when input is empty, even if code references exist', () => {
      render(<ChatInput {...defaultProps} inputMessage="" codeReferences={mockCodeReferences} />);
      const button = screen.getByTitle('Type a message to send'); 
      expect(button).toBeDisabled(); 
    });

    test('send button is enabled and has correct title when input has text AND code references exist', () => {
      render(<ChatInput {...defaultProps} inputMessage="Hello with refs" codeReferences={mockCodeReferences} />);
      const button = screen.getByTitle('Send message (Enter)');
      expect(button).not.toBeDisabled();
    });

    test('send button is enabled and shows stop icon/title when isLoading is true', () => {
      render(<ChatInput {...defaultProps} inputMessage="Hello" isLoading={true} />);
      const button = screen.getByTitle('Stop generation');
      expect(button).not.toBeDisabled(); 
      expect(button).toHaveAttribute('title', 'Stop generation');
      expect(screen.getByTestId('stop-icon')).toBeInTheDocument();
    });

    test('calls onSendMessage when send button is clicked with valid input (text only)', () => {
      render(<ChatInput {...defaultProps} inputMessage="Test message" />);
      fireEvent.click(screen.getByTitle('Send message (Enter)'));
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });
    
    test('calls onSendMessage when send button is clicked with valid input (text and refs)', () => {
      render(<ChatInput {...defaultProps} inputMessage="Test message with refs" codeReferences={mockCodeReferences} />);
      fireEvent.click(screen.getByTitle('Send message (Enter)'));
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });

    test('does not call onSendMessage when send button is clicked with empty input (whitespace) and no refs', () => {
      render(<ChatInput {...defaultProps} inputMessage="   " codeReferences={[]} />);
      fireEvent.click(screen.getByTitle('Type a message to send')); 
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    test('does not call onSendMessage when send button is clicked with empty input, even if code references exist', () => {
      render(<ChatInput {...defaultProps} inputMessage="" codeReferences={mockCodeReferences} />);
      fireEvent.click(screen.getByTitle('Type a message to send')); 
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    test('calls onStopGeneration when send button is clicked and isLoading is true', () => {
      render(<ChatInput {...defaultProps} inputMessage="Test" isLoading={true} />);
      fireEvent.click(screen.getByTitle('Stop generation'));
      expect(mockOnStopGeneration).toHaveBeenCalledTimes(1);
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Enter Key Behavior', () => {
    test('calls onSendMessage when Enter is pressed with valid input (text only)', () => {
      render(<ChatInput {...defaultProps} inputMessage="Enter test" codeReferences={[]} />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });

    test('calls onSendMessage when Enter is pressed with valid input (text and refs)', () => {
      render(<ChatInput {...defaultProps} inputMessage="Enter test with refs" codeReferences={mockCodeReferences} />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });

    test('does not call onSendMessage when Enter is pressed with empty input (whitespace) and no refs', () => {
      render(<ChatInput {...defaultProps} inputMessage="   " codeReferences={[]} />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    test('does not call onSendMessage when Enter is pressed with empty input, even if code references exist', () => {
      render(<ChatInput {...defaultProps} inputMessage="" codeReferences={mockCodeReferences} />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    test('does not call onSendMessage when Enter is pressed and isLoading is true', () => {
      render(<ChatInput {...defaultProps} inputMessage="Loading test" isLoading={true} />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    test('Enter (no Shift) with valid input: triggers send and expect default prevented (observed as false)', () => {
      render(<ChatInput {...defaultProps} inputMessage="Send this message" />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      const wasPrevented = fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false});
      expect(wasPrevented).toBe(false); 
      expect(mockOnSendMessage).toHaveBeenCalled(); 
    });

    test('Enter (no Shift) with empty input: expect default prevented (observed as false), does NOT send message', () => {
      render(<ChatInput {...defaultProps} inputMessage="   " />); 
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      const wasPrevented = fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false});
      expect(wasPrevented).toBe(false); 
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    test('Shift+Enter with valid input: expect default NOT prevented (observed as true), does NOT send message', () => {
      render(<ChatInput {...defaultProps} inputMessage="Newline please" />);
      const textarea = screen.getByPlaceholderText('What can Goose help with?');
      const wasPrevented = fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true});
      expect(wasPrevented).toBe(true); 
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });
  });
});
