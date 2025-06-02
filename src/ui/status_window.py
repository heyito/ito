import logging
import queue
import sys
import time
from ctypes import c_void_p

from PySide6.QtCore import QEasingCurve, QPropertyAnimation, Qt, QTimer
from PySide6.QtWidgets import QGraphicsOpacityEffect, QLabel, QVBoxLayout, QWidget

from src.types.status_messages import StatusMessage

# Configure logging
logger = logging.getLogger(__name__)

if sys.platform == "darwin":
    try:
        from ctypes import c_void_p

        import objc
        from AppKit import (
            NSFullSizeContentViewWindowMask,
            NSWindowCollectionBehaviorCanJoinAllSpaces,
            NSWindowCollectionBehaviorFullScreenAllowsTiling,
            NSWindowCollectionBehaviorFullScreenAuxiliary,
            NSWindowCollectionBehaviorIgnoresCycle,
            NSWindowCollectionBehaviorStationary,
            NSWindowCollectionBehaviorTransient,
        )

        _objc_available = True
    except ImportError:
        logger.warning("PyObjC framework not found. Cannot apply native macOS styling.")
        _objc_available = False
else:
    _objc_available = False


class StatusWindow(QWidget):
    DOT_SIZE = 40
    PILL_WIDTH = 300
    ANIMATION_DURATION = 250
    BORDER_WIDTH = 1
    DOT_OPACITY = 0
    PILL_OPACITY = 1.0  # 100% opacity for pill
    STATUS_DELAY = 1000  # Delay between non-READY status changes in ms
    ERROR_RESET_DELAY = 3000  # 3 seconds delay before resetting error status

    def __init__(self):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.Tool
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.NoDropShadowWindowHint
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
        self.status_label.setWordWrap(True)
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
        self._error_reset_timer = QTimer(self)
        self._error_reset_timer.setSingleShot(True)
        self._error_reset_timer.timeout.connect(self._reset_error_status)

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
                        NSWindowCollectionBehaviorCanJoinAllSpaces
                        | NSWindowCollectionBehaviorStationary
                        | NSWindowCollectionBehaviorTransient
                        | NSWindowCollectionBehaviorIgnoresCycle
                        | NSWindowCollectionBehaviorFullScreenAuxiliary
                        | NSWindowCollectionBehaviorFullScreenAllowsTiling
                    )
                    ns_window.setCollectionBehavior_(collection_behavior)
                    ns_window.setTitlebarAppearsTransparent_(True)
                    ns_window.setStyleMask_(
                        ns_window.styleMask() | NSFullSizeContentViewWindowMask
                    )
                    ns_window.setIgnoresMouseEvents_(True)
                    ns_window.setHidesOnDeactivate_(False)
                    ns_window.setMovableByWindowBackground_(False)
                    ns_window.setMovable_(False)
            except Exception as e:
                logger.error(f"Error applying native macOS window behavior: {e}")
                import traceback

                logger.debug(traceback.format_exc())

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

                if self._current_state == StatusMessage.READY.value:
                    self._apply_status_update(status)
                else:
                    # Check if current status has been showing long enough
                    current_status_duration = (
                        time.time() - self._status_start_time
                    ) * 1000  # Convert to ms
                    if current_status_duration >= self.STATUS_DELAY:
                        # If status has been showing long enough, update immediately
                        self._apply_status_update(status)
                    else:
                        # For non-READY transitions, use a delayed update
                        self._pending_status = status
                        remaining_delay = max(
                            0, self.STATUS_DELAY - current_status_duration
                        )
                        QTimer.singleShot(
                            int(remaining_delay), self._apply_pending_status
                        )
        except queue.Empty:
            pass
        except Exception as e:
            logger.error(f"Error processing status queue: {e}")

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
            self._error_reset_timer.stop()  # Stop any pending error reset
        else:
            if self._current_state == StatusMessage.READY.value:
                self.animate_to_pill(status)
            else:
                self.show_pill(status)
            # Only start the error reset timer if the status contains "Error"
            if "Error" in status:
                self._error_reset_timer.start(self.ERROR_RESET_DELAY)
        self._current_state = status
        self._status_start_time = (
            time.time()
        )  # Update the start time for the new status

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
                background-color: #242322;
                font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                border-radius: {border_radius}px;
                padding: 4px 8px;
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
            y = (
                screen_geometry.height()
                - window_geometry.height()
                - dock_height
                - margin
            )
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
        self.status_label.setWordWrap(True)

        max_width = 600
        padding = 20
        metrics = self.status_label.fontMetrics()
        lines = text.split("\n")
        longest_line = max(lines, key=len)

        text_width = min(metrics.horizontalAdvance(longest_line) + padding, max_width)
        text_height = metrics.height() + (text.count("\n") * metrics.height())

        self.status_label.setMinimumWidth(text_width)
        self.status_label.setMaximumWidth(max_width)
        self.status_label.setMinimumHeight(text_height + 10)
        self.status_label.setMaximumHeight(text_height + 50)

        self._set_label_style(text_width, 10)
        self.setFixedWidth(text_width + 2 * self.BORDER_WIDTH)
        self.setFixedHeight(text_height + self.DOT_SIZE)
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

    def _reset_error_status(self):
        """Reset the status to READY after an error."""
        self.update_status(StatusMessage.READY)
