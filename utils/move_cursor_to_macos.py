import time

import Quartz

"""
Move the mouse to the given coordinates for a short duration.

Useful for debugging the coordinate mapping from MacOS 
"""


def move_cursor_to_macos(x, y, radius=10, duration=2):
    # Create a new event tap to inject into the system

    # Create a red dot
    ctx = Quartz.CGBitmapContextCreate(
        None,
        radius * 2,
        radius * 2,
        8,
        radius * 2 * 4,
        Quartz.CGColorSpaceCreateDeviceRGB(),
        Quartz.kCGImageAlphaPremultipliedLast,
    )

    Quartz.CGContextSetRGBFillColor(ctx, 1, 0, 0, 1)  # Red color
    Quartz.CGContextFillEllipseInRect(
        ctx, Quartz.CGRectMake(0, 0, radius * 2, radius * 2)
    )

    # Post it as a cursor image temporarily
    Quartz.CGDisplayHideCursor(Quartz.CGMainDisplayID())
    Quartz.CGWarpMouseCursorPosition((x, y))
    Quartz.CGAssociateMouseAndMouseCursorPosition(False)

    # This step is illustrative — in reality macOS blocks direct drawing
    # To really show something we'd need a custom transparent window app
    # Instead: easiest solution = move the mouse pointer visibly to the coordinate
    print(f"🔴 Moved mouse cursor to ({x}, {y}) temporarily...")

    time.sleep(duration)

    Quartz.CGAssociateMouseAndMouseCursorPosition(True)
    Quartz.CGDisplayShowCursor(Quartz.CGMainDisplayID())
    print("✅ Done.")


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("Usage: python3 move_cursor_to_macos.py <x> <y>")
        sys.exit(1)

    x = int(sys.argv[1])
    y = int(sys.argv[2])

    move_cursor_to_macos(x, y)
