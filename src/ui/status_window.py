import sys
from enum import Enum, auto
from PyQt6.QtCore import Qt, QPoint, QPropertyAnimation, QEasingCurve, QSize, QTimer, QObject
from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout, QGraphicsOpacityEffect
from PyQt6.QtGui import QColor, QPalette
from src.types.status_messages import StatusMessage

if sys.platform == 'darwin':
    try:
        from ctypes import c_void_p
        import objc
        from AppKit import (
            NSWindow,
            NSWindowCollectionBehavior,
            NSWindowLevel,
            NSWindowStyleMask,
            NSWindowTitleHidden,
            NSFullSizeContentViewWindowMask,
            NSWindowCollectionBehaviorCanJoinAllSpaces,
            NSWindowCollectionBehaviorStationary,
            NSWindowCollectionBehaviorTransient,
            NSWindowCollectionBehaviorIgnoresCycle,
            NSWindowCollectionBehaviorFullScreenAuxiliary,
            NSWindowCollectionBehaviorFullScreenAllowsTiling,
        )
        _objc_available = True
    except ImportError:
        print("PyObjC framework not found. Cannot apply native macOS styling.")
        _objc_available = False
else:
    _objc_available = False

class StatusWindow(QWidget):
    DOT_SIZE = 40
    PILL_WIDTH = 300
    ANIMATION_DURATION = 750
    BORDER_WIDTH = 1
    DOT_OPACITY = 0  # 30% opacity for dot
    PILL_OPACITY = 1.0  # 100% opacity for pill

    def __init__(self):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.Tool |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.NoDropShadowWindowHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Add opacity effect
        self.opacity_effect = QGraphicsOpacityEffect(self.status_label)
        self.status_label.setGraphicsEffect(self.opacity_effect)
        
        layout.addWidget(self.status_label)

        dot_total = self.DOT_SIZE + 2 * self.BORDER_WIDTH
        self.setFixedHeight(dot_total)
        self.status_label.setMinimumHeight(dot_total)
        self.status_label.setMaximumHeight(dot_total)
        self._set_label_style(dot_total, 10)
        self._current_state = StatusMessage.READY.value
        self._animation = None
        self._opacity_animation = None

        if _objc_available:
            try:
                view_id_sip = self.winId()
                view_address = int(view_id_sip)
                view_ptr = c_void_p(view_address)
                ns_view = objc.objc_object(c_void_p=view_ptr)
                ns_window = ns_view.window()
                if ns_window:
                    ns_window.setLevel_(25)
                    collection_behavior = (
                        NSWindowCollectionBehaviorCanJoinAllSpaces |
                        NSWindowCollectionBehaviorStationary |
                        NSWindowCollectionBehaviorTransient |
                        NSWindowCollectionBehaviorIgnoresCycle |
                        NSWindowCollectionBehaviorFullScreenAuxiliary |
                        NSWindowCollectionBehaviorFullScreenAllowsTiling
                    )
                    ns_window.setCollectionBehavior_(collection_behavior)
                    ns_window.setTitlebarAppearsTransparent_(True)
                    ns_window.setStyleMask_(ns_window.styleMask() | NSFullSizeContentViewWindowMask)
                    ns_window.setIgnoresMouseEvents_(True)
                    ns_window.setHidesOnDeactivate_(False)
                    ns_window.setMovableByWindowBackground_(False)
                    ns_window.setMovable_(False)
            except Exception as e:
                print(f"Error applying native macOS window behavior: {e}")
                import traceback
                traceback.print_exc()

        self.layout().activate()
        self.update_position()
        self.show_dot()

    def _set_label_style(self, width, border_radius):
        self.status_label.setStyleSheet(f"""
            QLabel {{
                color: #F2E4D6;
                font-size: 13px;
                background-color: #141538;
                font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                min-width: {width}px;
                max-width: {width}px;
                min-height: {self.DOT_SIZE + 2 * self.BORDER_WIDTH}px;
                max-height: {self.DOT_SIZE + 2 * self.BORDER_WIDTH}px;
                border-radius: {border_radius}px;
                padding-left: 0px;
                padding-right: 0px;
            }}
        """)

    def update_position(self):
        screen = self.screen()
        if screen:
            screen_geometry = screen.geometry()
            window_geometry = self.geometry()
            x = (screen_geometry.width() - window_geometry.width()) // 2
            dock_height = 70
            margin = 10
            y = screen_geometry.height() - window_geometry.height() - dock_height - margin
            self.move(x, y)

    def show_dot(self):
        self.status_label.setText("")
        dot_total = self.DOT_SIZE + 2 * self.BORDER_WIDTH
        self.status_label.setMinimumWidth(dot_total)
        self.status_label.setMaximumWidth(dot_total)
        self._set_label_style(dot_total, 10)
        self.setFixedWidth(dot_total)
        self.opacity_effect.setOpacity(self.DOT_OPACITY)
        self.update_position()

    def show_pill(self, text):
        self.status_label.setText(text)
        pill_total = self.PILL_WIDTH + 2 * self.BORDER_WIDTH
        self.status_label.setMinimumWidth(pill_total)
        self.status_label.setMaximumWidth(pill_total)
        self._set_label_style(pill_total, 10)
        self.setFixedWidth(pill_total)
        self.opacity_effect.setOpacity(self.PILL_OPACITY)
        self.update_position()

    def animate_to_pill(self, text):
        self.status_label.setText(text)
        self._animate_label(self.DOT_SIZE, self.PILL_WIDTH)

    def animate_to_dot(self):
        self._animate_label(self.PILL_WIDTH, self.DOT_SIZE, clear_text=True)

    def _animate_label(self, start_width, end_width, clear_text=False):
        if self._animation:
            self._animation.stop()
        if self._opacity_animation:
            self._opacity_animation.stop()

        # Width animation
        self._animation = QPropertyAnimation(self.status_label, b"minimumWidth")
        self._animation.setDuration(self.ANIMATION_DURATION)
        self._animation.setStartValue(start_width)
        self._animation.setEndValue(end_width)
        self._animation.setEasingCurve(QEasingCurve.Type.OutCubic)

        # Opacity animation
        self._opacity_animation = QPropertyAnimation(self.opacity_effect, b"opacity")
        self._opacity_animation.setDuration(self.ANIMATION_DURATION)
        if clear_text:  # Going to dot
            self._opacity_animation.setStartValue(self.PILL_OPACITY)
            self._opacity_animation.setEndValue(self.DOT_OPACITY)
        else:  # Going to pill
            self._opacity_animation.setStartValue(self.DOT_OPACITY)
            self._opacity_animation.setEndValue(self.PILL_OPACITY)
        self._opacity_animation.setEasingCurve(QEasingCurve.Type.OutCubic)

        def on_value_changed():
            width = int(self.status_label.minimumWidth())
            self._set_label_style(width, 10)
            self.setFixedWidth(width + 2 * self.BORDER_WIDTH)
            self.update_position()

        self._animation.valueChanged.connect(on_value_changed)

        def on_finished():
            if clear_text:
                self.status_label.setText("")
                self.show_dot()
            else:
                self.show_pill(self.status_label.text())

        self._animation.finished.connect(on_finished)
        
        # Start both animations
        self._animation.start()
        self._opacity_animation.start()

    def update_status(self, status: str | StatusMessage, is_error: bool = False):
        if isinstance(status, StatusMessage):
            status = status.value
        if status == StatusMessage.READY.value:
            if self._current_state != StatusMessage.READY.value:
                self.animate_to_dot()
            else:
                self.show_dot()
        else:
            if self._current_state == StatusMessage.READY.value:
                self.animate_to_pill(status)
            else:
                self.show_pill(status)
        self._current_state = status 