console.log("Ito content script loaded");

/**
 * Simulates keydown and keyup events for a given key combination on an element,
 * including additional properties often needed for complex web apps.
 * @param {Element} element The target element.
 * @param {object} options Key options: { key, code, keyCode, ctrlKey, metaKey, shiftKey }
 * @returns {Promise<boolean>} True if keydown event's default action was prevented, false otherwise.
 */
async function simulateKeyPress(
  element,
  { key, code, keyCode, ctrlKey = false, metaKey = false, shiftKey = false }
) {
  // --- Event Options including additional properties ---
  const commonOptions = {
    key: key,
    code: code,
    keyCode: keyCode,
    which: keyCode,
    location: 0,
    ctrlKey: ctrlKey,
    metaKey: metaKey,
    shiftKey: shiftKey,
    altKey: false,  // Added explicit altKey
    bubbles: true,
    cancelable: true,
    composed: true,  // Important for Shadow DOM
    view: window,
    detail: 0,
    // Add more DOM Level 3 properties
    repeat: false,
    isComposing: false,
    charCode: keyCode,  // For legacy event handling
    // Add modifier key states explicitly
    getModifierState: (key) => {
      switch (key) {
        case 'Control': return ctrlKey;
        case 'Shift': return shiftKey;
        case 'Meta': return metaKey;
        case 'Alt': return false;
        default: return false;
      }
    }
  };

  // Simulate both 'keydown' and 'keypress' before 'keyup'
  const events = [
    new KeyboardEvent("keydown", { ...commonOptions, cancelable: true }),
    new KeyboardEvent("keypress", { ...commonOptions, cancelable: true }),
    new KeyboardEvent("keyup", { ...commonOptions, cancelable: false })
  ];

  let defaultPrevented = false;

  for (const event of events) {
    // Attempt to add missing properties that can't be set via constructor
    try {
      Object.defineProperties(event, {
        keyCode: { value: keyCode },
        which: { value: keyCode },
        charCode: { value: keyCode }
      });
    } catch (e) {
      console.warn("Could not define legacy properties:", e);
    }

    // Dispatch the event
    const dispatched = element.dispatchEvent(event);
    if (event.type === 'keydown') {
      defaultPrevented = !dispatched;
    }

    // Add small delay between events
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Final delay after all events
  await new Promise(resolve => setTimeout(resolve, 30));

  return defaultPrevented;
}

// Add this near the top of the file, before the functions
const SKIP_RANGE_SELECTION_DOMAINS = [
  'notion.so',
  'notion.site',
  'coda.io',        // Similar to Notion in structure
  'clickup.com',    // Known to have custom selection handling
  'monday.com',     // Another complex editor
  'airtable.com',   // Has complex cell editors
  'quip.com',       // Salesforce's document editor
  'dropbox.com/paper', // Dropbox Paper editor
  'craft.do',       // Similar editing structure to Notion
];

/**
 * Helper function to determine if current site should skip Range selection
 * @returns {boolean} True if the current domain should skip Range selection
 */
function shouldSkipRangeSelection() {
  const currentDomain = window.location.hostname.toLowerCase();
  return SKIP_RANGE_SELECTION_DOMAINS.some(domain =>
    currentDomain.includes(domain)
  );
}

/**
 * Helper function to store current selection state
 * @param {Element} activeElement The currently active element
 * @returns {{ ranges: Range[], hadFocus: boolean }} Stored selection state
 */
function storeSelectionState(activeElement) {
  const selection = window.getSelection();
  const originalRanges = [];
  for (let i = 0; i < selection.rangeCount; i++) {
    originalRanges.push(selection.getRangeAt(i).cloneRange());
  }
  const hadFocus = document.hasFocus() && document.activeElement === activeElement;
  return { ranges: originalRanges, hadFocus };
}

/**
 * Helper function to restore selection state
 * @param {Element} activeElement The element that should have focus
 * @param {{ ranges: Range[], hadFocus: boolean }} storedState Previously stored selection state
 */
async function restoreSelectionState(activeElement, storedState) {
  const { ranges: originalRanges, hadFocus } = storedState;
  const selection = window.getSelection();

  console.log("[restoreSelection] Restoring selection state...");
  selection.removeAllRanges();
  if (originalRanges.length > 0) {
    originalRanges.forEach((range) => {
      try {
        selection.addRange(range);
      } catch (e) {
        console.warn("Couldn't restore a range", e);
      }
    });
  }

  // Restore focus if it was lost
  if (hadFocus && document.activeElement !== activeElement) {
    console.log("[restoreSelection] Restoring focus...");
    activeElement.focus();
    // Re-applying ranges might be needed after refocus
    selection.removeAllRanges();
    if (originalRanges.length > 0) {
      originalRanges.forEach((range) => {
        try {
          selection.addRange(range);
        } catch (e) {
          console.warn("Couldn't restore a range post-focus", e);
        }
      });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Helper function to select all content in an element
 * @param {Element} element The target element
 * @returns {Promise<boolean>} True if selection was successful
 */
async function selectAllContent(element) {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modifierProp = isMac ? "metaKey" : "ctrlKey";
  const selection = window.getSelection();

  // Ensure focus
  element.focus();
  await new Promise(resolve => setTimeout(resolve, 50));

  if (!shouldSkipRangeSelection()) {
    console.log("[selectAllContent] Attempting Range selection...");
    try {
      const range = document.createRange();
      range.selectNodeContents(element);

      selection.removeAllRanges();
      selection.addRange(range);

      console.log("[selectAllContent] selection.toString():", selection.toString());
      if (selection.toString() != null) {
        console.log("[selectAllContent] Range selection successful");
        return true;
      }
      console.log("[selectAllContent] Range selection failed, falling back to key simulation...");
    } catch (rangeError) {
      console.warn("[selectAllContent] Range selection failed:", rangeError);
    }
  } else {
    console.log("[selectAllContent] Skipping Range selection for this domain");
  }

  // Fallback to key simulation
  const selectAllOptions = { key: "a", code: "KeyA", keyCode: 65 };
  selectAllOptions[modifierProp] = true;
  await simulateKeyPress(element, selectAllOptions);
  await simulateKeyPress(element, selectAllOptions); // Double-tap for Notion-like editors

  await new Promise(resolve => setTimeout(resolve, 100));

  // For Notion and similar editors, we should assume selection worked if:
  // 1. We're in a skip-range domain AND
  // 2. The element is still focused
  if (shouldSkipRangeSelection() && document.activeElement === element) {
    console.log("[selectAllContent] Assuming selection successful for custom editor");
    return true;
  }

  return selection.toString().length > 0;
}

/**
 * Gets the current webpage context, attempting to retrieve full content
 * of contentEditable elements by simulating Select All + Copy and reading the clipboard.
 * Requires the 'simulateKeyPress' helper function and "clipboardRead" manifest permission.
 * MUST be called with 'await' and the message listener updated for async response.
 */
async function getPageContext() {
  const context = {
    url: window.location.href,
    title: document.title,
    selectedText: null,
    activeElement: null,
    activeElementType: null,
    activeElementContent: null,
  };

  const activeElement = document.activeElement;
  console.log("activeElement:", activeElement);

  if (activeElement) {
    // Basic element info
    context.activeElement = {
      tagName: activeElement.tagName,
      id: activeElement.id,
      className: activeElement.className,
      type: activeElement.type,
      name: activeElement.name,
      isContentEditable: activeElement.isContentEditable,
      isTextInput: ["INPUT", "TEXTAREA"].includes(activeElement.tagName),
    };
    context.activeElementType = activeElement.tagName;

    if (activeElement.isContentEditable) {
      console.log("[getContext] Getting content via selection...");

      // Store original state
      const storedState = storeSelectionState(activeElement);

      try {
        // Select all content
        const selectionSuccess = await selectAllContent(activeElement);
        if (!selectionSuccess) {
          console.warn("[getContext] Failed to select content");
          return context;
        }

        // Simulate Copy
        const copyCommandSuccess = document.execCommand("copy");
        console.log(`[getContext] document.execCommand('copy') returned: ${copyCommandSuccess}`);

        if (!copyCommandSuccess) {
          console.warn("[getContext] Copy command failed or was blocked");
          // Backing up to innerText
          context.activeElementContent = activeElement.innerText;
        } else {
          try {
            context.activeElementContent = await navigator.clipboard.readText();
            console.log(`[getContext] Content read from clipboard (${context.activeElementContent.length} chars)`);
          } catch (clipboardError) {
            console.error("[getContext] Clipboard read failed:", clipboardError);
            context.activeElementContent = clipboardError.name === "NotAllowedError"
              ? "[Clipboard permission denied]"
              : "[Clipboard read error]";
          }
        }
      } catch (error) {
        console.error("[getContext] Error during content retrieval:", error);
        context.activeElementContent = "[Error during retrieval]";
      } finally {
        // Restore original state
        await restoreSelectionState(activeElement, storedState);
      }
    } else if (context.activeElement.isTextInput) {
      console.log("[getContext] Getting content for INPUT/TEXTAREA via .value");
      context.activeElementContent = activeElement.value;
    } else {
      console.log("[getContext] Getting content for other element via textContent");
      context.activeElementContent = activeElement.textContent;
    }
  } else {
    console.log("[getContext] No active element found.");
  }

  context.selectedText = context.activeElementContent;
  console.log("[getContext] Returning context:", context);
  return context;
}

// Function to insert text at the cursor position or replace selection/content
async function insertText(text, replaceAll = true) {
  console.log("insertText called with text:", text, "replaceAll:", replaceAll);
  const activeElement = document.activeElement;
  if (!activeElement) {
    console.log("No active element found.");
    return false;
  }

  activeElement.focus();
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    if (["INPUT", "TEXTAREA"].includes(activeElement.tagName)) {
      // Keep existing INPUT/TEXTAREA handling as is - it works well
      const inputElement = activeElement;
      if (replaceAll) {
        console.log("Replacing all content in INPUT/TEXTAREA.");
        inputElement.value = text;
        inputElement.select();
      } else {
        const start = inputElement.selectionStart;
        const end = inputElement.selectionEnd;
        const originalValue = inputElement.value;
        inputElement.value = originalValue.substring(0, start) + text + originalValue.substring(end);
        inputElement.selectionStart = inputElement.selectionEnd = start + text.length;
      }

      inputElement.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      return true;
    }
    else if (activeElement.isContentEditable) {
      console.log("Attempting action in contentEditable element.");

      if (replaceAll) {
        // Select all and clear content
        const selectionSuccess = await selectAllContent(activeElement);
        if (!selectionSuccess) {
          console.warn("Failed to select content for replacement");
          return false;
        }

        // Directly clear content if replacing all
        if (["INPUT", "TEXTAREA"].includes(activeElement.tagName)) {
          activeElement.value = '';
          activeElement.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
          activeElement.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
        } else if (activeElement.isContentEditable) {
          activeElement.innerHTML = '';
          activeElement.dispatchEvent(new Event("input", { bubbles: true }));
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Insert new text
      let insertionSuccess = false;

      // Try paste simulation first
      try {
        console.log("Attempting paste simulation...");
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", text);
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dataTransfer
        });
        activeElement.dispatchEvent(pasteEvent);
        activeElement.dispatchEvent(new Event("input", { bubbles: true }));
        insertionSuccess = true;
      } catch (pasteError) {
        console.error("Paste simulation failed:", pasteError);
      }

      // Fallback to execCommand if paste failed
      if (!insertionSuccess && !replaceAll) {
        console.log('Trying document.execCommand("insertText")...');
        if (document.execCommand("insertText", false, text)) {
          activeElement.dispatchEvent(new Event("input", { bubbles: true }));
          insertionSuccess = true;
        }
      }

      // Final fallback for replaceAll
      if (!insertionSuccess && replaceAll) {
        console.log("Falling back to innerHTML replacement");
        const htmlText = text.replace(/\n/g, "<br>");
        activeElement.innerHTML = htmlText;
        insertionSuccess = true;
      }

      return insertionSuccess;
    }
    return false;
  } catch (e) {
    console.error("Error in insertText:", e);
    return false;
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  // Optional: Log received messages for easier debugging
  console.log("Message received in content script:", request);

  if (request.type === "getContext") {
    console.log("Handling getContext request...");
    // Use an immediately-invoked async function (IIFE)
    (async () => {
      try {
        // Await the result of the async getPageContext function
        const context = await getPageContext();
        console.log("Sending getContext response:", context);
        // Send the response AFTER the await completes
        sendResponse(context);
      } catch (error) {
        // Handle any errors during the async operation
        console.error("Error executing or awaiting getPageContext:", error);
        sendResponse({
          error: "Failed to get context",
          details: error.message,
        });
      }
    })();
    // Return true IMMEDIATELY after starting the async operation.
    // This tells Chrome to keep the message channel open until sendResponse is called.
    return true;
  } else if (request.type === "insertText") {
    console.log("Handling insertText request...");
    const textToInsert = request.text;
    // Get the replaceAll flag, defaulting to true if not provided
    const replaceAllContent = request.replaceAll || true;

    // Basic check if text is provided
    if (typeof textToInsert === "undefined") {
      console.error("insertText request received without 'text' property.");
      // Send synchronous error response
      sendResponse({ success: false, error: "No text provided in request." });
      // Return false because we responded synchronously
      return false;
    }

    // Use an immediately-invoked async function (IIFE)
    (async () => {
      try {
        // Await the result of the async insertText function
        // Pass both text and the replaceAll flag
        const success = await insertText(textToInsert, replaceAllContent);
        console.log("Sending insertText response:", { success: success });
        // Send the response AFTER the await completes
        sendResponse({ success: success });
      } catch (error) {
        // Handle any errors during the async operation
        console.error("Error executing or awaiting insertText:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    // Return true IMMEDIATELY after starting the async operation.
    return true;
  }

  // Optional: If you have other synchronous message types, handle them here
  // else if (request.type === 'someSyncAction') {
  //    doSomethingSync();
  //    sendResponse({ result: 'done' });
  //    return false; // Or omit return statement for sync responses
  // }

  // If the message type isn't handled, Chrome assumes a synchronous response.
  // Returning false explicitly or letting it return undefined signals this.
  console.warn(
    "Unhandled message type received in content script:",
    request.type
  );
  // return false; // You can explicitly return false for unhandled types if desired
}); // End of addListener
