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

// Function to insert text at the cursor position or replace selection/content
function insertText(text, replaceAll = true) { // Added replaceAll flag
    const activeElement = document.activeElement;
    if (!activeElement) {
        console.log('No active element found.');
        return false;
    }

    // Ensure the element is focused
    activeElement.focus();

    try {
        // --- Handle Standard Inputs and Textareas ---
        if (['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
            const inputElement = activeElement; // Alias for clarity
            const start = inputElement.selectionStart;
            const end = inputElement.selectionEnd;
            const originalValue = inputElement.value;

            if (replaceAll) {
                inputElement.value = text;
                // Move cursor to end
                inputElement.selectionStart = inputElement.selectionEnd = text.length;
            } else {
                // Insert text at cursor position or replace selection
                inputElement.value = originalValue.substring(0, start) + text + originalValue.substring(end);
                // Move cursor after inserted text
                const newCursorPos = start + text.length;
                inputElement.selectionStart = inputElement.selectionEnd = newCursorPos;
            }

            // Trigger input event REQUIRED by many frameworks (React, Vue, etc.) and some editors
            inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            // Also trigger change event for good measure
            inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            console.log('Inserted text into INPUT/TEXTAREA.');
            return true;
        }
        // --- Handle ContentEditable Elements (including many rich editors) ---
        else if (activeElement.isContentEditable) {
            console.log('Attempting insertion into contentEditable element.');

            // Method 1: Use execCommand('insertText') - Preferred for compatibility
            // This command respects the current selection. If you want to replace *all*
            // content, you'd need to select all first.
            if (!replaceAll) {
                if (document.execCommand('insertText', false, text)) {
                    // Dispatch an input event as some frameworks/editors might listen for it
                    activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    console.log('Inserted text using document.execCommand("insertText").');
                    return true;
                } else {
                    console.warn('document.execCommand("insertText") failed or is not supported.');
                }
            }

            // Method 2: Fallback/Alternative - Replace entire content or use if execCommand fails
            // This is less ideal for rich editors as it bypasses their model.
            // Use this if 'replaceAll' is true, or as a fallback.
            console.log('Falling back to direct manipulation or replaceAll scenario.');
            // Select all content if replacing all
            if (replaceAll) {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(activeElement);
                selection.removeAllRanges();
                selection.addRange(range);
            }

            // Now, try inserting HTML (handles newlines better in contenteditable)
            const htmlText = text.replace(/\n/g, '<br>'); // Convert newlines like before
            if (document.execCommand('insertHTML', false, htmlText)) {
                // Dispatch an input event
                activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                console.log('Inserted text using document.execCommand("insertHTML").');
                return true; // Successfully inserted (or replaced selection) with HTML
            } else {
                console.warn('document.execCommand("insertHTML") failed. Trying innerHTML.');
                // Final fallback: Direct innerHTML manipulation (Least reliable for rich editors)
                // This WILL replace the entire content if replaceAll was true and selection succeeded
                // If replaceAll was false, this fallback is less useful as it replaces everything.
                // Consider if this fallback makes sense for non-replaceAll cases.
                // For simplicity here, we'll just implement the replaceAll case.
                if (replaceAll) {
                    activeElement.innerHTML = htmlText;
                    // Manually move cursor to end (might not always work perfectly)
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(activeElement);
                    range.collapse(false); // Collapse to the end
                    sel.removeAllRanges();
                    sel.addRange(range);
                    // Dispatch an input event
                    activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    console.log('Replaced content using innerHTML.');
                    return true;
                } else {
                    console.error('Cannot reliably insert text at cursor using fallback methods without replacing all content.');
                    return false; // Indicate failure for non-replaceAll insertion via fallback
                }
            }
        } else {
            console.log('Active element is not an input, textarea, or contentEditable.');
            return false;
        }

    } catch (e) {
        console.error('Error inserting/replacing text:', e);
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