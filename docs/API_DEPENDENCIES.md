# Goose API Dependencies

This document outlines the API dependencies between the VS Code extension and the `goosed` server process. It serves as a contract that defines the expected endpoints, request/response formats, headers, and environment variables required for proper operation.

## Authentication

All API requests from the extension to the `goosed` server include the following header for authentication:

- `X-Secret-Key`: A cryptographically secure random key generated during server startup and transmitted to the `goosed` process via the `GOOSE_SERVER__SECRET_KEY` environment variable. The server validates this key to ensure requests are coming from the authorized extension process.

## Required Endpoints

### Server Status

**GET /status**
- **Purpose**: Check if the server is running and ready to handle requests
- **Request Headers**: `X-Secret-Key`
- **Response**: HTTP 200 OK if the server is ready
- **Usage**: Called by `ApiClient.checkStatus()` to verify server health after startup and during operation

### Chat Communication

**POST /reply**
- **Purpose**: Send messages to the AI and receive a streamed response
- **Request Headers**: `X-Secret-Key`, `Accept: text/event-stream`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "messages": [
      {
        "id": "string",
        "role": "user" | "assistant" | "system",
        "content": "string",
        "timestamp": "ISO-8601 date string",
        "codeReferences": [
          {
            "id": "string",
            "content": "string",
            "fileName": "string",
            "language": "string",
            "startLine": number,
            "endLine": number
          }
        ]
      }
    ],
    "session_id": "string (optional)",
    "session_working_dir": "string"
  }
  ```
- **Response**: Server-sent events (SSE) stream with chunks of the AI response
- **Usage**: Called by `ApiClient.streamChatResponse()` when a user sends a message in the chat interface

**POST /reply/ask**
- **Purpose**: Simplified endpoint for quick, non-streamed AI responses
- **Request Headers**: `X-Secret-Key`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "prompt": "string",
    "session_id": "string (optional)",
    "session_working_dir": "string"
  }
  ```
- **Response**:
  ```json
  {
    "text": "string"
  }
  ```
- **Usage**: Called by `ApiClient.ask()` for simple, one-off questions that don't need streaming

**POST /reply/confirm**
- **Purpose**: Confirm or reject a tool call requested by the AI
- **Request Headers**: `X-Secret-Key`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "id": "string",
    "confirmed": boolean
  }
  ```
- **Response**: JSON response indicating success
- **Usage**: Called by `ApiClient.confirmToolCall()` when the user approves/rejects a tool execution

### Agent Configuration

**GET /agent/versions**
- **Purpose**: Retrieve available agent versions
- **Request Headers**: `X-Secret-Key`
- **Response**:
  ```json
  {
    "available_versions": ["string", "string", ...],
    "default_version": "string"
  }
  ```
- **Usage**: Called by `ServerManager` during startup to determine which agent version to use

**GET /agent/providers**
- **Purpose**: Retrieve available AI providers
- **Request Headers**: `X-Secret-Key`
- **Response**: 
  ```json
  {
    "providers": [
      {
        "name": "string",
        "is_configured": boolean,
        "metadata": {
          "name": "string",
          "display_name": "string",
          "description": "string",
          "default_model": "string",
          "known_models": [
            {
              "name": "string",
              "context_limit": integer
            }
          ],
          "model_doc_link": "string",
          "config_keys": [
            {
              "key": "string",
              "display_name": "string",
              "description": "string",
              "is_secret": boolean,
              "required": boolean
            }
          ]
        }
      }
    ]
  }
  ```
- **Usage**: Called by `ApiClient.getProviders()` to check available AI providers

**POST /agent**
- **Purpose**: Configure the agent with a specific provider, model, and version
- **Request Headers**: `X-Secret-Key`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "provider": "string",
    "model": "string (optional)",
    "version": "string (optional)"
  }
  ```
- **Response**: JSON response with agent configuration details
- **Usage**: Called by `ServerManager.configureAgent()` during server startup to set up the AI agent

**POST /extensions/add**
- **Purpose**: Add extensions to the agent for additional capabilities
- **Request Headers**: `X-Secret-Key`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "type": "builtin",
    "name": "string"
  }
  ```
- **Response**: JSON response indicating success
- **Usage**: Called by `ApiClient.addExtension()` to enhance the agent with additional capabilities like the "developer" extension

### Session Management

**GET /sessions**
- **Purpose**: List available chat sessions
- **Request Headers**: `X-Secret-Key`
- **Response**: Array of session metadata objects or an object with a `sessions` property containing the array
- **Usage**: Called by `ApiClient.listSessions()` to populate the session list in the UI

**GET /sessions/{sessionId}**
- **Purpose**: Get chat history for a specific session
- **Request Headers**: `X-Secret-Key`
- **Path Parameters**: `sessionId` - Identifier of the session to retrieve
- **Response**: Session object with messages and metadata
- **Usage**: Called by `ApiClient.getSessionHistory()` when switching to an existing session

**POST /sessions/new**
- **Purpose**: Create a new session (explicitly)
- **Request Headers**: `X-Secret-Key`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "working_dir": "string",
    "description": "string"
  }
  ```
- **Response**: JSON response with the created session ID
- **Usage**: Called by `ApiClient.createSession()` when a user explicitly creates a new session

**POST /sessions/{sessionId}/rename**
- **Purpose**: Rename/update a session's description
- **Request Headers**: `X-Secret-Key`, `Content-Type: application/json`
- **Path Parameters**: `sessionId` - Identifier of the session to rename
- **Request Body**:
  ```json
  {
    "description": "string"
  }
  ```
- **Response**: JSON response indicating success
- **Usage**: Called by `ApiClient.renameSession()` when a user renames a session

**DELETE /sessions/{sessionId}**
- **Purpose**: Delete a session
- **Request Headers**: `X-Secret-Key`
- **Path Parameters**: `sessionId` - Identifier of the session to delete
- **Response**: JSON response indicating success
- **Usage**: Called by `ApiClient.deleteSession()` when a user deletes a session

## Environment Variables

The following environment variables are recognized and used by the `goosed` process:

- **GOOSE_SERVER__SECRET_KEY**: Secret key for authenticating API requests. Set by the VS Code extension when launching the `goosed` process.

## Error Handling

All API endpoints are expected to:

1. Return appropriate HTTP status codes (e.g., 200 for success, 400 for client errors, 500 for server errors)
2. Provide meaningful error messages in the response body for non-200 status codes
3. For streaming endpoints, emit proper error events in the server-sent events stream when applicable

The extension's `ApiClient` handles these error responses by:
- Checking the response status code
- Attempting to parse error messages from the response body
- Logging detailed error information when in debug mode
- Propagating errors through the extension's event system or throwing caught exceptions 
