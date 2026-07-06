#!/usr/bin/env python3
"""End-to-end test: renders a synthetic street video with vehicles moving at
known speeds and checks that speed_camera.py measures them correctly and flags
only the one above the 30 km/h limit.

    python3 test_synthetic.py
"""

import os
import sys
import tempfile

import cv2
import numpy as np

from speed_camera import SpeedCamera, DEFAULT_CONFIG

W, H, FPS = 640, 360, 30.0
LINE_A, LINE_B = 150, 490          # pixels
DISTANCE_M = 20.0                  # meters between the lines on the "street"
PX_PER_M = (LINE_B - LINE_A) / DISTANCE_M


def kmh_to_px_per_frame(kmh):
    return kmh / 3.6 * PX_PER_M / FPS


def render_video(path, cars):
    """cars: list of (speed_kmh, direction, start_frame, lane_y)."""
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    background = np.full((H, W, 3), 90, np.uint8)          # asphalt
    cv2.line(background, (0, 100), (W, 100), (200, 200, 200), 2)
    cv2.line(background, (0, 260), (W, 260), (200, 200, 200), 2)

    total_frames = 600
    for f in range(total_frames):
        frame = background.copy()
        # mild sensor noise so MOG2 has a realistic background model
        noise = np.random.randint(-4, 5, frame.shape, dtype=np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        for i, (kmh, direction, start, lane_y) in enumerate(cars):
            v = kmh_to_px_per_frame(kmh)
            if direction > 0:
                x = -80 + v * (f - start)
            else:
                x = W + 20 - v * (f - start)
            if f < start or x < -100 or x > W + 100:
                continue
            color = [(0, 60, 200), (200, 120, 0), (40, 160, 40)][i % 3]
            cv2.rectangle(frame, (int(x), lane_y), (int(x) + 80, lane_y + 40),
                          color, -1)
            cv2.rectangle(frame, (int(x) + 10, lane_y + 8),
                          (int(x) + 30, lane_y + 22), (220, 220, 220), -1)
        writer.write(frame)
    writer.release()


def main():
    np.random.seed(7)
    tmp = tempfile.mkdtemp(prefix="speedcam-test-")
    video = os.path.join(tmp, "street.mp4")

    # (speed km/h, direction, start frame, lane y)
    cars = [
        (25.0, +1, 30, 120),   # within the 30 km/h limit
        (48.0, -1, 250, 200),  # violator
        (30.0, +1, 420, 120),  # exactly at the limit -> ok (within tolerance)
    ]
    render_video(video, cars)

    cfg = dict(DEFAULT_CONFIG)
    cfg.update({
        "source": video,
        "line_a_x": LINE_A,
        "line_b_x": LINE_B,
        "distance_meters": DISTANCE_M,
        "speed_limit_kmh": 30.0,
        "output_dir": os.path.join(tmp, "captures"),
        "log_csv": os.path.join(tmp, "captures", "speed_log.csv"),
        "save_all_passes": True,
    })
    measurements = SpeedCamera(cfg).run()

    expected = sorted(kmh for kmh, *_ in cars)
    measured = sorted(m["speed_kmh"] for m in measurements)
    assert len(measured) == len(expected), (
        f"expected {len(expected)} vehicles, measured {len(measured)}: {measurements}"
    )
    for want, got in zip(expected, measured):
        error = abs(got - want)
        assert error < 1.5, f"speed off by {error:.1f} km/h (want {want}, got {got})"
        print(f"  expected {want:5.1f} km/h  measured {got:5.1f} km/h  "
              f"(error {error:.2f})")

    violations = [m for m in measurements if m["violation"]]
    assert len(violations) == 1 and violations[0]["speed_kmh"] > 40, (
        f"expected exactly the 48 km/h car flagged, got {violations}"
    )
    assert os.path.exists(violations[0]["snapshot"]), "violation snapshot missing"
    assert os.path.exists(cfg["log_csv"]), "CSV log missing"

    print(f"\nPASS — snapshots and log in {tmp}")


if __name__ == "__main__":
    sys.exit(main())
