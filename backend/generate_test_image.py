
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import random

random.seed(42)

OUTPUT_DIR = Path(__file__).parent / "test-data"
OUTPUT_DIR.mkdir(exist_ok=True)

FONT_PATH = r"C:\Windows\Fonts\arialbd.ttf"

TEST_CASES = [
    "TEST7", "ABC23", "K9M4P", "X7R2Q",
    "HELLO8", "PYTHON5", "N8T4W", "CLOUD9",
    "DEVOPS6", "AI2026", "M7K2B", "R4X9P",
    "CODE88", "Z5Q3L", "NODE24", "V8D2F",
    "GITHUB7", "T3P9N", "W6Y2K", "OCR2026"
]

for index, captcha_text in enumerate(TEST_CASES, start=1):
    image = Image.new("RGB", (300, 110), "white")
    draw = ImageDraw.Draw(image)

    font = ImageFont.truetype(FONT_PATH, 48)

    text_width = draw.textbbox((0, 0), captcha_text, font=font)[2]
    x = (300 - text_width) // 2

    draw.text((x, 25), captcha_text, font=font, fill="black")

    for _ in range(25):
        px = random.randint(0, 299)
        py = random.randint(0, 109)
        draw.point((px, py), fill="gray")

    image.save(OUTPUT_DIR / f"captcha-{index:02d}.png")

print(f"Generated {len(TEST_CASES)} CAPTCHA images.")
print(f"Output folder: {OUTPUT_DIR}")
