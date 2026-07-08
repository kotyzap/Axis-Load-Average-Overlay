# Load Average Overlay

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Version](https://img.shields.io/badge/version-1.0.8-blue.svg)
![Platform](https://img.shields.io/badge/platform-Axis%20Camera-000000.svg)
![CamScripter](https://img.shields.io/badge/built%20for-CamScripter-2563eb.svg)

Turn your Axis camera's own health data into a live, color-coded overlay — no external monitoring stack required.

Load Average Overlay is a lightweight CamScripter microapp that reads your Axis camera's CPU load straight from the device and pushes it onto the video feed in real time via CamOverlay. If a camera is struggling — overloaded by too many analytics apps, a bad stream config, or failing hardware — you'll see it before your footage does.

## Why it matters

- **Catch problems before they become outages.** A camera silently choking on CPU load drops frames, delays events, and degrades video quality long before it fully fails. This overlay makes that invisible risk visible, directly on the stream operators already watch.
- **Zero extra infrastructure.** No dashboards to stand up, no agents to install, no separate monitoring service to maintain. It runs on the camera itself and displays through CamOverlay, a tool you likely already use.
- **Built for fleets, not just one camera.** Deploy it across an entire estate of Axis devices and give NOCs and field techs an at-a-glance signal for which units need attention.

## How it works

- Polls `/proc/loadavg` on the camera at a configurable interval (default: every 5 seconds).
- Pushes 1-minute, 5-minute, and 15-minute load averages to a CamOverlay Custom Graphics service.
- Color-codes every value automatically — green under 2.0, orange between 2.0–3.0, red above 3.0 — so severity reads instantly, without needing to interpret raw numbers.
- Supports both local cameras and CamStreamer Cloud (device-connect.net) deployments.

## Key features

- **Flexible display modes** — show load values as separate overlay fields, a single combined string, or both at once, with a customizable text format.
- **Live settings dashboard** — a clean, built-in configuration UI shows real-time load values and the last push result before you save, so you know it's working without checking camera logs.
- **Light & dark themes** — matches whatever environment you're configuring from.
- **Resilient upgrades** — settings from older versions merge safely with new defaults, so updating the app never breaks an existing configuration.
- **Cloud-ready** — works identically whether the camera is on your local network or reachable only through CamStreamer Cloud.

## Who it's for

- **Integrators and installers** who need a fast, visual way to confirm a camera is healthy after deployment.
- **NOC and monitoring teams** who want CPU health baked into the video wall itself, alongside the footage it affects.
- **Axis camera fleet operators** looking for a no-cost, no-dependency way to spot performance issues early.

## At a glance

| | |
|---|---|
| Runs on | Axis cameras via CamScripter |
| Displays via | CamOverlay Custom Graphics |
| Data source | Native `/proc/loadavg` |
| Update interval | Configurable (default 5s) |
| Deployment | Local network or CamStreamer Cloud |
| Current version | 1.0.8 |

## License

This project is licensed under the [MIT License](LICENSE) — free to use, modify, and distribute, including commercially, with attribution.
