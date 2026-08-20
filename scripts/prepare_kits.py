"""Clean generated kit artwork and export consistently framed transparent WebP files."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image
import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "public" / "kits" / "generated"
OUTPUT_DIR = ROOT / "public" / "kits" / "optimized"
CANVAS_SIZE = 512
TARGET_WIDTH = 430
TARGET_HEIGHT = 470


def is_background(pixel: tuple[int, int, int]) -> bool:
    """Identify the light neutral checker/white backgrounds used by image generation."""
    red, green, blue = pixel
    return min(pixel) >= 205 and max(pixel) - min(pixel) <= 24


def edge_background_mask(image: Image.Image) -> Image.Image:
    """Flood-fill only light neutral pixels connected to the canvas edge."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not seen[index] and is_background(pixels[x, y]):
            seen[index] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    alpha = Image.new("L", (width, height), 255)
    alpha_pixels = alpha.load()
    for y in range(height):
        offset = y * width
        for x in range(width):
            if seen[offset + x]:
                alpha_pixels[x, y] = 0
    return alpha


def grabcut_mask(image: Image.Image) -> Image.Image:
    """Separate very light shirts that cannot be flood-filled against a light backdrop."""
    rgb = np.array(image.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    height, width = bgr.shape[:2]
    mask = np.zeros((height, width), np.uint8)
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    margin_x, margin_y = round(width * 0.035), round(height * 0.025)
    rectangle = (margin_x, margin_y, width - 2 * margin_x, height - 2 * margin_y)
    cv2.grabCut(
        bgr,
        mask,
        rectangle,
        background_model,
        foreground_model,
        8,
        cv2.GC_INIT_WITH_RECT,
    )
    foreground = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype("uint8")
    # Preserve white fabric enclosed by the detected shirt outline. Generated
    # checkerboards can otherwise be classified together with a white torso.
    closed = cv2.morphologyEx(
        foreground, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2
    )
    outside = cv2.bitwise_not(closed)
    flood = outside.copy()
    flood_mask = np.zeros((height + 2, width + 2), np.uint8)
    cv2.floodFill(flood, flood_mask, (0, 0), 0)
    foreground = cv2.bitwise_or(closed, flood)
    return Image.fromarray(foreground, mode="L")


def prepare(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = grabcut_mask(image)
    image.putalpha(alpha)
    bounds = image.getbbox()
    if bounds is None:
        raise ValueError(f"No shirt content found in {source.name}")

    shirt = image.crop(bounds)
    scale = min(TARGET_WIDTH / shirt.width, TARGET_HEIGHT / shirt.height)
    size = (max(1, round(shirt.width * scale)), max(1, round(shirt.height * scale)))
    shirt = shirt.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - shirt.width) // 2
    y = (CANVAS_SIZE - shirt.height) // 2
    canvas.alpha_composite(shirt, (x, y))
    canvas.save(destination, "WEBP", lossless=True, method=6)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for source in sorted(SOURCE_DIR.glob("*.png")):
        destination = OUTPUT_DIR / f"{source.stem}.webp"
        prepare(source, destination)
        print(f"Prepared {source.name} -> {destination.name}")


if __name__ == "__main__":
    main()
