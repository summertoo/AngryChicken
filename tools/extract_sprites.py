"""精灵图自动切图工具
按透明通道检测每个精灵的轮廓边界，输出独立 PNG + JSON 映射。

用法：
  python tools/extract_sprites.py <精灵图路径> [输出目录]

示例：
  python tools/extract_sprites.py public/res.png tmp_frames
"""

import sys, os, json
from PIL import Image
import numpy as np


def extract_sprites(image_path: str, output_dir: str = "tmp_sprites"):
    img = Image.open(image_path).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    H, W = alpha.shape
    mask = alpha > 30

    # --- Two-pass connected component labeling ---
    labels = np.zeros((H, W), dtype=np.int32)
    curr_label = 0
    eq = {}  # union-find: label -> parent

    def find_root(l):
        while eq[l] != l:
            l = eq[l]
        return l

    for y in range(H):
        for x in range(W):
            if not mask[y][x]:
                continue
            up = labels[y - 1][x] if y > 0 and mask[y - 1][x] else 0
            left = labels[y][x - 1] if x > 0 and mask[y][x - 1] else 0

            if up == 0 and left == 0:
                curr_label += 1
                labels[y][x] = curr_label
                eq[curr_label] = curr_label
            elif up != 0 and left == 0:
                labels[y][x] = find_root(up)
            elif left != 0 and up == 0:
                labels[y][x] = find_root(left)
            else:
                ru, rl = find_root(up), find_root(left)
                if ru != rl:
                    if ru < rl:
                        eq[rl] = ru
                        labels[y][x] = ru
                    else:
                        eq[ru] = rl
                        labels[y][x] = rl
                else:
                    labels[y][x] = ru

    # Flatten
    final_labels = np.zeros((H, W), dtype=np.int32)
    label_map = {}
    new_label = 0
    for y in range(H):
        for x in range(W):
            if mask[y][x]:
                root = find_root(labels[y][x])
                if root not in label_map:
                    new_label += 1
                    label_map[root] = new_label
                final_labels[y][x] = label_map[root]

    # Collect bounding boxes
    components = {}
    for y in range(H):
        for x in range(W):
            l = final_labels[y][x]
            if l > 0:
                if l not in components:
                    components[l] = {
                        "xmin": x,
                        "xmax": x,
                        "ymin": y,
                        "ymax": y,
                        "count": 0,
                    }
                c = components[l]
                c["xmin"] = min(c["xmin"], x)
                c["xmax"] = max(c["xmax"], x)
                c["ymin"] = min(c["ymin"], y)
                c["ymax"] = max(c["ymax"], y)
                c["count"] += 1

    os.makedirs(output_dir, exist_ok=True)

    MIN_PIXELS = 500
    results = []
    for l, c in sorted(components.items(), key=lambda x: (x[1]["ymin"], x[1]["xmin"])):
        if c["count"] < MIN_PIXELS:
            continue
        xmin, ymin, xmax, ymax = c["xmin"], c["ymin"], c["xmax"], c["ymax"]
        bw, bh = xmax - xmin + 1, ymax - ymin + 1
        sprite = img.crop((xmin, ymin, xmax + 1, ymax + 1))
        fname = f"sprite_{ymin}_{xmin}_{bw}x{bh}.png"
        sprite.save(os.path.join(output_dir, fname))
        results.append(
            {
                "file": fname,
                "x": xmin,
                "y": ymin,
                "w": bw,
                "h": bh,
                "pixels": c["count"],
            }
        )

    mapping_file = os.path.join(output_dir, "sprites.json")
    with open(mapping_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Found {len(results)} sprites -> {output_dir}/")
    print(f"Mapping saved to {mapping_file}")
    print("\nSprite list:")
    print(f"{'File':45s} {'Position':>20s} {'Pixels':>8}")
    print("-" * 75)
    for r in results:
        print(
            f"{r['file']:45s} ({r['x']:4d},{r['y']:4d} {r['w']:3d}x{r['h']:3d}) {r['pixels']:7d}"
        )
    print(f"\nTip: Open .png files in {output_dir}/ to identify each sprite.")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "public/res.png"
    out = sys.argv[2] if len(sys.argv) > 2 else "tmp_sprites"
    extract_sprites(src, out)
