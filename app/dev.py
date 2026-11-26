"""QASSIMZ Hub — Local browser preview server for development & UI testing."""
from __future__ import annotations

import sys
import time
from server import HubApi, start_server


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    api = HubApi()
    url = start_server(api, port=port)
    print(f"QASSIMZ Hub dev server running at: {url}", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
