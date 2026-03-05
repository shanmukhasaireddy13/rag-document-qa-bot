"""
Run this once to generate the PNG icon files needed by the Chrome extension.
Requires: pip install Pillow
"""

from PIL import Image, ImageDraw
import os

SIZES = [16, 48, 128]
os.makedirs("icons", exist_ok=True)

for size in SIZES:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # White circle
    margin = max(2, size // 8)
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(255, 255, 255, 255)
    )

    # Black "F" letter in the circle (only if size is big enough)
    if size >= 48:
        from PIL import ImageFont
        try:
            font = ImageFont.truetype("arial.ttf", size // 2)
        except Exception:
            font = ImageFont.load_default()

        text = "F"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(
            ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
            text,
            fill=(0, 0, 0, 255),
            font=font
        )

    img.save(f"icons/icon{size}.png")
    print(f"Created icons/icon{size}.png")

print("Done! Icons saved to icons/")
