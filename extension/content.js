// Function to get the current webpage context
function getPageContext() {
    const context = {
        url: window.location.href,
        title: document.title,
        selectedText: window.getSelection().toString(),
        activeElement: null,
        activeElementType: null,
        activeElementValue: null
    };

    // Get information about the active element
    const activeElement = document.activeElement;
    if (activeElement) {
        context.activeElement = {
            tagName: activeElement.tagName,
            id: activeElement.id,
            className: activeElement.className,
            type: activeElement.type,
            name: activeElement.name,
            value: activeElement.value,
            isContentEditable: activeElement.isContentEditable,
            isTextInput: ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)
        };

        // Get the full text content if it's a contenteditable element
        if (activeElement.isContentEditable) {
            context.activeElementValue = activeElement.innerText;
        }
        // Get the value if it's a text input or textarea
        else if (context.activeElement.isTextInput) {
            context.activeElementValue = activeElement.value;
        }
    }

    return context;
}

// Function to insert text at the cursor position
function insertText(text) {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    try {
        if (activeElement.isContentEditable) {
            // For contenteditable elements
            // Convert newlines to <br> tags for contenteditable elements
            const htmlText = text.replace(/\n/g, '<br>');
            activeElement.innerHTML = htmlText;
            
            // Move cursor to end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(activeElement);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
            // For input and textarea elements
            activeElement.value = text;
            
            // Move cursor to end
            activeElement.selectionStart = activeElement.selectionEnd = text.length;

            // Trigger input event to ensure any listeners are notified
            const event = new Event('input', { bubbles: true });
            activeElement.dispatchEvent(event);
        }
        return true;
    } catch (e) {
        console.error('Error replacing text:', e);
        return false;
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'getContext') {
        const context = getPageContext();
        sendResponse(context);
    } else if (request.type === 'insertText') {
        const success = insertText(request.text);
        sendResponse({success});
    }
    return true;
});