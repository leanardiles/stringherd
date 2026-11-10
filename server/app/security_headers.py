"""Security headers: instructions to the browser that turn on its protections.

The server adds them to every response it sends: the API everywhere, and the review UI when the
server serves it too (locally, Docker). On Vercel the CDN serves the UI, and vercel.json gives
it the same headers; a test keeps the two lists in step.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Everything the UI loads is its own (scripts, styles, bundled fonts), so the browser may load
# nothing from elsewhere. Styles also allow inline ones: the editor and the dialogs set them.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)

HEADERS = {
    # No other site may show Stringherd in a frame (clickjacking); the second for older browsers.
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Frame-Options": "DENY",
    # Treat each file as the type the server says, never guess.
    "X-Content-Type-Options": "nosniff",
    # Other sites learn the origin a visitor came from, not the page.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Stringherd uses no camera, microphone or location.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

# Over HTTPS only: browsers then refuse plain HTTP for this site for two years.
STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains"

# The interactive API docs load their scripts and styles from a public CDN, so the content
# policy would break them; they get the other headers.
DOCS_PATHS = ("/docs", "/redoc")


class SecurityHeaders:
    def __init__(self, app: ASGIApp, *, https: bool) -> None:
        self.app = app
        self.https = https

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        docs = scope["path"].startswith(DOCS_PATHS)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                extra = dict(HEADERS)
                if docs:
                    del extra["Content-Security-Policy"]
                if self.https:
                    extra["Strict-Transport-Security"] = STRICT_TRANSPORT_SECURITY
                for name, value in extra.items():
                    if name.lower().encode() not in present:
                        headers.append((name.lower().encode(), value.encode()))
            await send(message)

        await self.app(scope, receive, send_with_headers)
