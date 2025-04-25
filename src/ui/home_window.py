import sys
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                           QLabel, QPushButton, QHBoxLayout, QStackedWidget)
from PyQt6.QtCore import Qt, QPointF, QSettings
from PyQt6.QtGui import QPixmap
import platform
from src.ui.onboarding import OnboardingWindow

# --- Platform specific code for macOS ---
_ns_window = None
if sys.platform == 'darwin':
    try:
        import objc
        from AppKit import NSWindow, NSView, NSColor, NSWindowTitleHidden, NSFullSizeContentViewWindowMask
        from ctypes import c_void_p
        print("PyObjC found. Applying native macOS styling.")
        _objc_available = True
    except ImportError:
        print("PyObjC framework (pyobjc-framework-Cocoa) not found. Cannot apply native macOS styling.")
        _objc_available = False
else:
    _objc_available = False

class HomeWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

        # Apply native macOS styling
        if _objc_available:
            try:
                view_id_sip = self.winId()
                view_address = int(view_id_sip)
                view_ptr = c_void_p(view_address)
                ns_view = objc.objc_object(c_void_p=view_ptr)
                global _ns_window
                _ns_window = ns_view.window()

                if _ns_window:
                    _ns_window.setTitlebarAppearsTransparent_(True)
                    _ns_window.setStyleMask_(_ns_window.styleMask() | NSFullSizeContentViewWindowMask)
                else:
                    print("Warning: Could not get NSWindow object.")
            except Exception as e:
                print(f"Error applying native styling: {e}")

        # Main widget and layout
        main_widget = QWidget()
        main_layout = QHBoxLayout(main_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        self.setCentralWidget(main_widget)

        # Left menu panel
        menu_panel = QWidget()
        menu_panel.setFixedWidth(220)
        menu_panel.setStyleSheet("""
            QWidget {
                background-color: #F5F5F7;
            }
        """)
        menu_layout = QVBoxLayout(menu_panel)
        menu_layout.setContentsMargins(0, 0, 0, 0)
        menu_layout.setSpacing(0)

        # Logo container at the top of menu
        logo_container = QWidget()
        logo_container.setFixedHeight(80)  # Increased height
        logo_container.setStyleSheet("""
            QWidget {
                background-color: transparent;
                border: none;
            }
        """)
        logo_layout = QHBoxLayout(logo_container)
        logo_layout.setContentsMargins(0, 0, 0, 0)  # Remove margins to allow center alignment
        logo_layout.setSpacing(12)  # Increased spacing between logo and text

        # Center container for logo and name
        center_container = QWidget()
        center_layout = QHBoxLayout(center_container)
        center_layout.setContentsMargins(0, 0, 0, 0)
        center_layout.setSpacing(12)

        # Logo
        logo_label = QLabel()
        logo_path = "inten-logo.png"
        logo_pixmap = QPixmap(logo_path)
        if not logo_pixmap.isNull():
            scaled_pixmap = logo_pixmap.scaled(32, 32, Qt.AspectRatioMode.KeepAspectRatio, 
                                             Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(scaled_pixmap)
        else:
            logo_label.setText("🎯")
            logo_label.setStyleSheet("""
                font-size: 24px;
                border: none;
            """)
        center_layout.addWidget(logo_label)

        # App name
        app_name = QLabel("Inten")
        app_name.setStyleSheet("""
            font-size: 16px;
            font-weight: 600;
            color: #1C1C1E;
            border: none;
        """)
        center_layout.addWidget(app_name)

        # Add the centered container to the main logo layout
        logo_layout.addWidget(center_container, alignment=Qt.AlignmentFlag.AlignCenter)
        menu_layout.addWidget(logo_container)

        # Menu buttons
        self.settings_button = QPushButton("Settings")
        self.settings_button.setCheckable(True)
        self.settings_button.setChecked(True)
        self.settings_button.clicked.connect(lambda: self.show_page(0))
        self.settings_button.setStyleSheet("""
            QPushButton {
                text-align: left;
                padding: 8px 16px;
                border: none;
                border-radius: 0;
                font-size: 13px;
                font-weight: 500;
                color: #1C1C1E;
                background-color: transparent;
            }
            QPushButton:hover {
                background-color: #E5E5EA;
            }
            QPushButton:checked {
                background-color: white;
                color: #0A84FF;
                border-left: 2px solid #0A84FF;
            }
        """)
        menu_layout.addWidget(self.settings_button)

        # Add stretch to push everything up
        menu_layout.addStretch()

        # Content area
        content_widget = QWidget()
        content_widget.setStyleSheet("""
            QWidget {
                background-color: white;
                border: none;
            }
        """)
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(40, 40, 40, 40)

        # Stacked widget to handle different pages
        self.stacked_widget = QStackedWidget()
        
        # Settings page (placeholder)
        settings_page = QWidget()
        settings_layout = QVBoxLayout(settings_page)
        settings_title = QLabel("Settings")
        settings_title.setStyleSheet("""
            font-size: 24px;
            font-weight: 600;
            color: #1C1C1E;
            margin-bottom: 20px;
            border: none;
        """)
        settings_layout.addWidget(settings_title)
        
        # Add Reset All button
        reset_button = QPushButton("Reset All")
        reset_button.setFixedWidth(120)  # Set a fixed width for the button
        reset_button.clicked.connect(self.reset_all_settings)
        reset_button.setStyleSheet("""
            QPushButton {
                background-color: #FF3B30;
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                margin-top: 20px;
            }
            QPushButton:hover {
                background-color: #FF453A;
            }
        """)
        settings_layout.addWidget(reset_button)
        
        settings_layout.addStretch()
        
        self.stacked_widget.addWidget(settings_page)
        content_layout.addWidget(self.stacked_widget)

        # Add panels to main layout
        main_layout.addWidget(menu_panel)
        main_layout.addWidget(content_widget)

        # Set window background to match the split design
        self.setStyleSheet("""
            QMainWindow {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #F5F5F7,
                    stop:0.244 #F5F5F7,
                    stop:0.245 white,
                    stop:1 white
                );
            }
        """)

    def show_page(self, index):
        self.stacked_widget.setCurrentIndex(index)

    def reset_all_settings(self):
        """Reset all settings and restart the onboarding process."""
        # Clear all settings
        settings = QSettings(SettingsWindow.ORGANIZATION_NAME, SettingsWindow.APPLICATION_NAME)
        settings.clear()
        settings.sync()  # Ensure settings are saved
        
        # Create and show new onboarding window
        self.onboarding_window = SettingsWindow()
        self.onboarding_window.show()
        
        # Close the current window
        self.close() 