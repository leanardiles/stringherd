"""Serves the built review UI, so Stringherd runs as one server at one address.

Only requests that no API route claims reach the UI: this hooks into the 404 that FastAPI
produces when nothing matches, rather than adding a catch-all route. So /api, /health and /docs
behave exactly as without a UI (an unknown /api path still gets a JSON 404, a wrong method a
405), and the UI can never shadow an endpoint.

What the UI gets:
- a file that exists in the build: the bundles in /assets, the logo and the favicon;
- any other address: index.html, so the React app opens the page itself (/review/..., /admin/...).
  Reloading a page or opening a bookmark works.

Bundles in /assets have a content hash in their names, so browsers may keep them for a year.
index.html is revalidated on every load, so a new build shows up at once.
"""

import mimetypes
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, HTMLResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

# Python takes file types from the Windows registry, which some installs map .js to text/plain;
# browsers then refuse to run the bundle. Pin the types a Vite build uses.
for _type, _ext in (
    ("text/javascript", ".js"),
    ("text/css", ".css"),
    ("image/svg+xml", ".svg"),
    ("font/woff2", ".woff2"),
    ("font/woff", ".woff"),
    ("image/x-icon", ".ico"),
):
    mimetypes.add_type(_type, _ext)

NO_CACHE = {"Cache-Control": "no-cache"}
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

# Paths the server owns. A 404 there is a real 404, never the UI.
API_PREFIXES = ("/api/", "/health", "/docs", "/redoc", "/openapi.json")

NOT_BUILT = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Stringherd</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
<h1>Stringherd is running, but the review UI is not built</h1>
<p>The API works (see <a href="/docs">/docs</a>). To use the review UI at this address, build it once:</p>
<pre>npm run build:web</pre>
<p>from the repository root, then reload this page. While working on the UI itself, use the
development server on port 5180 instead (<code>npm run dev</code> in <code>web/</code>).</p>
</body>
</html>
"""


def _owned_by_api(path: str) -> bool:
    return path == "/api" or path.startswith(API_PREFIXES)


def _file_in(dist: Path, path: str) -> Path | None:
    """The file a URL path names inside the build, or None (also for anything outside it)."""
    candidate = (dist / path.lstrip("/")).resolve()
    if candidate.is_relative_to(dist) and candidate.is_file():
        return candidate
    return None


def ui_response(dist: Path | None, path: str) -> Response:
    root = dist.resolve() if dist is not None else None
    if root is None or not (root / "index.html").is_file():
        return HTMLResponse(NOT_BUILT, status_code=404, headers=NO_CACHE)

    if path != "/" and (file := _file_in(root, path)) is not None:
        headers = IMMUTABLE if path.startswith("/assets/") else NO_CACHE
        return FileResponse(file, headers=headers)
    if path.startswith("/assets/"):
        # A bundle from an older build: answering with HTML would only confuse the browser.
        return Response(status_code=404)
    return FileResponse(root / "index.html", headers=NO_CACHE)


def serve_ui(app: FastAPI, dist: Path | None) -> None:
    """Answer unmatched GET and HEAD requests outside the API with the UI from `dist`."""
    app.state.web_dist = dist

    @app.exception_handler(StarletteHTTPException)
    async def not_found_to_ui(request: Request, exc: StarletteHTTPException) -> Response:
        path = request.url.path
        if exc.status_code == 404 and request.method in ("GET", "HEAD") and not _owned_by_api(path):
            return ui_response(request.app.state.web_dist, path)
        return await http_exception_handler(request, exc)
