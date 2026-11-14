"""Validate decoded output, not just existence (the CLI can swallow errors)."""
import sys
from PIL import Image

with Image.open(sys.argv[1]) as image:
    assert image.format == "PNG", image.format
    image.load()
    assert image.width >= 120 and image.height >= 80, image.size
    rgb = image.convert("RGB")
    pixels = list(rgb.get_flattened_data())
    assert sum(r > 200 and g < 60 and b < 60 for r, g, b in pixels) > 1000
    assert sum(r < 60 and g < 60 and b < 60 for r, g, b in pixels) > 50
    print(f"Rendered {image.width}x{image.height} PNG with red fill and black content")
