from PySide6.QtGui import QColor

THEME = {
    "dark": {
        # Base colors
        "background": QColor(0, 0, 0, 20),
        "surface": QColor(30, 30, 30, 255),
        "primary": QColor(98, 0, 238, 255),
        "secondary": QColor(3, 218, 197, 255),
        # Text colors
        "text_primary": QColor(255, 255, 255, 255),
        "text_secondary": QColor(255, 255, 255, 180),
        "text_disabled": QColor(255, 255, 255, 100),
        # Text reversed colors
        "text_reversed_primary": QColor(0, 0, 0, 255),
        "text_reversed_secondary": QColor(0, 0, 0, 180),
        "text_reversed_disabled": QColor(0, 0, 0, 100),
        # State colors
        "error": QColor(255, 82, 82, 255),
        "error_hover": QColor(245, 75, 75, 255),
        "success": QColor(76, 175, 80, 255),
        "warning": QColor(255, 152, 0, 255),
        "info": QColor(33, 150, 243, 255),
        # Component-specific colors
        "button": {
            "background": QColor(98, 0, 238, 255),
            "text": QColor(255, 255, 255, 255),
            "hover": QColor(118, 20, 255, 255),
            "pressed": QColor(78, 0, 218, 255),
        },
        "input": {
            "background": QColor(45, 45, 45, 255),
            "border": QColor(98, 0, 238, 255),
            "text": QColor(255, 255, 255, 255),
        },
        # Onboarding specific colors
        "onboarding": {
            "title": QColor(255, 255, 255, 255),
            "subtitle": QColor(255, 255, 255, 180),
            "shadow": QColor(0, 0, 0, 50),
            "button": {
                "background": QColor(246, 235, 221, 255),  # F6EBDD
                "text": QColor(24, 26, 42, 255),  # 181A2A
                "hover": QColor(243, 226, 199, 255),  # f3e2c7
                "disabled": QColor(243, 226, 199, 128),  # f3e2c7 with 50% opacity
                "disabled_text": QColor(176, 176, 176, 255),  # b0b0b0
            },
            "success": {
                "background": QColor(174, 233, 193, 255),  # AEE9C1
                "text": QColor(46, 125, 79, 255),  # 2E7D4F
            },
        },
    },
    "light": {
        # Base colors
        "background": QColor(255, 255, 255, 50),
        "surface": QColor(245, 245, 245, 255),
        "primary": QColor(98, 0, 238, 255),
        "secondary": QColor(3, 218, 197, 255),
        # Text colors
        "text_primary": QColor(0, 0, 0, 255),
        "text_secondary": QColor(0, 0, 0, 180),
        "text_disabled": QColor(0, 0, 0, 100),
        # Text reversed colors
        "text_reversed_primary": QColor(255, 255, 255, 255),
        "text_reversed_secondary": QColor(255, 255, 255, 180),
        "text_reversed_disabled": QColor(255, 255, 255, 100),
        # State colors
        "error": QColor(211, 47, 47, 255),
        "error_hover": QColor(255, 82, 82, 100),
        "success": QColor(46, 125, 50, 255),
        "warning": QColor(237, 108, 2, 255),
        "info": QColor(2, 136, 209, 255),
        # Component-specific colors
        "button": {
            "background": QColor(118, 20, 255, 255),  # Lighter purple
            "text": QColor(255, 255, 255, 255),
            "hover": QColor(138, 40, 255, 255),  # Even lighter on hover
            "pressed": QColor(98, 0, 238, 255),  # Original color when pressed
        },
        "input": {
            "background": QColor(255, 255, 255, 255),
            "border": QColor(98, 0, 238, 255),
            "text": QColor(0, 0, 0, 255),
        },
        # Onboarding specific colors
        "onboarding": {
            "title": QColor(24, 26, 42, 255),  # 181A2A
            "subtitle": QColor(24, 26, 42, 180),  # 181A2A with 70% opacity
            "shadow": QColor(0, 0, 0, 50),
            "button": {
                "background": QColor(246, 235, 221, 255),  # F6EBDD
                "text": QColor(24, 26, 42, 255),  # 181A2A
                "hover": QColor(243, 226, 199, 255),  # f3e2c7
                "disabled": QColor(100, 100, 100, 128),  # f3e2c7 with 50% opacity
                "disabled_text": QColor(176, 176, 176, 255),  # b0b0b0
            },
            "success": {
                "background": QColor(174, 233, 193, 255),  # AEE9C1
                "text": QColor(46, 125, 79, 255),  # 2E7D4F
            },
        },
    },
}
