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
    code: code, // Physical key representation
    keyCode: keyCode, // Key code value (required by some listeners)
    which: keyCode, // Deprecated alias for keyCode
    location: 0, // DOM_KEY_LOCATION_STANDARD for standard keys
    ctrlKey: ctrlKey,
    metaKey: metaKey,
    shiftKey: shiftKey,
    bubbles: true,
    view: window, // Should point to the window object
    detail: 0, // Standard for keyboard events
  };

  // --- Dispatch keydown ---
  const kdEventOptions = { ...commonOptions, cancelable: true }; // keydown is cancelable
  const kdEvent = new KeyboardEvent("keydown", kdEventOptions);
  let defaultPrevented = !element.dispatchEvent(kdEvent);
  // console.log(`  -> dispatched keydown: ${key} (code: ${code}, keyCode: ${keyCode}), ctrl:${ctrlKey}, meta:${metaKey}. Prevented: ${defaultPrevented}`);

  // --- Dispatch keyup ---
  const kuEventOptions = { ...commonOptions, cancelable: false }; // keyup default action isn't usually cancelable
  // Ensure modifier key flags reflect release state if needed (though often just matching keydown state is fine)
  // For simplicity, we'll keep the modifier flags as passed for keyup too unless issues arise.
  const kuEvent = new KeyboardEvent("keyup", kuEventOptions);
  element.dispatchEvent(kuEvent);
  // console.log(`  -> dispatched keyup: ${key} (code: ${code}, keyCode: ${keyCode})`);

  // Short delay seems crucial sometimes after simulated events
  await new Promise((resolve) => setTimeout(resolve, 30));

  return defaultPrevented; // Return whether the keydown (usually the important one) was cancelled
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
    selectedText: null, // User's actual selection before we start
    activeElement: null,
    activeElementType: null,
    activeElementContent: null, // Where the final content will go
  };

  const activeElement = document.activeElement;

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

    // --- Determine Full Content ---
    if (activeElement.isContentEditable) {
      console.log(
        "[getContext] Getting content via Select All + Copy simulation..."
      );
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const modifierProp = isMac ? "metaKey" : "ctrlKey";

      // 1. Store original selection state carefully
      const selection = window.getSelection();
      const originalRanges = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        originalRanges.push(selection.getRangeAt(i).cloneRange());
      }
      const hadFocus =
        document.hasFocus() && document.activeElement === activeElement;
      let contentFromClipboard = "[Clipboard read failed or permission denied]"; // Default error

      try {
        // Ensure focus before simulation
        activeElement.focus();
        await new Promise((resolve) => setTimeout(resolve, 50));

        // 2. Simulate Select All
        console.log("[getContext] Simulating Select All...");
        const selectAllOptions = { key: "a", code: "KeyA", keyCode: 65 };
        selectAllOptions[modifierProp] = true;
        await simulateKeyPress(activeElement, selectAllOptions); // Assumes simulateKeyPress is defined & updated
        await simulateKeyPress(activeElement, selectAllOptions); // Done twice to ensure it works with some apps like notion
        await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for selection

        // 3. Simulate Copy (Cmd+C / Ctrl+C)
        copyCommandSuccess = document.execCommand("copy");
        console.log(
          `[getContext] document.execCommand('copy') returned: ${copyCommandSuccess}`
        );
        if (!copyCommandSuccess) {
          console.warn(
            "[getContext] execCommand('copy') returned false. The browser might have blocked it, or the page intercepted it and failed."
          );
        }

        // 4. Read from Clipboard
        console.log(
          "[getContext] Attempting to read from clipboard (requires clipboardRead permission)..."
        );
        try {
          contentFromClipboard = await navigator.clipboard.readText();
          console.log(
            `[getContext] Content read from clipboard (${contentFromClipboard.length} chars).`
          );
          console.log("contentFromClipboard:", contentFromClipboard);
        } catch (clipboardError) {
          console.error("[getContext] Clipboard read failed:", clipboardError);
          if (clipboardError.name === "NotAllowedError") {
            console.error(
              ">>>>> Ensure 'clipboardRead' permission is in manifest.json and reload extension! User may need to grant permission on first use."
            );
            contentFromClipboard = "[Clipboard permission denied]";
          } else {
            contentFromClipboard = "[Clipboard read error]";
          }
        }
      } catch (error) {
        console.error("[getContext] Error during key simulation:", error);
        contentFromClipboard = "[Error during simulation]";
      } finally {
        // 5. Restore original selection and focus (CRUCIAL)
        console.log("[getContext] Restoring original selection/focus state...");
        selection.removeAllRanges();
        if (originalRanges.length > 0) {
          originalRanges.forEach((range) => {
            try {
              selection.addRange(range);
            } catch (e) {
              console.warn("Couldn't restore a range", e);
            }
          });
        } else {
          // If no range existed, maybe just collapse cursor? Safest is often to do nothing more.
        }

        // Restore focus if it was lost
        if (hadFocus && document.activeElement !== activeElement) {
          console.log("[getContext] Restoring focus...");
          activeElement.focus();
          // Re-applying ranges might be needed after refocus in some cases
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
        await new Promise((resolve) => setTimeout(resolve, 50)); // Short delay after restoration
        console.log("[getContext] Original state restoration attempted.");
      }
      // Assign the retrieved content
      context.activeElementContent = contentFromClipboard;
    } else if (context.activeElement.isTextInput) {
      // Use .value for standard inputs/textareas
      console.log("[getContext] Getting content for INPUT/TEXTAREA via .value");
      context.activeElementContent = activeElement.value;
    } else {
      // Fallback for other elements
      console.log(
        "[getContext] Getting content for other element via textContent"
      );
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
  console.log(
    "insertText function called with text:",
    text,
    "and replaceAll:",
    replaceAll
  );
  const activeElement = document.activeElement;
  if (!activeElement) {
    console.log("No active element found.");
    return false;
  }

  activeElement.focus();
  await new Promise((resolve) => setTimeout(resolve, 50)); // Short delay for focus

  try {
    // --- Handle Standard Inputs and Textareas ---
    if (["INPUT", "TEXTAREA"].includes(activeElement.tagName)) {
      const inputElement = activeElement;
      if (replaceAll) {
        console.log("Replacing all content in INPUT/TEXTAREA.");
        inputElement.value = text;
        inputElement.select(); // Select the new text
      } else {
        // Insert text at cursor position or replace selection
        const start = inputElement.selectionStart;
        const end = inputElement.selectionEnd;
        const originalValue = inputElement.value;
        inputElement.value =
          originalValue.substring(0, start) +
          text +
          originalValue.substring(end);
        // Move cursor after inserted text
        const newCursorPos = start + text.length;
        inputElement.selectionStart = inputElement.selectionEnd = newCursorPos;
        console.log("Inserted text into INPUT/TEXTAREA.");
      }

      // Trigger events
      inputElement.dispatchEvent(
        new Event("input", { bubbles: true, cancelable: true })
      );
      inputElement.dispatchEvent(
        new Event("change", { bubbles: true, cancelable: true })
      );
      return true;
    }
    // --- Handle ContentEditable Elements ---
    else if (activeElement.isContentEditable) {
      console.log("Attempting action in contentEditable element.");
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const modifierProp = isMac ? "metaKey" : "ctrlKey"; // 'metaKey' for Mac (Cmd), 'ctrlKey' for others

      // --- Step 1: Handle "Select All" + "Delete" via Key Simulation if replaceAll is true ---
      if (replaceAll) {
        console.log(
          `replaceAll is true. Simulating ${
            isMac ? "Cmd+A" : "Ctrl+A"
          } + Delete...`
        );
        activeElement.focus(); // Re-ensure focus

        // Simulate Ctrl/Cmd + A (Select All)
        console.log(" Simulating Select All:");
        const selectAllOptions = {
          key: "a",
          code: "KeyA",
          keyCode: 65, // <<< ADDED keyCode for 'A'
          // No need to set ctrlKey/metaKey here initially
        };
        // Dynamically set the correct modifier property (metaKey or ctrlKey) to true
        selectAllOptions[modifierProp] = true;
        // Call the updated simulateKeyPress with the complete options
        await simulateKeyPress(activeElement, selectAllOptions);
        await simulateKeyPress(activeElement, selectAllOptions); // Done twice to ensure it works with some apps like notion

        // Wait briefly for selection to potentially register
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Simulate Delete key press
        // Note: If 'Delete' (keyCode 46) doesn't work, try 'Backspace' (keyCode 8)
        console.log(" Simulating Delete:");
        await simulateKeyPress(activeElement, {
          key: "Delete",
          code: "Delete",
          keyCode: 46, // <<< ADDED keyCode for 'Delete'
          // No ctrlKey/metaKey needed for Delete itself
        });

        // Wait briefly for deletion to potentially register
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Optional: Log whether element seems empty
        const currentContent =
          activeElement.innerText || activeElement.textContent || "";
        if (currentContent.trim() === "") {
          console.log(
            " Verification: Element seems empty after Delete simulation."
          );
        } else {
          console.warn(
            ` Verification: Element still contains text (${currentContent.length} chars) after Delete simulation.`
          );
        }
      } // --- End of replaceAll block ---

      // --- Step 2: Insert New Text ---
      // Always attempt to insert the new text now.
      // If replaceAll was true, this should insert into the (hopefully) cleared element.
      // If replaceAll was false, this inserts at the current cursor position.
      // Prioritizing paste simulation as it worked better previously.

      let insertionSuccess = false;
      console.log("Proceeding with text insertion attempt...");

      // Method 1: Simulate Paste Event (Most promising based on prior tests)
      console.log("Attempting to simulate paste event for insertion...");
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", text);
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dataTransfer,
        });
        activeElement.dispatchEvent(pasteEvent);
        // Triggering 'input' event after paste seems necessary for some frameworks/editors
        setTimeout(() => {
          activeElement.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true })
          );
        }, 0);
        console.log("Paste simulation dispatched.");
        insertionSuccess = true; // Assume success if dispatch didn't error
      } catch (pasteError) {
        console.error("Error simulating paste event:", pasteError);
      }

      // Method 2: execCommand('insertText') - Fallback (mainly for !replaceAll)
      if (!insertionSuccess && !replaceAll) {
        console.log(
          'Paste sim failed. Trying document.execCommand("insertText")...'
        );
        if (document.execCommand("insertText", false, text)) {
          activeElement.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true })
          );
          console.log('Success using document.execCommand("insertText").');
          insertionSuccess = true;
        } else {
          console.warn('document.execCommand("insertText") failed.');
        }
      }

      // Method 3: execCommand('insertHTML') - Fallback
      if (!insertionSuccess) {
        const htmlText = text.replace(/\n/g, "<br>");
        console.log(
          'Paste/insertText failed. Trying document.execCommand("insertHTML")...'
        );
        if (document.execCommand("insertHTML", false, htmlText)) {
          activeElement.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true })
          );
          console.log('Success using document.execCommand("insertHTML").');
          insertionSuccess = true;
        } else {
          console.warn('document.execCommand("insertHTML") failed.');
        }
      }

      // Method 4: Final Fallback (innerHTML - Only if replaceAll intended & others failed)
      if (!insertionSuccess && replaceAll) {
        console.warn(
          "All insertion methods failed after key simulation. Falling back to direct innerHTML replacement."
        );
        const htmlText = text.replace(/\n/g, "<br>");
        activeElement.innerHTML = htmlText;
        // Attempt to move cursor to end
        try {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(activeElement);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {
          console.error("Error setting cursor after innerHTML", e);
        }
        insertionSuccess = true;
      }

      if (!insertionSuccess) {
        console.error(
          "All methods failed to clear/insert text in contentEditable."
        );
      }
      return insertionSuccess;
    } else {
      console.log(
        "Active element is not an input, textarea, or contentEditable."
      );
      return false;
    }
  } catch (e) {
    console.error("Error in insertText function:", e);
    return false;
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
