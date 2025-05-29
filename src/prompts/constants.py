START_SELECTED_CONTENT_MARKER = "[SELECTED CONTENT]"
END_SELECTED_CONTENT_MARKER = "[/SELECTED CONTENT]"
PAGE_MARKER = "[PAGE]"
APPLICATION_MARKER = "[APPLICATION]"
USER_COMMAND_MARKER = "[USER COMMAND]"
START_CONTEXT_MARKER = "[CONTEXT]"
END_CONTEXT_MARKER = "[/CONTEXT]"
OCR_AX_REPORT_SCHEMA = """
The UI context information you receive is in a compact JSON format. Here is a description of the shorthand keys used:

**Top-Level Keys in the JSON:**
- "application": (String) The name of the frontmost application.
- "window": (String) The title of the focused window.
- "accessibility_elements": (Array) A list of UI accessibility elements.
- "ocr_texts": (Array) A list of texts recognized via OCR.
- "screen_dimensions": (Object) Contains width and height of the main screen.

**Keys within each Element Object in the "el" Array:**
- "ro": (String) The accessibility role of the element (e.g., "Button", "TextField"). Meaning: 'role'.
- "fr": (Array) The element's frame as `[x, y, width, height]` in screen coordinates. Meaning: 'frame'.
- "lab": (Object - Optional) Descriptive labels for the element. Meaning: 'labels'. Keys within "lab" include:
    - "tit": (String) The primary title or visible text. Meaning: 'title'.
    - "des": (String) A more detailed description. Meaning: 'description'.
    - "hlp": (String) Help text or tooltip. Meaning: 'help'.
    - "plc": (String) Placeholder text for input fields. Meaning: 'placeholder'.
    - "id": (String) A unique accessibility identifier. Meaning: 'identifier'.
- "en": (Boolean) True if the element is enabled, false otherwise. Meaning: 'is_enabled'.
- "foc": (Boolean) True if the element is currently focused, false otherwise. Meaning: 'is_focused'.
- "sel": (Boolean) True if the element is selected (e.g., a tab or list item), false otherwise. Meaning: 'is_selected'.
- "val": (String, Number, or Boolean - Optional) The current value of the element. Meaning: 'current_value'.
- "chec": (Boolean - Optional) True if a checkbox or radio button is checked, false otherwise. Meaning: 'is_checked'.
- for the "en" key, "foc" key, "sel" key, and "chec" key: 
  - The values will be "t" or "f" for true or false, respectively.

**Keys within each OCR Object in the "ot" Array:**
- "txt": (String) The recognized text string. Meaning: 'text'.
- "bnd": (Array) The text's bounding box as `[x, y, width, height]` in screen coordinates. Meaning: 'bounds'.
- "conf": (Float, 0.0 to 1.0) The OCR engine's confidence score. Meaning: 'confidence'.
- "mat_el_idx": (Integer - Optional) If present, the 0-based index of the matched element in the "accessibility_elements" array. Meaning: 'matched_element_index'.
- "mat_dist": (Float - Optional) If "mat_el_idx" is present, the geometric distance to the matched element. Meaning: 'match_distance'.

**Miscenllaneous Keys:**
- "w": (Integer) The width of something in pixels.
- "h": (Integer) The height of something in pixels.

Please use this information to understand the structure of the UI and respond to the user's intent.
"""
