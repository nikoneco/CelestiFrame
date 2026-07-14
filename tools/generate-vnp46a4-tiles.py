#!/usr/bin/env python3
"""Download VNP46A4 source granules and build a Japan-area XYZ WebP tile pyramid."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.request
from pathlib import Path

import h5py
import numpy as np
from PIL import Image


HDF5_SIGNATURE = b"\x89HDF\r\n\x1a\n"
LAADS_ROOT = "https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VNP46A4"
TILE_SIZE = 256


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("tools/vnp46a4-2025-japan.json"))
    parser.add_argument("--source-dir", type=Path, default=Path("data/vnp46a4-source/2025"))
    parser.add_argument("--output-dir", type=Path, default=Path("assets/light-pollution/vnp46a4-2025"))
    parser.add_argument("--skip-download", action="store_true", help="Require every HDF5 file to already exist")
    return parser.parse_args()


def is_hdf5(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 8:
        return False
    with path.open("rb") as source:
        return source.read(8) == HDF5_SIGNATURE


def download_sources(manifest: dict, source_dir: Path, skip_download: bool) -> None:
    source_dir.mkdir(parents=True, exist_ok=True)
    missing = [tile for tile in manifest["tiles"] if not is_hdf5(source_dir / tile["filename"])]
    if not missing:
        return
    if skip_download:
        names = ", ".join(tile["filename"] for tile in missing)
        raise RuntimeError(f"VNP46A4 source files are missing or invalid: {names}")

    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token:
        raise RuntimeError("Set EARTHDATA_TOKEN to an Earthdata download token before downloading VNP46A4")

    year = manifest["year"]
    day = manifest["dayOfYear"]
    for index, tile in enumerate(missing, start=1):
        destination = source_dir / tile["filename"]
        partial = destination.with_suffix(destination.suffix + ".partial")
        url = f"{LAADS_ROOT}/{year}/{day}/{tile['filename']}"
        print(f"Downloading {index}/{len(missing)}: {tile['filename']}")
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(request, timeout=180) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if not is_hdf5(partial):
            partial.unlink(missing_ok=True)
            raise RuntimeError(f"LAADS did not return an HDF5 file for {tile['filename']}; check the token")
        partial.replace(destination)


def load_mosaic(manifest: dict, source_dir: Path) -> tuple[np.ndarray, dict]:
    tiles = sorted(manifest["tiles"], key=lambda tile: (tile["v"], tile["h"]))
    first_path = source_dir / tiles[0]["filename"]
    with h5py.File(first_path, "r") as source:
        first_shape = source[manifest["datasetPath"]].shape
    if len(first_shape) != 2 or first_shape[0] != first_shape[1]:
        raise RuntimeError(f"Unexpected VNP46A4 grid shape: {first_shape}")

    tile_pixels = first_shape[0]
    h_values = sorted({tile["h"] for tile in tiles})
    v_values = sorted({tile["v"] for tile in tiles})
    if len(tiles) != len(h_values) * len(v_values):
        raise RuntimeError("Manifest tiles must form a complete rectangular grid")

    mosaic = np.full((len(v_values) * tile_pixels, len(h_values) * tile_pixels), np.nan, dtype=np.float32)
    h_offsets = {value: index * tile_pixels for index, value in enumerate(h_values)}
    v_offsets = {value: index * tile_pixels for index, value in enumerate(v_values)}

    for index, tile in enumerate(tiles, start=1):
        path = source_dir / tile["filename"]
        print(f"Reading {index}/{len(tiles)}: {path.name}")
        with h5py.File(path, "r") as source:
            radiance = np.asarray(source[manifest["datasetPath"]], dtype=np.float32)
            quality = np.asarray(source[manifest["qualityPath"]], dtype=np.uint8)
        if radiance.shape != first_shape or quality.shape != first_shape:
            raise RuntimeError(f"Inconsistent VNP46A4 grid shape in {path.name}")
        radiance[(radiance < 0) | (quality == 255)] = np.nan
        row = v_offsets[tile["v"]]
        column = h_offsets[tile["h"]]
        mosaic[row:row + tile_pixels, column:column + tile_pixels] = radiance

    return mosaic, manifest["bounds"]


def tile_x(longitude: float, zoom: int) -> float:
    return (longitude + 180.0) / 360.0 * (1 << zoom)


def tile_y(latitude: float, zoom: int) -> float:
    latitude = max(-85.05112878, min(85.05112878, latitude))
    radians = math.radians(latitude)
    return (1.0 - math.asinh(math.tan(radians)) / math.pi) / 2.0 * (1 << zoom)


def longitude_for_pixel(tile_column: int, pixel_column: np.ndarray, zoom: int) -> np.ndarray:
    return ((tile_column + (pixel_column + 0.5) / TILE_SIZE) / (1 << zoom)) * 360.0 - 180.0


def latitude_for_pixel(tile_row: int, pixel_row: np.ndarray, zoom: int) -> np.ndarray:
    mercator_y = math.pi * (1.0 - 2.0 * (tile_row + (pixel_row + 0.5) / TILE_SIZE) / (1 << zoom))
    return np.degrees(np.arctan(np.sinh(mercator_y)))


def colorize(radiance: np.ndarray) -> np.ndarray:
    valid = np.isfinite(radiance) & (radiance > 0.05)
    normalized = np.zeros(radiance.shape, dtype=np.float32)
    normalized[valid] = np.clip(np.log1p(radiance[valid]) / np.log1p(60.0), 0.0, 1.0)

    stops = np.array([0.0, 0.22, 0.48, 0.72, 1.0], dtype=np.float32)
    colors = np.array([
        [22, 26, 58],
        [62, 44, 110],
        [151, 55, 102],
        [241, 118, 48],
        [255, 241, 166],
    ], dtype=np.float32)
    indices = np.clip(np.searchsorted(stops, normalized, side="right") - 1, 0, len(stops) - 2)
    lower = stops[indices]
    upper = stops[indices + 1]
    blend = np.divide(normalized - lower, upper - lower, out=np.zeros_like(normalized), where=upper > lower)
    rgb = colors[indices] + (colors[indices + 1] - colors[indices]) * blend[..., None]
    alpha = np.zeros(radiance.shape, dtype=np.float32)
    alpha[valid] = 32.0 + np.power(normalized[valid], 0.78) * 208.0
    return np.dstack((np.clip(rgb, 0, 255), np.clip(alpha, 0, 240))).astype(np.uint8)


def tile_range(bounds: dict, zoom: int) -> tuple[range, range]:
    limit = (1 << zoom) - 1
    x_start = max(0, int(math.floor(tile_x(bounds["west"], zoom))))
    x_end = min(limit, int(math.floor(tile_x(bounds["east"] - 1e-9, zoom))))
    y_start = max(0, int(math.floor(tile_y(bounds["north"], zoom))))
    y_end = min(limit, int(math.floor(tile_y(bounds["south"] + 1e-9, zoom))))
    return range(x_start, x_end + 1), range(y_start, y_end + 1)


def save_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", quality=86, method=4)


def build_max_zoom(mosaic: np.ndarray, bounds: dict, zoom: int, output_dir: Path) -> int:
    height, width = mosaic.shape
    pixel_columns = np.arange(TILE_SIZE, dtype=np.float64)
    pixel_rows = np.arange(TILE_SIZE, dtype=np.float64)
    x_range, y_range = tile_range(bounds, zoom)
    count = 0
    for x in x_range:
        longitudes = longitude_for_pixel(x, pixel_columns, zoom)
        columns = np.floor((longitudes - bounds["west"]) / (bounds["east"] - bounds["west"]) * width).astype(np.int64)
        for y in y_range:
            latitudes = latitude_for_pixel(y, pixel_rows, zoom)
            rows = np.floor((bounds["north"] - latitudes) / (bounds["north"] - bounds["south"]) * height).astype(np.int64)
            valid_columns = (columns >= 0) & (columns < width)
            valid_rows = (rows >= 0) & (rows < height)
            sampled = np.full((TILE_SIZE, TILE_SIZE), np.nan, dtype=np.float32)
            valid = valid_rows[:, None] & valid_columns[None, :]
            safe_rows = np.clip(rows, 0, height - 1)
            safe_columns = np.clip(columns, 0, width - 1)
            sampled_grid = mosaic[safe_rows[:, None], safe_columns[None, :]]
            sampled[valid] = sampled_grid[valid]
            save_webp(Image.fromarray(colorize(sampled), "RGBA"), output_dir / str(zoom) / str(x) / f"{y}.webp")
            count += 1
    return count


def build_parent_zooms(bounds: dict, max_zoom: int, output_dir: Path) -> int:
    transparent = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    count = 0
    for zoom in range(max_zoom - 1, -1, -1):
        x_range, y_range = tile_range(bounds, zoom)
        for x in x_range:
            for y in y_range:
                canvas = Image.new("RGBA", (TILE_SIZE * 2, TILE_SIZE * 2), (0, 0, 0, 0))
                for dx in range(2):
                    for dy in range(2):
                        child_path = output_dir / str(zoom + 1) / str(x * 2 + dx) / f"{y * 2 + dy}.webp"
                        child = Image.open(child_path).convert("RGBA") if child_path.is_file() else transparent
                        canvas.paste(child, (dx * TILE_SIZE, dy * TILE_SIZE))
                parent = canvas.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
                save_webp(parent, output_dir / str(zoom) / str(x) / f"{y}.webp")
                count += 1
    return count


def write_metadata(manifest: dict, output_dir: Path, tile_count: int) -> None:
    metadata = {
        "product": manifest["product"],
        "collection": manifest["collection"],
        "year": manifest["year"],
        "doi": manifest["doi"],
        "bounds": manifest["bounds"],
        "maxNativeZoom": manifest["maxNativeZoom"],
        "sourceBand": "AllAngle_Composite_Snow_Free",
        "units": "nW/(cm^2 sr)",
        "tileFormat": "WebP RGBA",
        "tileCount": tile_count,
        "radianceDisplayMaximum": 60,
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    download_sources(manifest, args.source_dir, args.skip_download)
    mosaic, bounds = load_mosaic(manifest, args.source_dir)
    max_zoom = int(manifest["maxNativeZoom"])
    print(f"Building zoom {max_zoom} tiles from {mosaic.shape[1]}x{mosaic.shape[0]} radiance pixels")
    tile_count = build_max_zoom(mosaic, bounds, max_zoom, args.output_dir)
    del mosaic
    tile_count += build_parent_zooms(bounds, max_zoom, args.output_dir)
    write_metadata(manifest, args.output_dir, tile_count)
    print(f"Wrote {tile_count} tiles to {args.output_dir}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, KeyError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
