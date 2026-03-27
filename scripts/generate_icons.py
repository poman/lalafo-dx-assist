from pathlib import Path
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
GREEN = '#22c55e'
WHITE = '#ffffff'


def to_xy(
    point: tuple[float, float], offset_x: float, offset_y: float, scale: float
) -> tuple[float, float]:
    x, y = point
    return (offset_x + x * scale, offset_y + y * scale)


def draw_logo(draw: ImageDraw.ImageDraw, size: int) -> None:
    # Base artboard is 140x120; center it in a square canvas with equal padding.
    base_w, base_h = 140.0, 120.0
    scale = size / base_w
    rendered_h = base_h * scale
    offset_x = 0.0
    offset_y = (size - rendered_h) / 2.0

    # Rounded green background.
    rect = [
        (offset_x, offset_y),
        (offset_x + base_w * scale, offset_y + base_h * scale),
    ]
    draw.rounded_rectangle(rect, radius=18 * scale, fill=GREEN)

    # White strokes; keep minimum visible width on small icons.
    stroke = max(2, round(6 * scale))

    # Path 1: left shape (approximated with two segments + curve).
    draw.line(
        [
            to_xy((35, 30), offset_x, offset_y, scale),
            to_xy((34.5, 45), offset_x, offset_y, scale),
            to_xy((34.8, 60), offset_x, offset_y, scale),
            to_xy((35.3, 75), offset_x, offset_y, scale),
            to_xy((36, 90), offset_x, offset_y, scale),
        ],
        fill=WHITE,
        width=stroke,
        joint='curve',
    )
    draw.line(
        [
            to_xy((36, 90), offset_x, offset_y, scale),
            to_xy((42, 94), offset_x, offset_y, scale),
            to_xy((65, 94), offset_x, offset_y, scale),
        ],
        fill=WHITE,
        width=stroke,
        joint='curve',
    )

    # Path 2: right shape (polyline approximation).
    draw.line(
        [
            to_xy((80, 94), offset_x, offset_y, scale),
            to_xy((95, 30), offset_x, offset_y, scale),
            to_xy((101, 30), offset_x, offset_y, scale),
            to_xy((116, 94), offset_x, offset_y, scale),
        ],
        fill=WHITE,
        width=stroke,
        joint='curve',
    )

    # Cross bar.
    draw.line(
        [
            to_xy((88, 65), offset_x, offset_y, scale),
            to_xy((108, 65), offset_x, offset_y, scale),
        ],
        fill=WHITE,
        width=stroke,
    )


def main() -> None:
    out_dir = Path('public/icons')
    out_dir.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw_logo(draw, size)
        image.save(out_dir / f'icon-{size}.png')


if __name__ == '__main__':
    main()



