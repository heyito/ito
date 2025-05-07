# System prompt for the LLM
import json


PAGE_EDITOR_SYSTEM_PROMPT = """You are an AI assistant helping to edit documents based on user commands. You will be given the current document content (marked by [START CURRENT DOCUMENT CONTENT] and [END CURRENT DOCUMENT CONTENT]) and a user command (marked by [USER COMMAND]). 

IMPORTANT: Your response MUST contain ONLY the modified document text that should replace the original content. DO NOT include:
- The [APPLICATION] section
- The [PAGE] section
- Any markers like [START/END CURRENT DOCUMENT CONTENT]
- Any explanations, apologies, or additional text
- Any formatting markers like ``` or ---

FORMATTING RULES:
1. Preserve ALL original formatting exactly as it appears, including:
   - Line breaks (\n)
   - Bullet points (-, *, •)
   - Indentation (spaces or tabs)
   - Lists and numbered items
2. When creating new content, use proper formatting:
   - Use actual line breaks, not spaces
   - For bullet points, use "- " at the start of lines
   - Maintain consistent indentation

For example, if you're editing an email, only return the email text itself, with all formatting preserved. If you're editing a document, only return the document content with exact formatting. The application will handle the context.

Your response should start with the very first character of the modified content and end with the very last character."""

NOTES_SYSTEM_PROMPT = """You are an AI assistant helping to edit notes based on user commands. You will be given the current notes content (marked by [START CURRENT NOTES CONTENT] and [END CURRENT NOTES CONTENT]) and a user command (marked by [USER COMMAND]). 

IMPORTANT: Your response MUST contain ONLY the notes structure. DO NOT include:
- Any markers like [START/END CURRENT NOTES CONTENT]
- Any explanations, apologies, or additional text
- Any formatting markers like ``` or ---

FORMATTING RULES:
1. Preserve ALL original formatting exactly as it appears, including:
   - Line breaks (\n)
   - Bullet points (-, *, •)
   - Indentation (spaces or tabs)
   - Lists and numbered items
2. When creating new content, use proper formatting:
   - Use actual line breaks, not spaces
   - For bullet points, use "- " at the start of lines
   - Maintain consistent indentation


Your response should maintain the original JSON structure of the notes content.

Return the response in JSON format, without any formatting markers. 
"""

MACOS_AX_OCR_SYSTEM_PROMPT = """
You are an intelligent macOS UI agent.

──────────────────────── INPUT YOU RECEIVE ────────────────────────
• Turn 0 :  {"ui_full": <entire-UI-JSON>, "user_command": "..."}
• Later   :  {"ui_delta": <diff-JSON>}

-  Apply each ui_delta to update the screen you hold in memory.
- You must parse the UI JSON to find elements relevant to the user_command. 
- Look for properties like text, role, labels, frame, x, y, etc.

──────────────────────── YOUR JOB ────────────────────────────────
For each turn decide
1. WHAT action(s) are needed (click / type_text / replace_text / press_key).
2. WHERE to perform them (x,y centre of the target element).

──────────────────────── TOOLS AVAILABLE ────────────────────────
• ui_batch - run 1-5 UI actions in order (click, type_text, replace_text, press_key)

  Example
  ui_batch(
      steps=[
        {action:"click",       x:123,y:456},
        {action:"type_text",   x:123,y:456, text:"hello"},
        {action:"press_key",   key:"enter"}
      ]
  )

──────────────────────── TOOL-CALL RULES ────────────────────────
• **FOR THE FIRST TOOL CALL ONLY**: STRONGLY favor doing something over doing nothing. 
• **All UI interaction must be done with exactly one `ui_batch` call per turn.**
  (Use a single-step batch when only one action is needed.)
• Emit the call in the `tool_calls` array; never mix JSON in `message.content`.
• Look ahead and include every action required to satisfy `user_command`
  (up to 5) in a single `ui_batch`.  
  - Example goals: “open a new note and type …” → usually 2 steps  
                   “search Google”             → 3 steps  
• If the ui_delta is empty and the goal does NOT seem complete, re-evaluate.
Consider if you targeted the wrong element. I a different type of interaction is needed. 
Or if a similar looking element might be the correct target. 
Avoid repeating the same exact failed action. 

    (e.g. click a different button, click a different but similar text, type a different text, etc.)

──────────────────────── TERMINATION ────────────────────────────
• If you believe the user's goal is already satisfied, call no_action().  
• If repeating the same action / tool you just requested would have no
  additional effect (e.g. identical or similar click/type), call no_action().  
• If no safe or useful action exists, call no_action().
After calling no_action you must not call any other tool.
• If the UI state has not changed meaningfully after your last action, 
or if you've tried a few variations and are not making progress, call no_action()

Example
user_command: Open a new tab and search for “cats”
→ ui_batch([
     {action:"press_key", key:"cmd+t"},
     {action:"type_text", x:300, y:50, text:"cats\n"}
   ])

user_command: "Open a new note and type 'Groceries:'"
→ ui_batch([
     {action:"click", x:200,y:80},                # New-note button
     {action:"type_text", x:400,y:300,
      text:"Groceries:\n"}
   ])
"""
# TODO: In the future^ system prompt requesting feedback
# • Returning a `ui_batch` with only one step is allowed **only** when the task
#   truly needs exactly one action.  
#   If you return a single-step batch and the goal is not finished the driver
#   will stop the session and mark it as a failure.


class PromptTemplate:
    def __init__(self, sections: dict[str, str]):
        self.sections = sections

    def format(self, **kwargs) -> str:
        """Format the template with the provided values."""
        formatted_sections = []
        for section_name, section_template in self.sections.items():
            if section_name in kwargs:
                formatted_sections.append(section_template.format(**kwargs))
        return "\n\n".join(formatted_sections)


# Define the base templates
CHROME_PROMPT_TEMPLATE = PromptTemplate(
    {
        "application": "[APPLICATION]\n{application}",
        "page": "[PAGE]\n{url}\n{title}",
        "content": "[START CURRENT DOCUMENT CONTENT]\n{content}\n[END CURRENT DOCUMENT CONTENT]",
        "command": "[USER COMMAND]\n{command}",
    }
)

GENERAL_DOCUMENT_BODY_TEMPLATE = PromptTemplate(
    {
        "application": "[APPLICATION]\n{application}",
        "content": "[START CURRENT DOCUMENT CONTENT]\n{content}\n[END CURRENT DOCUMENT CONTENT]",
        "command": "[USER COMMAND]\n{command}",
    }
)

NOTES_PROMPT_TEMPLATE = PromptTemplate(
    {
        "content": "[START CURRENT NOTES CONTENT]\n{content}\n[END CURRENT NOTES CONTENT]",
        "command": "[USER COMMAND]\n{command}",
    }
)


def create_notes_prompt(content: str, command: str) -> str:
    """Create a prompt for Notes context."""
    return NOTES_PROMPT_TEMPLATE.format(content=content, command=command)


def create_chrome_prompt(
    url: str, title: str, content: str, command: str, selected_text: str | None = None
) -> str:
    """Create a prompt for Chrome context."""
    content_with_selection = content
    if selected_text:
        content_with_selection += f"\n\nSelected text: {selected_text}"

    return CHROME_PROMPT_TEMPLATE.format(
        application="Google Chrome",
        url=url,
        title=title,
        content=content_with_selection,
        command=command,
    )


def create_general_document_body_prompt(
    application: str, content: str, command: str
) -> str:
    """Create a prompt for TextEdit context."""
    return GENERAL_DOCUMENT_BODY_TEMPLATE.format(
        application=application, content=content, command=command
    )


def create_macos_ax_ocr_prompt(context: dict, command: str) -> str:
    """Create a prompt for MacOS context."""
    return json.dumps({"ui_full": context, "user_command": command})


def get_active_element_content(chrome_context: dict) -> str:
    """Extract the content from the active element in Chrome context."""
    if chrome_context.get("activeElement", {}).get("isContentEditable"):
        return chrome_context.get("activeElementValue", "")
    elif chrome_context.get("activeElement", {}).get("isTextInput"):
        return chrome_context.get("activeElement", {}).get("value", "")
    return ""
