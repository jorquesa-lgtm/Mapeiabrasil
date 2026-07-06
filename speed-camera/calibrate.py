#!/usr/bin/env python3
"""Calibration helper for speed_camera.py.

The speed camera needs three numbers: the pixel column of virtual line A, the
pixel column of virtual line B, and the real-world distance in meters between
those two positions on the street.

Two ways to use this script:

1. Interactive (on a machine with a display):
       python3 calibrate.py --source rtsp://... --config config.json
   A window opens with a frame from your camera. Click once where line A
   should be and once where line B should be (pick reference points on the
   road you can physically measure between — a lamp post, a driveway edge...).
   Then type the measured distance in meters. The config file is updated.

2. Headless (no display, e.g. over SSH):
       python3 calibrate.py --source rtsp://... --snapshot frame.jpg
   Saves one frame to disk. Open it in any image viewer/editor, note the x
   pixel coordinates for the two lines, measure the distance on the street,
   and fill line_a_x / line_b_x / distance_meters into config.json by hand.

Tip for accuracy: place the lines perpendicular to the road, as far apart as
the camera can see clearly, and measure the on-street distance carefully —
the speed error is proportional to the distance error.
"""

import argparse
import json
import sys

import cv2


def grab_frame(source):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        sys.exit(f"error: cannot open video source {source!r}")
    ok, frame = cap.read()
    cap.release()
    if not ok:
        sys.exit("error: could not read a frame from the source")
    return frame


def interactive(frame, config_path):
    clicks = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(clicks) < 2:
            clicks.append(x)
            name = "A" if len(clicks) == 1 else "B"
            cv2.line(frame, (x, 0), (x, frame.shape[0]), (255, 200, 0), 2)
            cv2.putText(frame, name, (x + 5, 30), cv2.FONT_HERSHEY_SIMPLEX,
                        1.0, (255, 200, 0), 2)
            cv2.imshow("calibrate — click line A then line B, q when done", frame)

    cv2.imshow("calibrate — click line A then line B, q when done", frame)
    cv2.setMouseCallback("calibrate — click line A then line B, q when done", on_mouse)
    while len(clicks) < 2:
        if cv2.waitKey(50) & 0xFF == ord("q"):
            break
    cv2.waitKey(500)
    cv2.destroyAllWindows()

    if len(clicks) < 2:
        sys.exit("calibration aborted: two clicks are required")

    line_a, line_b = clicks
    distance = float(input("Measured real-world distance between the two lines "
                           "(meters): ").strip().replace(",", "."))
    if distance <= 0:
        sys.exit("error: distance must be positive")

    try:
        with open(config_path) as f:
            cfg = json.load(f)
    except FileNotFoundError:
        cfg = {}
    cfg.update({
        "line_a_x": int(line_a),
        "line_b_x": int(line_b),
        "distance_meters": distance,
    })
    with open(config_path, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    print(f"saved: line_a_x={line_a}, line_b_x={line_b}, "
          f"distance_meters={distance} -> {config_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", required=True,
                        help="camera index, video file, or rtsp/http URL")
    parser.add_argument("--config", default="config.json",
                        help="config file to update (interactive mode)")
    parser.add_argument("--snapshot",
                        help="headless mode: save one frame to this path and exit")
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source
    frame = grab_frame(source)

    if args.snapshot:
        cv2.imwrite(args.snapshot, frame)
        print(f"frame saved to {args.snapshot} "
              f"({frame.shape[1]}x{frame.shape[0]} px). Pick the two x "
              f"coordinates there and edit config.json manually.")
        return

    interactive(frame, args.config)


if __name__ == "__main__":
    main()
