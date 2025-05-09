from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QPushButton
from PyQt6.QtCore import Qt, QRectF
from PyQt6.QtGui import QPainter, QPainterPath, QRegion
import sys

class IntenLayout(QWidget):
    def __init__(self, parent=None, radius=8, show_close_button=False, close_callback=None):
        super().__init__(parent)
        self.radius = radius
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAutoFillBackground(False)
        self.setContentsMargins(0, 0, 0, 0)
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self._effective_top_margin = 40
        self._close_button = None
        self._close_callback = close_callback
        self._show_close_button = show_close_button
        self._mac_titlebar_offset = 0
        # macOS titlebar offset logic
        if sys.platform == 'darwin':
            try:
                from ctypes import c_void_p
                import objc
                from AppKit import NSFullSizeContentViewWindowMask
                win = self.window().winId() if self.window() else None
                if win:
                    ns_view = objc.objc_object(c_void_p(int(win)))
                    ns_window = ns_view.window()
                    if ns_window and (ns_window.styleMask() & NSFullSizeContentViewWindowMask):
                        self._mac_titlebar_offset = 30
            except Exception:
                self._mac_titlebar_offset = 0
        self._effective_top_margin = 40 + self._mac_titlebar_offset
        if show_close_button:
            self._add_close_button()
        self.setStyleSheet("""
            QWidget, QMainWindow {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            QLabel { 
                color: #F2E4D6; 
                background-color: transparent;
            }
            QPushButton {
                background-color: #F2E4D6;
                color: #141538;
                border: none;
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
            }
            QPushButton:hover {
                background-color: rgba(242, 228, 214, 0.8);
            }
            QPushButton:disabled {
                background-color: rgba(242, 228, 214, 0.3);
                color: rgba(224, 92, 92, 0.5);
            }
            QProgressBar {
                border: none;
                border-radius: 3px;
                text-align: center;
                background-color: rgba(242, 228, 214, 0.2);
                max-height: 6px;
                margin: 0px 2px;
            }
            QProgressBar::chunk {
                background-color: #F2E4D6;
                border-radius: 3px;
            }
            QWidget#permission_row {
                background-color: rgba(242, 228, 214, 0.1);
                border-radius: 10px;
                min-height: 60px;
                padding: 0px;
                margin: 0px;
            }
            QLabel#permission_status {
                font-size: 13px;
                font-weight: 500;
                padding-right: 16px;
            }
            QLabel#permission_text {
                font-size: 15px;
                color: #F2E4D6;
                font-weight: 400;
            }
            QLabel#permission_icon {
                font-size: 22px;
                min-width: 30px;
                margin-left: 16px;
            }
        """)

    def _add_close_button(self):
        close_button_container = QWidget(self)
        close_button_container.setGeometry(0, 0, 32, 32)
        close_button_container.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        close_button_layout = QHBoxLayout(close_button_container)
        close_button_layout.setContentsMargins(8, 8, 0, 0)
        close_button_layout.setSpacing(0)
        close_button = QPushButton("")
        close_button.setFixedSize(16, 16)
        close_button.setStyleSheet('''
            QPushButton {
                background-color: #FF3B30;
                border: none;
                border-radius: 8px;
            }
            QPushButton:hover {
                background-color: #FF615C;
            }
        ''')
        close_button.setFocusPolicy(Qt.FocusPolicy.ClickFocus)
        if self._close_callback:
            close_button.clicked.connect(self._close_callback)
        else:
            close_button.clicked.connect(self._default_close)
        close_button_layout.addWidget(close_button, alignment=Qt.AlignmentFlag.AlignLeft)
        close_button_container.raise_()
        self._close_button = close_button

    def _default_close(self):
        # Try to close the parent window
        if self.parent() and hasattr(self.parent(), 'close'):
            self.parent().close()

    def get_effective_top_margin(self):
        return self._effective_top_margin

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.rect()
        path = QPainterPath()
        path.addRoundedRect(QRectF(rect), self.radius, self.radius)
        painter.setClipPath(path)
        # Draw the radial gradient background
        grad = self._make_radial_gradient(rect)
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

    def _make_radial_gradient(self, rect):
        from PyQt6.QtGui import QRadialGradient, QColor
        grad = QRadialGradient(rect.width() * 0.4, rect.height() * 0.4, max(rect.width(), rect.height()) * 0.7)
        grad.setColorAt(0.0, QColor(60, 70, 90, int(0.98 * 255)))
        grad.setColorAt(0.5, QColor(30, 32, 40, int(0.96 * 255)))
        grad.setColorAt(0.8, QColor(20, 22, 30, int(0.94 * 255)))
        grad.setColorAt(1.0, QColor(10, 10, 15, int(0.92 * 255)))
        return grad 