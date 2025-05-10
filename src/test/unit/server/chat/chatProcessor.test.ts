import * as assert from 'assert';
import * as sinon from 'sinon';
import { ChatProcessor } from '../../../../server/chat/chatProcessor';
import { ServerManager } from '../../../../server/serverManager';
import { SessionManager } from '../../../../server/chat/sessionManager';
import { logger } from '../../../../utils/logger';
import { setupTestEnvironment } from '../../../testUtils';
import { Message } from '../../../../types';

suite('ChatProcessor Tests - Empty Message Validation', () => {
    let chatProcessor: ChatProcessor;
    let mockServerManager: sinon.SinonStubbedInstance<ServerManager>;
    let mockSessionManager: sinon.SinonStubbedInstance<SessionManager>;
    let mockApiClient: any;
    let loggerInfoStub: sinon.SinonStub;
    let testEnv: ReturnType<typeof setupTestEnvironment>;

    setup(() => {
        testEnv = setupTestEnvironment();

        loggerInfoStub = testEnv.sandbox.stub(logger, 'info');

        mockApiClient = {
            streamChatResponse: testEnv.sandbox.stub().callsFake(async () => {
                const asyncGenerator = (async function* () { 
                    yield new TextEncoder().encode(JSON.stringify({ type: 'Message', message: { role: 'assistant', content: [{type: 'text', text: 'response part 1'}] } }));
                    yield new TextEncoder().encode(JSON.stringify({ type: 'Finish', reason: 'completed' }));
                })();

                const mockReadableStreamBody = {
                    getReader: () => {
                        const iterator = asyncGenerator[Symbol.asyncIterator]();
                        return {
                            async read() {
                                const result = await iterator.next();
                                return result; // { value: Uint8Array | undefined, done: boolean }
                            },
                            releaseLock() { },
                            get closed() { return Promise.resolve(); } // Mock closed promise
                        };
                    }
                };

                return Promise.resolve({ 
                    ok: true,
                    body: mockReadableStreamBody,
                    status: 200,
                    headers: new Headers()
                });
            }),
        };

        mockServerManager = testEnv.sandbox.createStubInstance(ServerManager);
        (mockServerManager as any).getApiClient = testEnv.sandbox.stub().returns(mockApiClient);
        // Stub getDefensivePrompt to return a string, as it's called in sendMessage
        // The actual content doesn't matter for these tests, just that it's callable.
        (mockServerManager as any).getDefensivePrompt = testEnv.sandbox.stub().returns('Defensive prompt text');


        mockSessionManager = testEnv.sandbox.createStubInstance(SessionManager);
        mockSessionManager.getCurrentSessionId.returns('test-session-id');
        // Configure getSessions to return an empty array to prevent TypeError
        mockSessionManager.getSessions.returns([]); 

        chatProcessor = new ChatProcessor(mockServerManager as unknown as ServerManager);
        chatProcessor.setSessionManager(mockSessionManager as unknown as SessionManager);
    });

    teardown(() => {
        testEnv.sandbox.restore();
    });

    test('sendMessage should log and not proceed if text is empty and no code context', async () => {
        await chatProcessor.sendMessage('', [], undefined);
        sinon.assert.calledOnceWithExactly(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text and no code context. Not proceeding.');
        sinon.assert.notCalled(mockApiClient.streamChatResponse);
    });

    test('sendMessage should log and not proceed if text is whitespace and no code context', async () => {
        await chatProcessor.sendMessage('   ', [], undefined);
        sinon.assert.calledOnceWithExactly(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text and no code context. Not proceeding.');
        sinon.assert.notCalled(mockApiClient.streamChatResponse);
    });
    
    test('sendMessage should log and not proceed if text is null and no code context', async () => {
        await chatProcessor.sendMessage(null as any, [], undefined);
        sinon.assert.calledOnceWithExactly(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text and no code context. Not proceeding.');
        sinon.assert.notCalled(mockApiClient.streamChatResponse);
    });

    test('sendMessage should log and not proceed if text is empty even with code references', async () => {
        const codeRefs: any[] = [{ filePath: 'test.ts', startLine: 1, endLine: 5, content: 'code', id:'ref1' }];
        await chatProcessor.sendMessage('', codeRefs, undefined);
        sinon.assert.calledOnceWithExactly(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text (but with code context). Not proceeding as per task 2.1 focusing on user text.');
        sinon.assert.notCalled(mockApiClient.streamChatResponse);
    });

    test('sendMessage should log and not proceed if text is empty even with prepended code', async () => {
        const prependedCode = { content: 'code', fileName: 'test.ts', languageId: 'typescript', startLine:1, endLine:1 };
        await chatProcessor.sendMessage('', [], prependedCode);
        sinon.assert.calledOnceWithExactly(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text (but with code context). Not proceeding as per task 2.1 focusing on user text.');
        sinon.assert.notCalled(mockApiClient.streamChatResponse);
    });
    
    test('sendMessage should proceed and call streamChatResponse if text is valid', async () => {
        loggerInfoStub.resetHistory(); 
        
        await chatProcessor.sendMessage('Hello', [], undefined);
        
        sinon.assert.neverCalledWith(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text and no code context. Not proceeding.');
        sinon.assert.neverCalledWith(loggerInfoStub, 'ChatProcessor: sendMessage called with empty user text (but with code context). Not proceeding as per task 2.1 focusing on user text.');
        
        sinon.assert.calledOnce(mockApiClient.streamChatResponse);
    });
});
