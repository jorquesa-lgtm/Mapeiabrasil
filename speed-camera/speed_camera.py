#!/usr/bin/env python3
"""Home speed camera: detect vehicles in a fixed camera feed and measure their speed.

How it works
------------
Two virtual vertical lines (A and B) are drawn across the road in the image.
You tell the software the real-world distance between them (measure it on the
street once, see calibrate.py). Vehicles are detected with background
subtraction, tracked across frames, and their speed is computed from the time
their centroid takes to travel from one line to the other:

    speed = distance_between_lines / (t_cross_B - t_cross_A)

Crossing times are interpolated between frames, so accuracy is better than the
frame rate alone would suggest. Vehicles above the configured limit are logged
to CSV and an annotated snapshot is saved as evidence.

Usage
-----
    python3 speed_camera.py --config config.json

Works with RTSP/HTTP camera streams, USB cameras (source: 0) and video files.
"""

import argparse
import csv
import datetime as dt
import json
import os
import sys
import time

import cv2
import numpy as np

DEFAULT_CONFIG = {
    "source": 0,                 # int (USB cam index), file path, or rtsp/http URL
    "line_a_x": 150,             # x pixel position of virtual line A
    "line_b_x": 490,             # x pixel position of virtual line B
    "distance_meters": 20.0,     # real-world distance between the two lines
    "speed_limit_kmh": 30.0,     # max allowed speed
    "tolerance_kmh": 2.0,        # measurement tolerance before flagging
    "min_contour_area": 1500,    # ignore blobs smaller than this (pixels^2)
    "max_track_distance": 120,   # max centroid jump (px) to keep the same track
    "max_disappeared_frames": 15,  # frames a track may vanish before it's dropped
    "min_speed_kmh": 3.0,        # ignore measurements below this (pedestrians, noise)
    "output_dir": "captures",
    "log_csv": "captures/speed_log.csv",
    "save_all_passes": False,    # snapshot every vehicle, not only violators
    "show_window": False,        # live preview window (needs a display)
    "record_annotated": "",      # optional path to save an annotated video
}


class CentroidTracker:
    """Minimal multi-object tracker: matches detections to existing tracks by
    nearest centroid distance."""

    def __init__(self, max_disappeared=15, max_distance=120):
        self.next_id = 1
        self.objects = {}       # id -> (centroid, bbox)
        self.disappeared = {}   # id -> consecutive missed frames
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def _register(self, centroid, bbox):
        self.objects[self.next_id] = (centroid, bbox)
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def _deregister(self, object_id):
        del self.objects[object_id]
        del self.disappeared[object_id]

    def update(self, rects):
        """rects: list of (x, y, w, h). Returns dict id -> (centroid, bbox)
        and the list of ids dropped this frame."""
        dropped = []
        if not rects:
            for object_id in list(self.disappeared):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self._deregister(object_id)
                    dropped.append(object_id)
            return self.objects, dropped

        input_centroids = np.array(
            [(x + w / 2.0, y + h / 2.0) for (x, y, w, h) in rects]
        )

        if not self.objects:
            for centroid, rect in zip(input_centroids, rects):
                self._register(tuple(centroid), rect)
            return self.objects, dropped

        object_ids = list(self.objects)
        object_centroids = np.array([self.objects[i][0] for i in object_ids])
        dists = np.linalg.norm(
            object_centroids[:, None, :] - input_centroids[None, :, :], axis=2
        )

        used_rows, used_cols = set(), set()
        # Greedy matching, closest pairs first.
        for row, col in zip(*np.unravel_index(np.argsort(dists, axis=None), dists.shape)):
            if row in used_rows or col in used_cols:
                continue
            if dists[row, col] > self.max_distance:
                continue
            object_id = object_ids[row]
            self.objects[object_id] = (tuple(input_centroids[col]), rects[col])
            self.disappeared[object_id] = 0
            used_rows.add(row)
            used_cols.add(col)

        for row, object_id in enumerate(object_ids):
            if row not in used_rows:
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self._deregister(object_id)
                    dropped.append(object_id)

        for col in range(len(rects)):
            if col not in used_cols:
                self._register(tuple(input_centroids[col]), rects[col])

        return self.objects, dropped


class SpeedCamera:
    def __init__(self, config):
        self.cfg = config
        self.line_a = float(config["line_a_x"])
        self.line_b = float(config["line_b_x"])
        self.distance_m = float(config["distance_meters"])
        self.limit_kmh = float(config["speed_limit_kmh"])
        self.tolerance_kmh = float(config["tolerance_kmh"])
        self.min_speed_kmh = float(config["min_speed_kmh"])

        if self.line_a == self.line_b:
            raise ValueError("line_a_x and line_b_x must be different pixel columns")
        if self.distance_m <= 0:
            raise ValueError("distance_meters must be positive")

        self.tracker = CentroidTracker(
            max_disappeared=int(config["max_disappeared_frames"]),
            max_distance=float(config["max_track_distance"]),
        )
        self.bg = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=32, detectShadows=True
        )
        self.kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        # per-track state: id -> {last_x, last_t, crossings: {"A": t, "B": t}, measured}
        self.track_state = {}
        self.measurements = []

        os.makedirs(config["output_dir"], exist_ok=True)
        self.csv_path = config["log_csv"]
        os.makedirs(os.path.dirname(self.csv_path) or ".", exist_ok=True)
        if not os.path.exists(self.csv_path):
            with open(self.csv_path, "w", newline="") as f:
                csv.writer(f).writerow(
                    ["timestamp", "track_id", "direction", "speed_kmh",
                     "limit_kmh", "violation", "snapshot"]
                )

    # ---- detection -------------------------------------------------------

    def detect_vehicles(self, frame):
        mask = self.bg.apply(frame)
        # MOG2 marks shadows as 127; keep only confident foreground.
        _, mask = cv2.threshold(mask, 200, 255, cv2.THRESH_BINARY)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self.kernel)
        mask = cv2.dilate(mask, self.kernel, iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        rects = [
            cv2.boundingRect(c)
            for c in contours
            if cv2.contourArea(c) >= float(self.cfg["min_contour_area"])
        ]
        return rects

    # ---- speed measurement ----------------------------------------------

    @staticmethod
    def _interpolate_crossing(x_prev, t_prev, x_cur, t_cur, line_x):
        """Sub-frame estimate of when the centroid crossed the line."""
        if x_cur == x_prev:
            return t_cur
        alpha = (line_x - x_prev) / (x_cur - x_prev)
        return t_prev + alpha * (t_cur - t_prev)

    def _update_track(self, track_id, x, t, frame):
        state = self.track_state.setdefault(
            track_id, {"last_x": x, "last_t": t, "crossings": {}, "measured": False}
        )
        x_prev, t_prev = state["last_x"], state["last_t"]

        for name, line_x in (("A", self.line_a), ("B", self.line_b)):
            # <= 0 so a centroid landing exactly on the line still counts;
            # x_prev != x avoids re-triggering while parked on the line.
            if name not in state["crossings"] and x_prev != x and (
                (x_prev - line_x) * (x - line_x) <= 0
            ):
                state["crossings"][name] = self._interpolate_crossing(
                    x_prev, t_prev, x, t, line_x
                )

        state["last_x"], state["last_t"] = x, t

        if not state["measured"] and len(state["crossings"]) == 2:
            state["measured"] = True
            t_a, t_b = state["crossings"]["A"], state["crossings"]["B"]
            elapsed = abs(t_b - t_a)
            if elapsed <= 0:
                return None
            speed_kmh = (self.distance_m / elapsed) * 3.6
            direction = "A->B" if t_a < t_b else "B->A"
            if speed_kmh < self.min_speed_kmh:
                return None
            return self._record(track_id, direction, speed_kmh, frame)
        return None

    def _record(self, track_id, direction, speed_kmh, frame):
        violation = speed_kmh > self.limit_kmh + self.tolerance_kmh
        now = dt.datetime.now()
        snapshot = ""
        if violation or self.cfg["save_all_passes"]:
            snapshot = os.path.join(
                self.cfg["output_dir"],
                f"{now:%Y-%m-%d_%H-%M-%S}_id{track_id}_{speed_kmh:.0f}kmh.jpg",
            )
            annotated = frame.copy()
            _, bbox = self.tracker.objects.get(track_id, (None, None))
            if bbox is not None:
                x, y, w, h = bbox
                color = (0, 0, 255) if violation else (0, 200, 0)
                cv2.rectangle(annotated, (x, y), (x + w, y + h), color, 3)
            label = (
                f"ID {track_id}  {speed_kmh:.1f} km/h  "
                f"(limit {self.limit_kmh:.0f})  {now:%Y-%m-%d %H:%M:%S}"
            )
            cv2.putText(annotated, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (0, 0, 0), 4)
            cv2.putText(annotated, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (0, 0, 255) if violation else (0, 255, 0), 2)
            cv2.imwrite(snapshot, annotated)

        with open(self.csv_path, "a", newline="") as f:
            csv.writer(f).writerow(
                [now.isoformat(timespec="seconds"), track_id, direction,
                 f"{speed_kmh:.1f}", f"{self.limit_kmh:.0f}",
                 int(violation), snapshot]
            )

        result = {
            "track_id": track_id,
            "direction": direction,
            "speed_kmh": round(speed_kmh, 1),
            "violation": violation,
            "snapshot": snapshot,
        }
        self.measurements.append(result)
        flag = "VIOLATION" if violation else "ok"
        print(f"[{now:%H:%M:%S}] vehicle #{track_id} {direction} "
              f"{speed_kmh:.1f} km/h — {flag}")
        return result

    # ---- overlay ---------------------------------------------------------

    def draw_overlay(self, frame, objects):
        h = frame.shape[0]
        for line_x, name in ((self.line_a, "A"), (self.line_b, "B")):
            cv2.line(frame, (int(line_x), 0), (int(line_x), h), (255, 200, 0), 2)
            cv2.putText(frame, name, (int(line_x) + 5, 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 200, 0), 2)
        for object_id, (centroid, bbox) in objects.items():
            x, y, w, hh = bbox
            cv2.rectangle(frame, (x, y), (x + w, y + hh), (0, 255, 0), 2)
            cv2.putText(frame, f"#{object_id}", (x, y - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        return frame

    # ---- main loop -------------------------------------------------------

    def run(self):
        source = self.cfg["source"]
        is_live = isinstance(source, int) or (
            isinstance(source, str)
            and source.split("://")[0].lower() in ("rtsp", "http", "https")
        )
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise RuntimeError(f"cannot open video source: {source!r}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps != fps or fps <= 1:  # NaN/0 on many live streams
            fps = 30.0

        writer = None
        frame_idx = 0
        print(f"speed camera running — limit {self.limit_kmh:.0f} km/h, "
              f"lines A={self.line_a:.0f}px B={self.line_b:.0f}px, "
              f"distance {self.distance_m} m "
              f"({'live' if is_live else f'file @ {fps:.1f} fps'})")

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    if is_live:
                        print("stream dropped a frame, retrying...", file=sys.stderr)
                        time.sleep(0.1)
                        continue
                    break

                t = time.monotonic() if is_live else frame_idx / fps
                rects = self.detect_vehicles(frame)
                objects, dropped = self.tracker.update(rects)
                for track_id in dropped:
                    self.track_state.pop(track_id, None)

                for track_id, (centroid, _bbox) in objects.items():
                    if self.tracker.disappeared[track_id] == 0:
                        self._update_track(track_id, centroid[0], t, frame)

                if self.cfg["show_window"] or self.cfg["record_annotated"]:
                    annotated = self.draw_overlay(frame.copy(), objects)
                    if self.cfg["record_annotated"]:
                        if writer is None:
                            writer = cv2.VideoWriter(
                                self.cfg["record_annotated"],
                                cv2.VideoWriter_fourcc(*"mp4v"),
                                fps,
                                (frame.shape[1], frame.shape[0]),
                            )
                        writer.write(annotated)
                    if self.cfg["show_window"]:
                        cv2.imshow("speed camera", annotated)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            break

                frame_idx += 1
        finally:
            cap.release()
            if writer is not None:
                writer.release()
            if self.cfg["show_window"]:
                cv2.destroyAllWindows()

        return self.measurements


def load_config(path):
    cfg = dict(DEFAULT_CONFIG)
    with open(path) as f:
        user_cfg = json.load(f)
    unknown = set(user_cfg) - set(DEFAULT_CONFIG)
    if unknown:
        raise ValueError(f"unknown config keys: {sorted(unknown)}")
    cfg.update(user_cfg)
    return cfg


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default="config.json",
                        help="path to JSON config (see config.example.json)")
    parser.add_argument("--source", help="override video source from config")
    args = parser.parse_args()

    cfg = load_config(args.config)
    if args.source is not None:
        cfg["source"] = int(args.source) if args.source.isdigit() else args.source

    camera = SpeedCamera(cfg)
    measurements = camera.run()
    violations = [m for m in measurements if m["violation"]]
    print(f"\ndone: {len(measurements)} vehicles measured, "
          f"{len(violations)} over the {cfg['speed_limit_kmh']:.0f} km/h limit. "
          f"Log: {cfg['log_csv']}")


if __name__ == "__main__":
    main()
