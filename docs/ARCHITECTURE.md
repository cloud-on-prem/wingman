# Goose VSCode Extension Architecture

This document outlines the architecture of the Goose VSCode extension.

## Components

*   **VS Code UI:** The standard VS Code interface where the user interacts (editor, activity bar, context menus).
*   **Extension Host:** The Node.js process run by VS Code where the main extension logic resides (`src/extension.ts`, `src/server/*`, `src/utils/*`).
*   **Chat Webview:** An isolated iframe running the chat UI (`webview-ui/`). It communicates with the Extension Host via message passing.
*   **`goosed` Process:** The external daemon process (part of Goose Desktop) spawned and managed by the Extension Host. It exposes an HTTP API for AI interactions.
*   **Goose AI Backend:** The actual AI models and infrastructure that `goosed` communicates with (not directly part of the extension's architecture but the ultimate destination).

## Sequence Diagram: Ask Goose about this code

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant VSCodeUI as VS Code UI
    participant ExtHost as Extension Host
    participant ChatWebview as Chat Webview
    participant GoosedAPI as `goosed` Process API
    participant AIBackend as Goose AI Backend

    Note over User, VSCodeUI: User selects code in the editor

    User->>VSCodeUI: Right-click -> "Ask Goose about this code" <br/> OR <br/> Press Cmd/Ctrl+Shift+G
    activate VSCodeUI

    VSCodeUI->>ExtHost: Execute command 'goose.askAboutSelection'
    deactivate VSCodeUI
    activate ExtHost

    Note over ExtHost: (extension.ts:activate registers command)
    Note over ExtHost: CodeReferenceManager gets selected text/range

    ExtHost->>ChatWebview: Post message (ADD_CODE_REFERENCE, focus)
    activate ChatWebview
    Note over ChatWebview: Webview UI adds code reference chip,<br/>focuses input box

    User->>ChatWebview: Types question and presses Enter
    ChatWebview->>ExtHost: Post message (SEND_CHAT_MESSAGE) with text & code ref
    deactivate ChatWebview
    activate ExtHost

    Note over ExtHost: (GooseViewProvider receives message)
    ExtHost->>ExtHost: ChatProcessor prepares request
    activate ExtHost #LightSkyBlue

    ExtHost->>GoosedAPI: POST /chat (stream request with message, code ref, session)
    deactivate ExtHost #LightSkyBlue
    activate GoosedAPI

    GoosedAPI->>AIBackend: Forward request
    activate AIBackend

    AIBackend-->>GoosedAPI: Stream AI response chunks
    deactivate AIBackend

    GoosedAPI-->>ExtHost: Stream response chunks
    deactivate GoosedAPI
    activate ExtHost

    Note over ExtHost: (ChatProcessor receives stream chunks)
    ExtHost->>ChatWebview: Post message (CHAT_RESPONSE chunk)
    activate ChatWebview
    Note over ChatWebview: Webview UI appends chunk to response message

    loop Response Streaming
        GoosedAPI-->>ExtHost: Stream response chunks
        activate GoosedAPI
        deactivate GoosedAPI
        activate ExtHost
        ExtHost->>ChatWebview: Post message (CHAT_RESPONSE chunk)
        activate ChatWebview
        deactivate ChatWebview
    end

    GoosedAPI-->>ExtHost: Stream finished signal
    activate GoosedAPI
    deactivate GoosedAPI

    ExtHost->>ChatWebview: Post message (GENERATION_FINISHED)
    deactivate ExtHost
    deactivate ExtHost
    activate ChatWebview
    Note over ChatWebview: Webview UI finalizes message display

    deactivate ChatWebview

```

## Communication

*   **VS Code UI <-> Extension Host:** Standard VS Code API (Commands, Context Menus, WebviewViewProvider).
*   **Extension Host <-> Chat Webview:** Asynchronous message passing (`postMessage`, `onDidReceiveMessage`). Defined message types in `src/common-types.ts`.
*   **Extension Host <-> `goosed` Process:**
    *   Process Management: Spawning/killing the `goosed` executable using Node.js `child_process`.
    *   API Communication: HTTP requests from the Extension Host's `ApiClient` to the local HTTP server run by `goosed`. A secret key is used for authentication.
*   **`goosed` Process <-> Goose AI Backend:** Internal communication protocol (details outside the scope of this extension). 

## Server Daemon Management

The extension is responsible for starting, stopping, and monitoring the external `goosed` process. This is primarily handled by the `ServerManager` class within the Extension Host.

```mermaid
sequenceDiagram
    participant User
    participant VSCodeUI as VS Code UI
    participant ExtHost as Extension Host
    participant GoosedProcess as `goosed` Process
    participant ChatWebview as Chat Webview

    %% Automatic Startup on Activation %%
    Note over ExtHost: Extension Activation
    activate ExtHost
    ExtHost->>ExtHost: Create ServerManager
    activate ExtHost #Azure
    ExtHost->>ExtHost: serverManager.start()
    deactivate ExtHost #Azure
    activate ExtHost #LightSkyBlue
    ExtHost->>ExtHost: Generate Secret Key
    ExtHost->>ExtHost: Find `goosed` binary path
    ExtHost->>GoosedProcess: Spawn process (with config, secret key)
    activate GoosedProcess
    Note over ExtHost, GoosedProcess: `startGoosed` function handles spawning
    GoosedProcess-->>ExtHost: Process started, port assigned
    ExtHost->>ExtHost: Create ApiClient (with port, secret key)
    ExtHost->>ExtHost: Set Status = RUNNING
    ExtHost->>ChatWebview: Post message (SERVER_STATUS, running)
    deactivate ExtHost #LightSkyBlue
    activate ChatWebview
    Note over ChatWebview: UI updates status indicator
    deactivate ChatWebview
    deactivate ExtHost

    %% Manual Stop Command %%
    User->>VSCodeUI: Execute Command "Goose: Stop Server"
    activate VSCodeUI
    VSCodeUI->>ExtHost: Execute command 'goose.stopServer'
    deactivate VSCodeUI
    activate ExtHost
    ExtHost->>ExtHost: serverManager.stop()
    activate ExtHost #LightSkyBlue
    ExtHost->>GoosedProcess: Send SIGTERM/kill signal
    GoosedProcess-->>ExtHost: Process exits
    deactivate GoosedProcess
    ExtHost->>ExtHost: Set Status = STOPPED
    ExtHost->>ChatWebview: Post message (SERVER_STATUS, stopped)
    deactivate ExtHost #LightSkyBlue
    activate ChatWebview
    Note over ChatWebview: UI updates status indicator
    deactivate ChatWebview
    deactivate ExtHost

    %% Manual Start Command %%
    User->>VSCodeUI: Execute Command "Goose: Start Server"
    activate VSCodeUI
    VSCodeUI->>ExtHost: Execute command 'goose.startServer'
    deactivate VSCodeUI
    activate ExtHost
    ExtHost->>ExtHost: serverManager.start()
    Note right of ExtHost: Same flow as automatic startup...
    deactivate ExtHost

```

**Key Steps:**

1.  **Activation:** When the extension activates, it creates a `ServerManager` instance and calls its `start` method.
2.  **Starting:**
    *   The `ServerManager` generates a unique secret key.
    *   It locates the `goosed` executable (likely bundled or found in the Goose Desktop installation).
    *   It spawns `goosed` as a child process, passing configuration like the working directory and the secret key (e.g., via command-line flag or environment variable).
    *   Once the process confirms it's running and listening on a port, the `ServerManager` creates an `ApiClient` configured with the port and secret key.
    *   The status is updated to `RUNNING` and propagated to the Chat Webview.
3.  **Stopping:**
    *   The `stop` method (triggered by command or extension deactivation) sends a termination signal to the `goosed` process.
    *   It waits for the process to exit.
    *   The status is updated to `STOPPED` and propagated to the Chat Webview.
4.  **Status Monitoring:** The `ServerManager` monitors the child process. If it crashes or exits unexpectedly, the status is updated (e.g., to `ERROR` or `STOPPED`) and the change is reflected in the UI.

## Security Considerations

Security is managed through several layers:

1.  **Server Binding:** The `goosed` process's API server is explicitly bound to `127.0.0.1` (localhost). This prevents other machines on the network from accessing the API directly.

2.  **Secret Key Management:**
    *   **Generation:** A cryptographically strong, 32-byte random secret key is generated by the Extension Host (`ServerManager`) each time the `goosed` process is started (`crypto.randomBytes`). This key is ephemeral and exists only for the lifetime of that specific `goosed` instance.
    *   **Transmission:** The secret key is passed securely from the Extension Host to the spawned `goosed` process via an **environment variable** (`GOOSE_SERVER__SECRET_KEY`). This method is significantly safer than using command-line arguments, as environment variables are generally not visible to other users or processes on the system (though processes running as the *same user* could potentially inspect them).
    *   **Usage:** The `ApiClient` within the Extension Host includes this secret key in its requests to the `goosed` API (e.g., potentially in an `Authorization` header or similar mechanism). The `goosed` server validates this key to ensure requests are coming from the managing extension process.

3.  **Process Isolation:** The Chat Webview runs in an isolated iframe sandbox, limiting its direct access to VS Code APIs or the user's system. Communication happens strictly through controlled message passing with the Extension Host.

4.  **Binary Execution:** The extension relies on executing the `goosed` binary, which is expected to be provided by the main Goose Desktop application installation. Standard security considerations around executing external binaries apply.

## Session Management

Chat history is managed through sessions. Users can create new sessions, switch between existing sessions, and view the history associated with each. Session management involves the Chat Webview, Extension Host (specifically `GooseViewProvider` and `SessionManager`), and the `goosed` API.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant ChatWebview as Chat Webview
    participant ExtHost as Extension Host (ViewProvider)
    participant SessionMgr as SessionManager
    participant ApiClient as ApiClient
    participant GoosedAPI as `goosed` Process API

    %% Fetching Session List on Startup/Request %%
    Note over ChatWebview, ExtHost: Webview requests session list (e.g., on load)
    ChatWebview->>ExtHost: Post message (GET_SESSIONS)
    activate ExtHost
    ExtHost->>SessionMgr: fetchSessions()
    activate SessionMgr
    SessionMgr->>ApiClient: listSessions()
    activate ApiClient
    ApiClient->>GoosedAPI: GET /sessions
    activate GoosedAPI
    GoosedAPI-->>ApiClient: List of SessionMetadata
    deactivate GoosedAPI
    ApiClient-->>SessionMgr: SessionMetadata[]
    deactivate ApiClient
    SessionMgr-->>ExtHost: SessionMetadata[]
    deactivate SessionMgr
    ExtHost->>ChatWebview: Post message (SESSIONS_LIST)
    deactivate ExtHost
    activate ChatWebview
    Note over ChatWebview: UI populates session list/dropdown
    deactivate ChatWebview

    alt User selects an existing session
        %% Switching to an Existing Session %%
        User->>ChatWebview: Selects an existing session from UI
        activate ChatWebview
        ChatWebview->>ExtHost: Post message (SWITCH_SESSION, sessionId)
        deactivate ChatWebview
        activate ExtHost
        ExtHost->>SessionMgr: switchSession(sessionId)
        activate SessionMgr
        SessionMgr->>SessionMgr: loadSession(sessionId)
        activate SessionMgr #LightSkyBlue
        SessionMgr->>ApiClient: getSessionHistory(sessionId)
        activate ApiClient
        ApiClient->>GoosedAPI: GET /sessions/{sessionId}/history
        activate GoosedAPI
        GoosedAPI-->>ApiClient: Session object (incl. messages)
        deactivate GoosedAPI
        ApiClient-->>SessionMgr: Session
        deactivate ApiClient
        Note over SessionMgr: Updates internal currentSession
        SessionMgr-->>SessionMgr: Session
        deactivate SessionMgr #LightSkyBlue
        SessionMgr-->>ExtHost: true (switch success)
        deactivate SessionMgr
        Note over ExtHost: Gets loaded Session object from SessionMgr
        ExtHost->>ChatWebview: Post message (SESSION_LOADED, sessionId, messages)
        deactivate ExtHost
        activate ChatWebview
        Note over ChatWebview: UI loads and displays messages for the session
        deactivate ChatWebview

    else User creates a new session
        %% Creating a New Session (Locally First) %%
        User->>ChatWebview: Clicks "New Chat" button
        activate ChatWebview
        ChatWebview->>ExtHost: Post message (CREATE_SESSION, description?)
        deactivate ChatWebview
        activate ExtHost
        ExtHost->>SessionMgr: createSession(workingDir, description?)
        activate SessionMgr
        Note over SessionMgr: Generates new local sessionId (e.g., timestamp-based)
        Note over SessionMgr: Creates new Session object in memory
        Note over SessionMgr: Updates internal sessions list and currentSession
        SessionMgr-->>ExtHost: newSessionId
        deactivate SessionMgr
        Note over ExtHost: Gets the new (empty) Session object from SessionMgr
        ExtHost->>ChatWebview: Post message (SESSION_LOADED, newSessionId, [])
        ExtHost->>ChatWebview: Post message (SESSIONS_LIST, updatedList)
        deactivate ExtHost
        activate ChatWebview
        Note over ChatWebview: UI clears message area, updates session list
        deactivate ChatWebview

        %% Sending First Message in New Session (Implicit Backend Creation) %%
        User->>ChatWebview: Types first message and presses Enter
        activate ChatWebview
        ChatWebview->>ExtHost: Post message (SEND_CHAT_MESSAGE, text, newSessionId)
        deactivate ChatWebview
        activate ExtHost
        Note over ExtHost: (GooseViewProvider routes to ChatProcessor)
        ExtHost->>ApiClient: streamChatResponse(messages, newSessionId, workingDir)
        Note over ExtHost: (Via ChatProcessor.sendMessage -> sendChatRequest)
        activate ApiClient
        ApiClient->>GoosedAPI: POST /reply (body: { messages: [...], session_id: newSessionId, session_working_dir: ... })
        deactivate ApiClient
        activate GoosedAPI
        Note over GoosedAPI: Backend sees newSessionId, creates session<br/>using this ID and persists the message.
        GoosedAPI-->>ApiClient: Stream AI response chunks...
        deactivate GoosedAPI
        ApiClient-->>ExtHost: Stream response chunks...
        activate ApiClient
        deactivate ApiClient
        ExtHost->>ChatWebview: Post message (CHAT_RESPONSE chunk)...
        deactivate ExtHost
        activate ChatWebview
        Note over ChatWebview: UI displays response...
        deactivate ChatWebview

    end

```

**Key Points:**

1.  **Fetching:** The list of available sessions (`SessionMetadata`) is fetched from the `goosed` API (`GET /sessions`) via the `ApiClient` when requested by the webview.
2.  **Loading:** When switching to an existing session, the full session details including message history (`Session`) are fetched from the `goosed` API (`GET /sessions/{sessionId}/history`).
3.  **Creation & Synchronization:**
    *   New sessions are first created locally within the `SessionManager` using a frontend-generated ID (e.g., timestamp-based). The UI reflects this new session immediately.
    *   The session is implicitly created on the backend when the *first message* for that session is sent via a `POST` request to the `/reply` endpoint. The request body includes the frontend-generated `session_id`.
    *   The backend uses this provided `session_id` to create and persist the new session. The frontend does not need to update its ID.
4.  **State:** The `SessionManager` keeps track of the available session metadata and the currently loaded session details in memory.
5.  **Communication:** Session-related actions are triggered by the user in the Chat Webview, which sends messages to the Extension Host. The Extension Host interacts with the `SessionManager`, which in turn uses the `ApiClient` to communicate with the `goosed` API for fetching/loading existing sessions or implicitly creating new ones via `/reply`, and updates the Webview with the results.
