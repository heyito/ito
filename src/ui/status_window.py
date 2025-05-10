import sys
from enum import Enum, auto
from PyQt6.QtCore import Qt, QPoint, QPropertyAnimation, QEasingCurve, QRectF, QTimer
from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout, QGraphicsOpacityEffect
from PyQt6.QtGui import QPainter, QPainterPath, QRegion, QFontMetrics
from src.types.status_messages import StatusMessage
from src.ui.components.inten_layout import MacBlur
import queue
import time

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
    ANIMATION_DURATION = 150
    BORDER_WIDTH = 1
    DOT_OPACITY = 0
    PILL_OPACITY = 1.0  # 100% opacity for pill
    STATUS_DELAY = 350  # Delay between non-READY status changes in ms

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

        # Container for the label
        self.container = QWidget(self)
        self.container.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.container.setAutoFillBackground(False)
        self.container_layout = QVBoxLayout(self.container)
        self.container_layout.setContentsMargins(0, 0, 0, 0)
        self.container_layout.setSpacing(0)

        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.opacity_effect = QGraphicsOpacityEffect(self.status_label)
        self.status_label.setGraphicsEffect(self.opacity_effect)
        self.container_layout.addWidget(self.status_label)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(self.container)

        dot_total = self.DOT_SIZE + 2 * self.BORDER_WIDTH
        self.setFixedHeight(dot_total)
        self.container.setFixedHeight(dot_total)
        self.status_label.setMinimumHeight(dot_total)
        self.status_label.setMaximumHeight(dot_total)
        self._set_label_style(dot_total, 10)
        self._current_state = StatusMessage.READY.value
        self._animation = None
        self._opacity_animation = None
        self.radius = 3
        self._status_start_time = time.time()  # Track when current status started

        # Status queue and timer for delayed updates
        self._status_queue = queue.Queue()
        self._pending_status = None
        self._status_timer = QTimer(self)
        self._status_timer.timeout.connect(self._process_status_queue)
        self._status_timer.start(50)  # Check queue every 50ms

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

    def _process_status_queue(self):
        """Process the status queue with appropriate delays."""
        try:
            # If we have a pending status, don't process new ones
            if self._pending_status is not None:
                return

            if not self._status_queue.empty():
                status = self._status_queue.get_nowait()
                if isinstance(status, StatusMessage):
                    status = status.value
                
                print(f"Current status: {self._current_state}, Status start time: {self._status_start_time}")
                # If current state is READY update immediately
                if self._current_state == StatusMessage.READY.value:
                    self._apply_status_update(status)
                else:
                    # Check if current status has been showing long enough
                    current_status_duration = (time.time() - self._status_start_time) * 1000  # Convert to ms
                    if current_status_duration >= self.STATUS_DELAY:
                        # If status has been showing long enough, update immediately
                        self._apply_status_update(status)
                    else:
                        # For non-READY transitions, use a delayed update
                        self._pending_status = status
                        remaining_delay = max(0, self.STATUS_DELAY - current_status_duration)
                        QTimer.singleShot(int(remaining_delay), self._apply_pending_status)
        except queue.Empty:
            pass
        except Exception as e:
            print(f"Error processing status queue: {e}")

    def _apply_pending_status(self):
        """Apply the pending status update and clear it."""
        if self._pending_status is not None:
            self._apply_status_update(self._pending_status)
            self._pending_status = None

    def _apply_status_update(self, status: str):
        """Apply the status update to the UI."""
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
        self._status_start_time = time.time()  # Update the start time for the new status

    def update_status(self, status: str | StatusMessage, is_error: bool = False):
        """Queue a status update for processing."""
        if isinstance(status, StatusMessage):
            status = status.value
        self._status_queue.put(status)

    def _set_label_style(self, width, border_radius):
        self.status_label.setStyleSheet(f"""
            QLabel {{
                color: #FFFFFF;
                font-size: 13px;
                font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                min-width: {width}px;
                max-width: {width}px;
                min-height: {self.DOT_SIZE + 2 * self.BORDER_WIDTH}px;
                max-height: {self.DOT_SIZE + 2 * self.BORDER_WIDTH}px;
                border-radius: {border_radius}px;
                margin-left: 0px;
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
        dot_total = 0
        self.status_label.setMinimumWidth(dot_total)
        self.status_label.setMaximumWidth(dot_total)
        self.status_label.setMinimumHeight(dot_total)
        self.status_label.setMaximumHeight(dot_total)
        self._set_label_style(dot_total, 10)
        self.container.setFixedWidth(dot_total)
        self.container.setFixedHeight(dot_total)
        self.setFixedWidth(dot_total)
        self.setFixedHeight(dot_total)
        self.opacity_effect.setOpacity(self.DOT_OPACITY)
        self.update_position()

    def _get_text_width(self, text):
        metrics = QFontMetrics(self.status_label.font())
        text_width = metrics.horizontalAdvance(text)
        padding = 60
        buffer = 4    # Small buffer for safety
        min_width = 60
        return max(text_width + padding + buffer, min_width)

    def show_pill(self, text):
        self.status_label.setText(text)
        pill_width = self._get_text_width(text)
        dot_total = self.DOT_SIZE + 2 * self.BORDER_WIDTH
        self.status_label.setMinimumWidth(pill_width)
        self.status_label.setMaximumWidth(pill_width)
        self.status_label.setMinimumHeight(dot_total)
        self.status_label.setMaximumHeight(dot_total)
        self._set_label_style(pill_width, 10)
        self.container.setFixedWidth(pill_width)
        self.container.setFixedHeight(dot_total)
        self.setFixedWidth(pill_width)
        self.setFixedHeight(dot_total)
        self.opacity_effect.setOpacity(self.PILL_OPACITY)
        self.update_position()

    def animate_to_pill(self, text):
        self.status_label.setText(text)
        end_width = self._get_text_width(text)
        self._animate_label(self.DOT_SIZE + 2 * 10, end_width)

    def animate_to_dot(self):
        current_text = self.status_label.text()
        start_width = self._get_text_width(current_text)
        self._animate_label(start_width, self.DOT_SIZE + 2 * 10, clear_text=True)

    def _animate_label(self, start_width, end_width, clear_text=False):
        if self._animation:
            self._animation.stop()
        if self._opacity_animation:
            self._opacity_animation.stop()

        self._animation = QPropertyAnimation(self.status_label, b"minimumWidth")
        self._animation.setDuration(self.ANIMATION_DURATION)
        self._animation.setStartValue(start_width)
        self._animation.setEndValue(end_width)
        self._animation.setEasingCurve(QEasingCurve.Type.OutCubic)

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
            dot_total = self.DOT_SIZE + 2 * self.BORDER_WIDTH
            self._set_label_style(width, 10)
            self.status_label.setMinimumHeight(dot_total)
            self.status_label.setMaximumHeight(dot_total)
            self.container.setFixedWidth(width)
            self.container.setFixedHeight(dot_total)
            self.setFixedWidth(width)
            self.setFixedHeight(dot_total)
            self.update_position()

        self._animation.valueChanged.connect(on_value_changed)

        def on_finished():
            if clear_text:
                self.status_label.setText("")
                self.show_dot()
            else:
                self.show_pill(self.status_label.text())

        self._animation.finished.connect(on_finished)
        
        self._animation.start()
        self._opacity_animation.start()

    def _container_paintEvent(self, event):
        painter = QPainter(self.container)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.container.rect()
        path = QPainterPath()
        path.addRoundedRect(QRectF(rect), self.radius, self.radius)
        painter.setClipPath(path)
        grad = self._make_background_color(rect)
        painter.fillPath(path, grad)
        painter.end()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        # Set rounded mask for the window if this is a top-level window
        if self.isWindow():
            rect = QRectF(0, 0, self.width(), self.height())
            path = QPainterPath()
            path.addRoundedRect(rect, self.radius, self.radius)
            region = QRegion(path.toFillPolygon().toPolygon())
            self.setMask(region)
            MacBlur(self.container, self.radius)
        # Also update container size
        self.container.setFixedSize(self.size())

    def showEvent(self, event):
        super().showEvent(event)
        self.container.update()

    def _make_background_color(self, rect):
        from PyQt6.QtGui import QColor
        return QColor(0, 0, 0, 0)
