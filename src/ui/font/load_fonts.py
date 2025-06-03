import logging
import os
import traceback

from PySide6.QtGui import QFontDatabase

# Configure logging
logger = logging.getLogger(__name__)


def load_fonts():
    """Load and register the Inter font files."""
    try:
        # Get the directory containing the font files
        current_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(current_dir, "fonts")

        # Create fonts directory if it doesn't exist
        os.makedirs(fonts_dir, exist_ok=True)

        # List of required font files
        font_files = [
            "Inter-Regular.ttf",
            "Inter-Medium.ttf",
            "Inter-SemiBold.ttf",
            "Inter-Bold.ttf",
        ]

        # Check if all font files exist
        missing_fonts = []
        for font_file in font_files:
            font_path = os.path.join(fonts_dir, font_file)
            if not os.path.exists(font_path):
                missing_fonts.append(font_file)

        if missing_fonts:
            logger.warning(f"Missing font files: {', '.join(missing_fonts)}")
            logger.warning(
                "Please add the following font files to the src/fonts directory:"
            )
            for font in missing_fonts:
                logger.warning(f"- {font}")
            return False

        # Load and register each font file
        loaded_families = set()
        for font_file in font_files:
            font_path = os.path.join(fonts_dir, font_file)
            font_id = QFontDatabase.addApplicationFont(font_path)
            if font_id == -1:
                logger.error(f"Failed to load font: {font_file}")
                return False

            # Get the font family name that was registered
            families = QFontDatabase.applicationFontFamilies(font_id)
            if families:
                loaded_families.update(families)
            else:
                logger.error(f"Font loaded but no family name found for: {font_file}")
                return False

        # Verify that Inter is in the loaded families (check for both "Inter" and "Inter 18pt")
        if not any("Inter" in family for family in loaded_families):
            logger.error(
                f"Inter font family not found in loaded families: {loaded_families}"
            )
            return False

        logger.info(f"Successfully loaded all font families: {loaded_families}")
        return True
    except Exception as e:
        logger.error(f"Error loading fonts: {e}")
        logger.error(traceback.format_exc())
        return False
