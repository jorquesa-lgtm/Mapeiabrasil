# Deployment plan — home speed camera (30 km/h)

Status snapshot so this can be picked up in a later session without context.

## Where things stand

| Phase | Status |
|---|---|
| 1. Detection/tracking/speed engine (`speed_camera.py`) | ✅ Done |
| 2. Calibration tooling (`calibrate.py`, interactive + headless) | ✅ Done |
| 3. End-to-end verification (`test_synthetic.py`, <0.5 km/h error) | ✅ Done |
| 4. Camera connection (RTSP URL) | ⬜ Pending — needs your camera's stream URL |
| 5. Calibration (two line positions + measured distance) | ⬜ Pending — **you will measure the on-street distance between two reference points** |
| 6. Trial run + tuning | ⬜ Pending |
| 7. Ongoing monitoring | ⬜ Optional |

## What's left, step by step

### 4. Connect the camera (~10 min)

1. Find your camera's RTSP URL (camera app/manual; typical shape:
   `rtsp://user:password@CAMERA_IP:554/stream1`).
2. `cp config.example.json config.json` and set `"source"` to that URL.
3. Sanity-check the connection:
   ```bash
   python3 calibrate.py --source "rtsp://..." --snapshot frame.jpg
   ```
   If `frame.jpg` shows your street, the feed works.

### 5. Calibrate (the part waiting on your measurement)

1. In `frame.jpg`, pick two reference points on the road, as far apart as
   clearly visible, roughly perpendicular to traffic (driveway edges, lamp
   posts, pavement joints).
2. **Measure the real distance between them on the street** (tape measure
   or wheel; a phone GPS is not accurate enough at this scale).
3. Fill into `config.json`:
   - `line_a_x` — x pixel column of the first point in `frame.jpg`
   - `line_b_x` — x pixel column of the second point
   - `distance_meters` — your measurement
   (Or run `python3 calibrate.py --source "rtsp://..." --config config.json`
   on a machine with a display and click the two points instead.)

### 6. Trial run

1. Run with everything captured for review:
   ```bash
   python3 speed_camera.py --config config.json
   ```
   with `"save_all_passes": true` for the first day.
2. Sanity-check: drive past your own camera at a known steady speed
   (e.g. 20 km/h on the speedometer) and compare with the log — this is
   the single best validation of the calibration.
3. Tune if needed (see README "Tuning"): `min_contour_area` up if
   pedestrians/animals get logged, down if cars are missed;
   `tolerance_kmh` up if borderline 31–32 km/h readings feel noisy.
4. Once happy, set `"save_all_passes": false` to keep only violations.

### 7. Ongoing monitoring (optional)

- Run it as a service so it survives reboots (e.g. a `systemd` unit or
  `tmux` on a Raspberry Pi near the camera).
- `captures/speed_log.csv` accumulates every measurement — after a week
  you have real data: % of vehicles over 30 km/h, worst offenders by hour,
  peak times. That's the evidence pack for the municipality.

## Possible future enhancements (not started, in rough priority order)

1. **Weekly summary report** — small script aggregating the CSV into
   counts/percentiles per day/hour; the persuasive artifact for authorities.
2. **Night robustness** — headlight glare defeats background subtraction;
   options: restrict to daylight hours, or upgrade detection to a YOLO
   model (drop-in replacement for `detect_vehicles()`).
3. **Notifications** — push/telegram alert on violation.
4. **Dashboard** — this repo is already a React + Supabase app; violations
   could be uploaded to a Supabase table and charted in the existing
   dashboard.
5. **Plate capture** — snapshot is already saved; readable plates need a
   camera with enough zoom/resolution at the road, and mind LGPD before
   sharing (see README "Legal note").

## Key facts (so nothing needs re-deriving)

- Speed formula: `speed = distance_meters / (t_cross_B − t_cross_A)`,
  crossing times interpolated between frames.
- Limit 30 km/h + 2 km/h tolerance → flags at >32 km/h. Both configurable.
- Verified accuracy on synthetic footage: ≤0.5 km/h error at 25/30/48 km/h.
- Measurement error scales linearly with the distance-measurement error:
  20 cm error over 20 m ≈ 1% ≈ 0.3 km/h at 30 km/h. Measure once, carefully.
- `config.json` is gitignored (it will hold the camera password). Only
  `config.example.json` is committed.
