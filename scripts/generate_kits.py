from __future__ import annotations

import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PNG_DIR = ROOT / "public" / "kits" / "generated"
WEBP_DIR = ROOT / "public" / "kits" / "optimized"
SIZE = 1024
OUTPUT_SIZE = 512

TEAMS = {
    "ars": (3, "arsenal", "#d90b2b", "#f7f7f5", "#8b1538"),
    "avl": (7, "villa", "#741735", "#a8daf2", "#a8daf2"),
    "bou": (91, "stripes", "#df1022", "#111111", "#111111"),
    "bre": (94, "brentford", "#e31b23", "#f7f7f5", "#e0a825"),
    "bha": (36, "brighton", "#0755ac", "#f7f7f5", "#f7f7f5"),
    "che": (8, "chelsea", "#0b4ed0", "#0b4ed0", "#efc85a"),
    "cov": (9, "coventry", "#42aede", "#f4f5f2", "#15191f"),
    "cry": (31, "palace", "#f5f5f3", "#e51b2b", "#174ca0"),
    "eve": (11, "everton", "#113fa4", "#113fa4", "#f2c318"),
    "ful": (54, "fulham", "#f7f7f5", "#f7f7f5", "#111522"),
    "hul": (88, "stripes", "#f5a400", "#161616", "#f5a400"),
    "ips": (40, "ipswich", "#15459c", "#15459c", "#f7f7f5"),
    "lee": (2, "leeds", "#f7f7f5", "#f7f7f5", "#1552a2"),
    "liv": (14, "liverpool", "#aa1830", "#aa1830", "#f0ede8"),
    "mci": (43, "city", "#86c9e8", "#edf7fb", "#f7f7f5"),
    "mun": (1, "united", "#e5222a", "#e5222a", "#151515"),
    "new": (4, "newcastle", "#f7f7f5", "#111111", "#42bfd1"),
    "nfo": (17, "forest", "#d7192d", "#a10f23", "#f7f7f5"),
    "tot": (6, "spurs", "#f7f7f5", "#f7f7f5", "#111b52"),
    "sun": (56, "stripes", "#e30613", "#f7f7f5", "#e30613"),
}


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/ariblk.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def shirt_geometry() -> tuple[list[tuple[int, int]], list[tuple[int, int]], list[tuple[int, int]]]:
    body = [(303, 180), (721, 180), (764, 906), (512, 952), (260, 906)]
    left_sleeve = [(303, 180), (215, 205), (55, 425), (210, 520), (292, 397)]
    right_sleeve = [(721, 180), (809, 205), (969, 425), (814, 520), (732, 397)]
    return body, left_sleeve, right_sleeve


def crest(team_code: int) -> Image.Image:
    url = f"https://resources.premierleague.com/premierleague/badges/70/t{team_code}.png"
    request = urllib.request.Request(url, headers={"User-Agent": "Farmisarja-Live/0.1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        image = Image.open(io.BytesIO(response.read())).convert("RGBA")
    image.thumbnail((116, 116), Image.Resampling.LANCZOS)
    return image


def generate(code: str, spec: tuple[int, str, str, str, str]) -> None:
    team_code, pattern, primary, secondary, trim = spec
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    body, left_sleeve, right_sleeve = shirt_geometry()
    mask = Image.new("L", (SIZE, SIZE), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.polygon(body, fill=255)
    mask_draw.polygon(left_sleeve, fill=255)
    mask_draw.polygon(right_sleeve, fill=255)

    design = Image.new("RGBA", (SIZE, SIZE), primary)
    design_draw = ImageDraw.Draw(design)
    if pattern in {"stripes", "brentford"}:
        stripe_width = 92
        for index, x in enumerate(range(250, 775, stripe_width)):
            if index % 2:
                design_draw.rectangle((x, 155, x + stripe_width, 960), fill=secondary)
    else:
        design_draw.polygon(left_sleeve, fill=secondary)
        design_draw.polygon(right_sleeve, fill=secondary)

    if code == "bou":
        design_draw.polygon([(303, 180), (215, 205), (165, 275), (285, 300), (360, 180)], fill="#b99755")
        design_draw.polygon([(721, 180), (809, 205), (859, 275), (739, 300), (664, 180)], fill="#b99755")
    elif pattern == "arsenal":
        design_draw.rectangle((290, 165, 734, 215), fill="#f7f7f5")
        design_draw.line([(300, 186), (724, 186)], fill="#8b1538", width=13)
    elif pattern == "villa":
        design_draw.rectangle((255, 362, 315, 410), fill=secondary)
        design_draw.rectangle((709, 362, 769, 410), fill=secondary)
        design_draw.rectangle((300, 178, 724, 194), fill="#f7f7f5")
    elif pattern == "brentford":
        design_draw.rectangle((260, 180, 764, 198), fill="#d7a52a")
    elif pattern == "brighton":
        for x in range(292, 753, 66):
            design_draw.line([(x, 170), (x + 18, 930)], fill="#f7f7f5", width=8)
    elif pattern == "chelsea":
        for y in range(260, 900, 70):
            design_draw.arc((285, y, 735, y + 160), 195, 345, fill="#1759d8", width=9)
    elif pattern == "coventry":
        for x in range(285, 755, 108):
            design_draw.rectangle((x, 160, x + 52, 940), fill="#eef1ee")
    elif pattern == "palace":
        design_draw.polygon([(250, 655), (250, 515), (735, 185), (775, 295)], fill="#e31d32")
        design_draw.polygon([(250, 790), (250, 675), (775, 315), (775, 425)], fill="#164da2")
        for offset in (0, 26, 52):
            design_draw.line([(278, 650 + offset), (748, 330 + offset)], fill="#f7f7f5", width=8)
    elif pattern == "everton":
        design_draw.rectangle((255, 360, 315, 405), fill="#f7f7f5")
        design_draw.rectangle((709, 360, 769, 405), fill="#f7f7f5")
    elif pattern == "fulham":
        design_draw.polygon([(303, 180), (355, 180), (315, 245), (260, 300)], fill="#151522")
        design_draw.polygon([(721, 180), (669, 180), (709, 245), (764, 300)], fill="#151522")
        design_draw.line([(260, 395), (310, 415)], fill="#d8192f", width=12)
        design_draw.line([(764, 395), (714, 415)], fill="#d8192f", width=12)
    elif pattern == "ipswich":
        for x in range(305, 730, 85):
            design_draw.polygon([(x, 250), (x + 42, 210), (x + 84, 250), (x + 42, 290)], outline="#2255aa", width=10)
    elif pattern == "leeds":
        for y in range(280, 900, 62):
            design_draw.line([(275, y), (750, y)], fill="#1552a2" if (y // 62) % 2 else "#e5cb24", width=6)
    elif pattern == "liverpool":
        for x in range(285, 750, 88):
            for y in range(250, 900, 130):
                design_draw.polygon([(x, y), (x + 30, y - 14), (x + 16, y + 38)], fill="#d7b4b8")
                design_draw.line([(x + 42, y), (x + 73, y + 42)], fill="#d7b4b8", width=7)
    elif pattern == "city":
        for y in range(510, 930, 14):
            alpha = min(210, 60 + (y - 510) // 3)
            design_draw.line([(260, y), (764, y)], fill=(237, 247, 251, alpha), width=16)
    elif pattern == "united":
        design_draw.rectangle((300, 180, 724, 195), fill="#f7f7f5")
        design_draw.line([(280, 405), (320, 420)], fill="#111111", width=9)
        design_draw.line([(744, 405), (704, 420)], fill="#111111", width=9)
    elif pattern == "newcastle":
        widths = [42, 72, 38, 84, 46, 70]
        x = 260
        for index, width in enumerate(widths * 2):
            design_draw.rectangle((x, 155, x + width, 955), fill="#111111" if index % 2 == 0 else "#f7f7f5")
            x += width
            if x > 770:
                break
    elif pattern == "forest":
        for x, y, radius in ((330, 330, 120), (580, 420, 150), (430, 650, 170), (650, 760, 120)):
            design_draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill="#b51227")
    elif pattern == "spurs":
        design_draw.polygon([(260, 670), (315, 615), (340, 930), (260, 906)], fill="#111b52")
        design_draw.polygon([(764, 670), (709, 615), (684, 930), (764, 906)], fill="#111b52")

    # Restrained side shading adds depth while preserving identical geometry.
    for offset, alpha in ((0, 36), (18, 24), (36, 12)):
        design_draw.line([(275 + offset, 245), (306 + offset, 885)], fill=(0, 0, 0, alpha), width=10)
        design_draw.line([(749 - offset, 245), (718 - offset, 885)], fill=(0, 0, 0, alpha), width=10)
    canvas.alpha_composite(Image.composite(design, Image.new("RGBA", (SIZE, SIZE)), mask))

    draw = ImageDraw.Draw(canvas)
    outline = "#111217"
    for polygon in (body, left_sleeve, right_sleeve):
        draw.line(polygon + [polygon[0]], fill=outline, width=18, joint="curve")

    # Identical collar and trim placement for every club.
    draw.ellipse((356, 84, 668, 285), fill=trim, outline=outline, width=16)
    draw.ellipse((395, 106, 629, 241), fill="#202127", outline=outline, width=12)
    draw.line([(65, 424), (210, 505)], fill=trim, width=20)
    draw.line([(959, 424), (814, 505)], fill=trim, width=20)

    badge = crest(team_code)
    canvas.alpha_composite(badge, (633, 286))

    # A consistent manufacturer-like three-bar mark without extra text.
    for index in range(3):
        x = 340 + index * 22
        draw.polygon([(x, 345), (x + 18, 320), (x + 34, 345), (x + 16, 370)], fill=trim)

    sponsor_font = font(92)
    sponsor = "FARMISARJA"
    bounds = draw.textbbox((0, 0), sponsor, font=sponsor_font, stroke_width=3)
    text_width = bounds[2] - bounds[0]
    x = (SIZE - text_width) // 2
    y = 485
    sponsor_colors = {
        "cry": "#174ca0",
        "ful": "#111522",
        "lee": "#1552a2",
        "tot": "#c51c36",
    }
    draw.text((x, y), sponsor, font=sponsor_font, fill=sponsor_colors.get(code, "#ffffff"), stroke_width=6, stroke_fill=outline)

    PNG_DIR.mkdir(parents=True, exist_ok=True)
    WEBP_DIR.mkdir(parents=True, exist_ok=True)
    output = canvas.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)
    output.save(PNG_DIR / f"{code}.png", optimize=True)
    output.save(WEBP_DIR / f"{code}.webp", format="WEBP", lossless=True, method=6)


def main() -> None:
    for code, spec in TEAMS.items():
        generate(code, spec)
        print(f"generated {code}")


if __name__ == "__main__":
    main()
