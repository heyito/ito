from typing import Dict, Optional

# System prompt for the LLM
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
You are an intelligent UI agent tasked with finding the best way to achieve the user's goal
given the available UI and OCR information.

You are given a JSON containing the following information:
- A list of accessibility elements, each with role, label, and screen frame coordinates.
- A list of OCR-recognized texts, each with screen coordinates.
- A list of best guess mappings from OCR texts to accessibility elements.
- The screen size.

Your job is to decide:
1. **WHAT to do** based on the user's goal (e.g., click a button, type into a text field).
2. **WHERE to perform it**, using the available UI and OCR information.

**Rules:**
- Always prefer "accessibility_elements" with full information(roles, labels) when available.
- There will be two additional fields: "ocr_to_element_mappings" and "ocr_texts"
    - "ocr_texts" is a list of coordinate mappings of the text found on the screen
    - "ocr_to_element_mappings" is a best estimate of which accessibility element found the OCR text belongs to
    - Given these lists, it is your job to decide (if there was no accessibility element found) 
     which is best to use. The text, or the mapped AX element given the intent AND the distance given. 
     If the distance is very high for example its likely safer to use the text if the intent is to click. 
- If clicking, you must specify a (centerX, centerY) screen coordinate.
- If typing, you must specify a (centerX, centerY) *and* a text string.
- If no reasonable action can be taken, respond with `{ "action": "none" }`.

You have access to tools like:
- Clicking a location
- Typing or replacing text
- Pressing keys
Choose the tool that best helps the user accomplish their task.

If no clear or safe action can be taken, you may choose no action.

Reason carefully before choosing an action.

When solving multi-step tasks, generate multiple tool calls as needed, each corresponding to one atomic interaction step.

You must return all tool calls required to accomplish the goal in one response.

If a task requires clicking and then typing, return both tool calls together.
Always return tool calls in the exact sequence the actions should occur.
"""

class PromptTemplate:
    def __init__(self, sections: Dict[str, str]):
        self.sections = sections

    def format(self, **kwargs) -> str:
        """Format the template with the provided values."""
        formatted_sections = []
        for section_name, section_template in self.sections.items():
            if section_name in kwargs:
                formatted_sections.append(section_template.format(**kwargs))
        return "\n\n".join(formatted_sections)

# Define the base templates
CHROME_PROMPT_TEMPLATE = PromptTemplate({
    "application": "[APPLICATION]\n{application}",
    "page": "[PAGE]\n{url}\n{title}",
    "content": "[START CURRENT DOCUMENT CONTENT]\n{content}\n[END CURRENT DOCUMENT CONTENT]",
    "command": "[USER COMMAND]\n{command}"
})

GENERAL_DOCUMENT_BODY_TEMPLATE = PromptTemplate({
    "application": "[APPLICATION]\n{application}",
    "content": "[START CURRENT DOCUMENT CONTENT]\n{content}\n[END CURRENT DOCUMENT CONTENT]",
    "command": "[USER COMMAND]\n{command}"
})

NOTES_PROMPT_TEMPLATE = PromptTemplate({
    "content": "[START CURRENT NOTES CONTENT]\n{content}\n[END CURRENT NOTES CONTENT]",
    "command": "[USER COMMAND]\n{command}"
})

def create_notes_prompt(content: str, command: str) -> str:
    """Create a prompt for Notes context."""
    return NOTES_PROMPT_TEMPLATE.format(
        content=content,
        command=command
    )

def create_chrome_prompt(
    url: str,
    title: str,
    content: str,
    command: str,
    selected_text: Optional[str] = None
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
        command=command
    )

def create_general_document_body_prompt(
    application: str,
    content: str,
    command: str
) -> str:
    """Create a prompt for TextEdit context."""
    return GENERAL_DOCUMENT_BODY_TEMPLATE.format(
        application=application,
        content=content,
        command=command
    )

def create_macos_ax_ocr_prompt(context: dict, command: str) -> str:
    """Create a prompt for MacOS context."""
    return f"""
    User intent command:
    {command}

    Current UI context:
    {context}
    """

def get_active_element_content(chrome_context: dict) -> str:
    """Extract the content from the active element in Chrome context."""
    if chrome_context.get('activeElement', {}).get('isContentEditable'):
        return chrome_context.get('activeElementValue', '')
    elif chrome_context.get('activeElement', {}).get('isTextInput'):
        return chrome_context.get('activeElement', {}).get('value', '')
    return '' 
