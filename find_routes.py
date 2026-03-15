import os
import re

BACKEND_DIR = r"d:\EZTRACK\backend"
FRONTEND_DIR = r"d:\EZTRACK\frontend\src"

backend_routes = []
frontend_calls = []

backend_pattern = re.compile(r'@(?:router|app)\.(get|post|put|delete|patch)\([\'"]([^\'"]+)[\'"]')
frontend_fetch_pattern = re.compile(r'fetch\(\s*[\'"`]([^\'"`]+)[\'"`]')
frontend_axios_pattern = re.compile(r'axios\.(get|post|put|delete|patch)\(\s*[\'"`]([^\'"`]+)[\'"`]')

def scan_backend():
    for root, dirs, files in os.walk(BACKEND_DIR):
        if 'venv' in root or '__pycache__' in root:
            continue
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for idx, line in enumerate(f):
                            match = backend_pattern.search(line)
                            if match:
                                backend_routes.append({
                                    "file": os.path.relpath(path, BACKEND_DIR).replace('\\', '/'),
                                    "line": idx + 1,
                                    "method": match.group(1).upper(),
                                    "path": match.group(2)
                                })
                except Exception:
                    pass

def scan_frontend():
    for root, dirs, files in os.walk(FRONTEND_DIR):
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.mjs')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for idx, line in enumerate(f):
                            match_fetch = frontend_fetch_pattern.search(line)
                            if match_fetch:
                                frontend_calls.append({
                                    "file": os.path.relpath(path, FRONTEND_DIR).replace('\\', '/'),
                                    "line": idx + 1,
                                    "method": "FETCH",
                                    "url": match_fetch.group(1)
                                })
                            match_axios = frontend_axios_pattern.search(line)
                            if match_axios:
                                frontend_calls.append({
                                    "file": os.path.relpath(path, FRONTEND_DIR).replace('\\', '/'),
                                    "line": idx + 1,
                                    "method": match_axios.group(1).upper(),
                                    "url": match_axios.group(2)
                                })
                except Exception:
                    pass

scan_backend()
scan_frontend()

with open(r"d:\EZTRACK\backend_endpoints.md", "w", encoding='utf-8') as f:
    f.write("# Backend Endpoints\n\n| Method | Path | File |\n|---|---|---|\n")
    for r in sorted(backend_routes, key=lambda x: x['path']):
        f.write(f"| {r['method']} | `{r['path']}` | `{r['file']}:{r['line']}` |\n")

with open(r"d:\EZTRACK\frontend_endpoints.md", "w", encoding='utf-8') as f:
    f.write("# Frontend API Calls\n\n| Method | URL | File |\n|---|---|---|\n")
    for c in sorted(frontend_calls, key=lambda x: x['url']):
        f.write(f"| {c['method']} | `{c['url']}` | `{c['file']}:{c['line']}` |\n")

print(f"Found {len(backend_routes)} backend routes and {len(frontend_calls)} frontend API calls.")
