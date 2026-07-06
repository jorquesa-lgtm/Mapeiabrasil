# Speed Camera — home camera speed detection (30 km/h limit)

Turn a fixed home camera pointed at the street into a speed camera. It
detects passing vehicles, measures their speed, and for anything above the
configured limit (default **30 km/h**) it saves an annotated evidence
snapshot and logs the event to CSV.

```
[22:30:52] vehicle #2 B->A 48.0 km/h — VIOLATION
```

## How it measures speed

Two virtual lines (A and B) are placed across the road in the image. You
measure the real-world distance between those two positions on the street
once. The software tracks each vehicle and times how long its center takes
to travel from one line to the other:

```
speed = distance_between_lines / travel_time
```

Crossing times are interpolated between frames, so a 30 fps camera gives
sub-frame timing accuracy. In the included synthetic test the error is
under 0.5 km/h.

- **Detection**: OpenCV MOG2 background subtraction (works day-long on a
  fixed camera, no GPU or model download needed — runs fine on a
  Raspberry Pi).
- **Tracking**: nearest-centroid tracker, handles multiple vehicles and
  both directions of travel simultaneously.
- **Evidence**: violators get a JPEG snapshot with bounding box, measured
  speed, limit and timestamp, plus a row in `captures/speed_log.csv`.

## Setup

```bash
cd speed-camera
pip install -r requirements.txt
cp config.example.json config.json
```

### 1. Point it at your camera

Edit `source` in `config.json`:

| Camera type | `source` value |
|---|---|
| IP camera (most home cameras) | `"rtsp://user:password@192.168.1.10:554/stream1"` |
| USB webcam | `0` |
| Recorded clip (for testing) | `"street.mp4"` |

Most home cameras (Intelbras, Hikvision, TP-Link Tapo, Reolink, etc.)
expose an RTSP URL — check the camera's app/manual for it. Cloud-only
cameras (some Ring/Nest models) don't expose a local stream and won't work
directly.

### 2. Calibrate (one time)

Pick two reference points on the road visible in the image that you can
physically measure between (driveway edges, lamp posts, road markings).
The farther apart, the more accurate.

With a display:

```bash
python3 calibrate.py --source "rtsp://..." --config config.json
# click line A, click line B, type the measured distance in meters
```

Headless (e.g. over SSH to a Raspberry Pi):

```bash
python3 calibrate.py --source "rtsp://..." --snapshot frame.jpg
# open frame.jpg, read the two x pixel coordinates, and edit
# line_a_x / line_b_x / distance_meters in config.json
```

### 3. Run

```bash
python3 speed_camera.py --config config.json
```

Violations appear in the console, in `captures/*.jpg` and in
`captures/speed_log.csv`. Set `"show_window": true` for a live preview,
`"save_all_passes": true` to snapshot every vehicle, or
`"record_annotated": "out.mp4"` to record an annotated video.

## Verify it works

An end-to-end test renders a synthetic street video with three cars at
known speeds (25, 30 and 48 km/h) and checks the measurements and that only
the 48 km/h car is flagged:

```bash
python3 test_synthetic.py
```

## Tuning

| Key | What it does |
|---|---|
| `speed_limit_kmh` | The limit (default 30) |
| `tolerance_kmh` | Grace above the limit before flagging (default 2) |
| `min_contour_area` | Raise to ignore pedestrians/cats/bikes; lower if cars are missed (depends on resolution and distance) |
| `min_speed_kmh` | Ignore measurements below this (noise, pedestrians) |
| `max_track_distance` | Max pixel jump per frame to keep the same track — raise for very fast traffic or low fps |

## Accuracy & honest limitations

- Speed error is proportional to your distance-measurement error: measure
  the on-street distance between the two lines carefully.
- Works best when the camera views the street roughly side-on. A strongly
  angled view compresses pixels unevenly; keep the two lines within the
  central part of the frame.
- Background subtraction assumes a fixed camera. Heavy rain, camera shake,
  or headlight glare at night will produce noise — raise
  `min_contour_area` / `tolerance_kmh` if needed.
- Two vehicles overlapping in frame can merge into one detection.

## Legal note

This is a citizen-monitoring tool: great for documenting a speeding problem
on your street and building a case for your municipality (petitions for
speed bumps, signage, enforcement). It is **not** a certified enforcement
device — measurements from it generally can't be used to issue fines, and
recording public streets may be subject to local privacy rules (e.g. LGPD
in Brazil). Check your local regulations before publishing footage that
shows plates or people.
