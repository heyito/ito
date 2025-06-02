let port = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer = null;
let lastMessageTime = Date.now();
let pingInterval = null;
let processingInterval = null;

function cleanupConnection() {
    if (port) {
        try {
            port.disconnect();
        } catch (e) {
            console.error('Error disconnecting port:', e);
        }
        port = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

function setupPingInterval() {
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    pingInterval = setInterval(() => {
        if (isConnected && port) {
            try {
                port.postMessage({ type: 'ping' });
                lastMessageTime = Date.now();
            } catch (e) {
                console.error('Error sending ping:', e);
                handleDisconnect();
            }
        }
    }, 15000); // Send ping every 15 seconds
}

function handleDisconnect() {
    console.log('Handling disconnect...');
    isConnected = false;
    cleanupConnection();

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Reconnection attempt ${reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS}`);
        reconnectTimer = setTimeout(connect, 1000);
    } else {
        console.error('Max reconnection attempts reached. Please restart the native host.');
    }
}

function connect() {
    cleanupConnection();

    try {
        console.log('Attempting to connect to native host...');
        port = chrome.runtime.connectNative('ai.inten.app');
        isConnected = true;
        reconnectAttempts = 0;
        lastMessageTime = Date.now();

        port.onDisconnect.addListener(() => {
            const error = chrome.runtime.lastError;
            console.log('Disconnected from native host:', error ? error.message : 'No error message');
            handleDisconnect();
        });

        port.onMessage.addListener((response) => {
            console.log('Received from native host:', response);
            lastMessageTime = Date.now();

            if (response.type === 'startup') {
                console.log('Native host startup complete');
                setupPingInterval();
                // Send a test message to verify the connection
                setTimeout(() => {
                    try {
                        port.postMessage({ type: 'test' });
                    } catch (e) {
                        console.error('Error sending test message:', e);
                        handleDisconnect();
                    }
                }, 1000);
            } else if (response.type === 'test_response') {
                console.log('Test response received, connection is working');
            } else if (response.type === 'pong') {
                console.log('Received pong from native host');
            } else if (response.type === 'request_context') {
                startProcessingIndicator();
                chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                    if (tabs[0]) {
                        try {
                            // Now try to get context with retries
                            let retryCount = 0;
                            const maxRetries = 3;

                            function tryGetContext() {
                                chrome.tabs.sendMessage(tabs[0].id, { type: 'getContext' }, (context) => {
                                    if (chrome.runtime.lastError) {
                                        console.error('Error getting context (attempt ' + (retryCount + 1) + '):', chrome.runtime.lastError);
                                        if (retryCount < maxRetries) {
                                            retryCount++;
                                            console.log(`Retrying in 500ms... (${retryCount}/${maxRetries})`);
                                            setTimeout(tryGetContext, 500);
                                        } else {
                                            port.postMessage({
                                                type: 'context_error',
                                                error: 'Failed to connect to content script after ' + maxRetries + ' attempts'
                                            });
                                        }
                                    } else {
                                        console.log('Successfully got context:', JSON.stringify(context));
                                        port.postMessage({
                                            type: 'context',
                                            data: context
                                        });
                                    }
                                });
                            }

                            tryGetContext();
                        } catch (error) {
                            console.error('Failed to inject content script:', error);
                            port.postMessage({
                                type: 'context_error',
                                error: 'Failed to inject content script: ' + error.message
                            });
                        }
                    }
                });
            } else if (response.type === 'insert_text') {
                stopProcessingIndicator();
                // Insert text into the active element in all focused windows across all profiles
                chrome.windows.getAll({ populate: true }, function (windows) {
                    windows.forEach(function (window) {
                        if (window.focused) {
                            chrome.tabs.query({ active: true, windowId: window.id }, (tabs) => {
                                if (tabs[0]) {
                                    chrome.tabs.sendMessage(tabs[0].id, {
                                        type: 'insertText',
                                        text: response.text
                                    }, function (contentResponse) {
                                        // Send ack back to native host
                                        port.postMessage({
                                            type: 'insert_text_ack',
                                            success: "true",
                                            tabId: tabs[0].id
                                        });
                                    });
                                }
                            });
                        } else {
                            console.log('Window', window.id, 'is not focused, skipping insertText command.');
                        }
                    });
                });
            } else if (response.type === 'error') {
                stopProcessingIndicator();
                chrome.action.setBadgeBackgroundColor({ color: '#F44336' }); // Red
                chrome.action.setBadgeText({ text: '!' });
                // Clear error indicator after 2 seconds
                setTimeout(() => {
                    chrome.action.setBadgeText({ text: '' });
                }, 2000);
            } else {
                console.log('Received unknown message from native host:', response);
            }
        });

    } catch (error) {
        console.error('Error connecting to native host:', error);
        handleDisconnect();
    }
}

// Initial connection
connect();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'checkConnection') {
        console.log('Connection check requested. Current status:', isConnected);
        sendResponse({ connected: isConnected });
        return true;
    }

    if (!isConnected || !port) {
        console.log('Cannot send message: Not connected to content script');
        sendResponse({ status: 'error', message: 'Not connected to content script' });
        return true;
    }

    try {
        console.log('Sending message to content script:', message);
        port.postMessage(message);
        lastMessageTime = Date.now();
        sendResponse({ status: 'Message sent to content script' });
    } catch (error) {
        console.error('Error sending message:', error);
        sendResponse({ status: 'error', message: 'Failed to send message to content script' });
    }
    return true;
});

function startProcessingIndicator() {
    // Set initial badge color
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

    if (processingInterval) {
        clearInterval(processingInterval);
    }

    // Create array of opacity levels for smooth fade
    const opacitySteps = [
        [144, 238, 144, 255], // Light green
        [144, 238, 144, 200],
        [144, 238, 144, 150],
        [144, 238, 144, 100],
        [144, 238, 144, 50],
        [144, 238, 144, 100],
        [144, 238, 144, 150],
        [144, 238, 144, 200]
    ];

    let stepIndex = 0;
    processingInterval = setInterval(() => {
        chrome.action.setBadgeText({ text: '⋯' });
        chrome.action.setBadgeBackgroundColor({ color: opacitySteps[stepIndex] });

        // Move to next opacity step
        stepIndex = (stepIndex + 1) % opacitySteps.length;
    }, 200); // Each step takes 200ms, full cycle is 1.6s

    // Safety timeout to ensure processing indicator is stopped after 5 seconds
    setTimeout(() => {
        stopProcessingIndicator();
    }, 5000);
}

function stopProcessingIndicator() {
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }
    chrome.action.setBadgeText({ text: '' });
} 