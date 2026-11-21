# ProseFire community air sensor kit

_"ProseFire" is a placeholder name._

A low-cost PM2.5 sensor kit that anyone can build and set up in minutes: a NodeMCU (ESP8266) board plus a
Plantower PMS5003 sensor, a small backend, and a public air-quality map.

## What's where
| Path | What it's for |
|---|---|
| `firmware/` | Sensor firmware (PlatformIO, ESP8266) |
| `backend/` | Firebase functions, database rules, emulator tests |
| `web/` | Website: setup page, owner page, public map |
| `tools/` | Serial log capture, release-build check, (later) device simulator and factory provisioning |
| `docs/PLAN.md` | Milestones and progress |
| `docs/decisions.md` | What's decided and what's still open |
| `docs/USER_FLOW.md` | Exactly what kit recipients and volunteers do |
| `docs/FUTURE.md` | Fire Watch + outage plans (later phases) |
| `docs/reference/` | The original O2NYC workshop deck (old wiring, for reference only) |

## Developer setup (macOS)
```bash
brew install platformio firebase-cli node@22 python@3.12
python3.12 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
export PATH="$(brew --prefix node@22)/bin:$PATH"   # backend + web use Node 22
```

## Checks (same as CI)
```bash
pio run -d firmware -e release -e dev && pio test -d firmware -e native && python3 tools/check_release.py
tools/.venv/bin/python -m pytest -q tools/tests
(cd backend && npm --prefix functions ci && npm --prefix functions run build && firebase emulators:exec --only functions,firestore "npm --prefix functions test")
(cd web && npm ci && npm test && npm run build)
```

## License
Not chosen yet. Until a license is added, this code is visible but not licensed for reuse.
