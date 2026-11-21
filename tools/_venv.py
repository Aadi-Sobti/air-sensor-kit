"""Re-run a tool under tools/.venv if its dependencies aren't importable by the current Python.

Lets `python3 tools/<tool>.py` work as documented even when the system Python lacks pyserial.
"""
import os
import sys
from pathlib import Path

VENV_PY = Path(__file__).resolve().parent / ".venv" / "bin" / "python"


def ensure(module: str) -> None:
    try:
        __import__(module)
        return
    except ImportError:
        pass
    if VENV_PY.exists() and Path(sys.executable).resolve() != VENV_PY.resolve() \
            and not os.environ.get("PROSEFIRE_VENV_REEXEC"):
        os.environ["PROSEFIRE_VENV_REEXEC"] = "1"
        os.execv(str(VENV_PY), [str(VENV_PY), *sys.argv])
    sys.exit(
        f"Missing Python package '{module}'. Set up the tools venv:\n"
        "  python3.12 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt"
    )
