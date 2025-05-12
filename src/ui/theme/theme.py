from PyQt6.QtGui import QColor
    
THEME = {
    "dark": {
        # Base colors
        "background": QColor(18, 18, 18, 20),
        "surface": QColor(30, 30, 30, 255),
        "primary": QColor(98, 0, 238, 255),
        "secondary": QColor(3, 218, 197, 255),
        
        # Text colors
        "text_primary": QColor(255, 255, 255, 255),
        "text_secondary": QColor(255, 255, 255, 180),
        "text_disabled": QColor(255, 255, 255, 100),
        
        # State colors
        "error": QColor(255, 82, 82, 255),
        "success": QColor(76, 175, 80, 255),
        "warning": QColor(255, 152, 0, 255),
        "info": QColor(33, 150, 243, 255),
        
        # Component-specific colors
        "button": {
            "background": QColor(98, 0, 238, 255),
            "text": QColor(255, 255, 255, 255),
            "hover": QColor(118, 20, 258, 255),
            "pressed": QColor(78, 0, 218, 255),
        },
        "input": {
            "background": QColor(45, 45, 45, 255),
            "border": QColor(98, 0, 238, 255),
            "text": QColor(255, 255, 255, 255),
        }
    },
    "light": {
        # Base colors
        "background": QColor(255, 255, 255, 20),
        "surface": QColor(245, 245, 245, 255),
        "primary": QColor(98, 0, 238, 255),
        "secondary": QColor(3, 218, 197, 255),
        
        # Text colors
        "text_primary": QColor(0, 0, 0, 255),
        "text_secondary": QColor(0, 0, 0, 180),
        "text_disabled": QColor(0, 0, 0, 100),
        
        # State colors
        "error": QColor(211, 47, 47, 255),
        "success": QColor(46, 125, 50, 255),
        "warning": QColor(237, 108, 2, 255),
        "info": QColor(2, 136, 209, 255),
        
        # Component-specific colors
        "button": {
            "background": QColor(98, 0, 238, 255),
            "text": QColor(255, 255, 255, 255),
            "hover": QColor(118, 20, 258, 255),
            "pressed": QColor(78, 0, 218, 255),
        },
        "input": {
            "background": QColor(255, 255, 255, 255),
            "border": QColor(98, 0, 238, 255),
            "text": QColor(0, 0, 0, 255),
        }
    }
}