"""Helpers for launching and probing local project services.

This module keeps command/port/probe infrastructure out of WorkspaceService.
The functions are intentionally stateless so they can be tested and reused
without a database session.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shlex
import signal
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import suppress
from pathlib import Path
from typing import Protocol

from app.core.secrets import redact_sensitive_text
from app.services.workspace_project_tree import TREE_IGNORED_DIR_NAMES, TREE_IGNORED_FILE_NAMES


class LaunchServiceCandidate(Protocol):
    """Minimal protocol for discovered service matching."""

    name: str
    command_id: str


def quote_shell_arg(value: str) -> str:
    """Quote one shell argument in a platform-aware way."""
    if os.name == "nt":
        return subprocess.list2cmdline([value])
    return shlex.quote(value)


def normalize_shell_command(command: str) -> str:
    """Rewrite bare `python` calls to the active Python executable."""
    python_executable = quote_shell_arg(sys.executable)
    pattern = re.compile(r"(?:(?<=^)|(?<=[\s;|&()]))python(?=(?:\s|$))")
    return pattern.sub(lambda _match: python_executable, command)


def looks_like_empty_project_root(root: Path) -> bool:
    """Return True when a project root has no meaningful visible files."""
    if not root.exists() or not root.is_dir():
        return True
    try:
        for child in root.iterdir():
            name = child.name
            if name in TREE_IGNORED_DIR_NAMES or name in TREE_IGNORED_FILE_NAMES:
                continue
            if name.startswith("."):
                continue
            return False
    except OSError:
        return True
    return True


def score_launch_candidate(*, command_id: str, command: str) -> int:
    """Score whether a command catalog entry probably starts a service."""
    text = f"{command_id} {command}".casefold()
    blocked_patterns = (
        "pytest",
        "vitest",
        "jest",
        "playwright",
        "cypress",
        "readiness",
        "check_",
        "smoke",
        "install",
        "validate",
        "list_structure",
        "structure",
        "lint",
        "format",
        "migrate",
        "alembic",
        "compileall",
    )
    if any(pattern in text for pattern in blocked_patterns):
        return 0

    score = 0
    if command_id.startswith("run_"):
        score += 3
    if re.search(r"\b(dev|start|serve|run|up|bootrun)\b", text):
        score += 2
    if re.search(
        r"\b(npm|pnpm|yarn|bun)\b.*\b(dev|start|serve)\b|"
        r"\b(vite|next\s+dev|webpack-dev-server)\b|"
        r"\b(uvicorn|hypercorn|gunicorn|flask\s+run|runserver|http\.server)\b|"
        r"\b(cargo\s+run|go\s+run|mvn\s+spring-boot:run|gradle\s+bootrun)\b|"
        r"\bdocker\s+compose\b.*\bup\b|"
        r"\bmake\s+(run|dev|start|serve)\b",
        text,
    ):
        score += 4
    return score if score >= 3 else 0


def service_name_for_command_id(command_id: str) -> str:
    """Derive a stable service name from a command catalog id."""
    name = command_id.casefold()
    for prefix in ("run_", "serve_", "start_", "dev_"):
        if name.startswith(prefix):
            name = name[len(prefix) :]
            break
    for suffix in ("_run", "_serve", "_start", "_dev"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    name = re.sub(r"[^a-z0-9_.-]+", "-", name).strip("-_.")
    return name or command_id


def requested_service_matches(service: LaunchServiceCandidate, requested: set[str]) -> bool:
    """Return whether a discovered service matches a requested name or command id."""
    values = {
        service.name.casefold(),
        service.command_id.casefold(),
    }
    return bool(values & requested)


def dependency_command_ids_for_launch(*, command_id: str, command_catalog: dict[str, str]) -> list[str]:
    """Find setup/install commands that should run before a service command."""
    slug = command_id
    for prefix in ("run_", "serve_", "start_", "dev_", "build_", "test_", "check_", "lint_"):
        if slug.startswith(prefix):
            slug = slug[len(prefix) :]
            break
    parts = [part for part in slug.split("_") if part]
    candidates: list[str] = []
    for end in range(len(parts), 0, -1):
        stem = "_".join(parts[:end])
        candidates.append(f"install_{stem}_dependencies")
        candidates.append(f"setup_{stem}")
    return [candidate for candidate in candidates if candidate in command_catalog]


def with_available_service_port(*, command: str) -> str:
    """Rewrite a service command to an available local port when needed."""
    default_port = default_port_for_command(command)
    requested_port = extract_command_port(command, default_port=default_port)
    if is_tcp_port_available(requested_port):
        return command

    fallback_start = 15173 if default_port == 5173 else 18080
    fallback_port = find_available_tcp_port(start=fallback_start)
    return rewrite_or_append_service_port(command=command, port=fallback_port)


def rewrite_or_append_service_port(*, command: str, port: int) -> str:
    """Replace an existing service port or append a reasonable port flag/env."""
    replacements: tuple[tuple[str, str], ...] = (
        (r"--port(?:=|\s+)(\d{2,5})", f"--port {port}"),
        (r"\s-p(?:=|\s+)(\d{2,5})", f" -p {port}"),
        (r"\bPORT=(\d{2,5})", f"PORT={port}"),
        (r"\blocalhost:(\d{2,5})", f"localhost:{port}"),
        (r"\b127\.0\.0\.1:(\d{2,5})", f"127.0.0.1:{port}"),
        (r"\b0\.0\.0\.0:(\d{2,5})", f"0.0.0.0:{port}"),
    )
    for pattern, replacement in replacements:
        if re.search(pattern, command):
            return re.sub(pattern, replacement, command, count=1)

    if re.search(r"\b(npm|pnpm|yarn|bun)\b.*\b(dev|start|serve)\b", command, re.IGNORECASE):
        return f"{command} -- --host 127.0.0.1 --port {port}"
    if re.search(r"\b(vite|next\s+dev|webpack-dev-server)\b", command, re.IGNORECASE):
        return f"{command} --host 127.0.0.1 --port {port}"
    if re.search(r"\bpython\b.*\b-m\s+http\.server\b", command, re.IGNORECASE):
        return f"{command} {port}"
    if re.search(r"\b(uvicorn|hypercorn|gunicorn|flask\s+run)\b", command, re.IGNORECASE):
        return f"{command} --host 127.0.0.1 --port {port}"
    if re.search(r"\brunserver\b", command, re.IGNORECASE):
        return f"{command} 127.0.0.1:{port}"
    if os.name == "nt":
        return f"set PORT={port}&& {command}"
    return f"env PORT={port} sh -c {quote_shell_arg(command)}"


def default_port_for_command(command: str) -> int:
    """Infer the default local service port for a command."""
    normalized = command.casefold()
    if re.search(r"\b(vite|next\s+dev|webpack-dev-server)\b", normalized):
        return 5173
    if re.search(r"\b(npm|pnpm|yarn|bun)\b.*\bdev\b", normalized):
        return 5173
    return 8000


def is_tcp_port_available(port: int) -> bool:
    """Return whether a local TCP port can be bound on 127.0.0.1."""
    if port <= 0:
        return False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.2)
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            return False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def find_available_tcp_port(*, start: int, limit: int = 200) -> int:
    """Find a free local TCP port, falling back to an OS-assigned port."""
    for port in range(start, start + limit):
        if is_tcp_port_available(port):
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def terminate_subprocess(process: asyncio.subprocess.Process) -> None:
    """Terminate a subprocess group when it is still running."""
    if process.returncode is not None:
        return
    with suppress(ProcessLookupError):
        if os.name == "nt":
            process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)


def build_service_url(*, command: str) -> str:
    """Build the localhost URL for a service command."""
    default_port = default_port_for_command(command)
    port = extract_command_port(command, default_port=default_port)
    return f"http://127.0.0.1:{port}"


def extract_command_port(command: str, *, default_port: int) -> int:
    """Extract the first explicit port from a command."""
    patterns = (
        r"--port(?:=|\s+)(\d{2,5})",
        r"\s-p(?:=|\s+)(\d{2,5})",
        r"\bPORT=(\d{2,5})",
        r"\bhttp\.server\s+(\d{2,5})",
        r"\brunserver\s+(?:127\.0\.0\.1:|localhost:)?(\d{2,5})",
        r"\blocalhost:(\d{2,5})",
        r"\b127\.0\.0\.1:(\d{2,5})",
        r"\b0\.0\.0\.0:(\d{2,5})",
    )
    for pattern in patterns:
        match = re.search(pattern, command)
        if not match:
            continue
        with suppress(TypeError, ValueError):
            return int(match.group(1))
    return default_port


def read_service_log_tail(log_path: str | Path | None, *, max_chars: int = 4000) -> str:
    """Read and redact the tail of a service launch log."""
    if not log_path:
        return ""

    path = Path(log_path)
    try:
        data = path.read_bytes()
    except OSError:
        return ""

    if not data:
        return ""

    tail = data[-max_chars:].decode("utf-8", errors="replace")
    return redact_sensitive_text(tail).strip()


def probe_launched_service(url: str) -> tuple[bool, str]:
    """Probe a launched service and return `(ok, failure_reason)`."""
    reachable_response: dict[str, object] | None = None
    for path in ("/health", "/", "/docs", "/openapi.json"):
        response = http_get(join_url(url, path), timeout=2)
        status = response_status(response)
        if 200 <= status < 400:
            reachable_response = response
            break
        if status >= 500:
            return False, format_http_failure("Serviço", path, response)

    if reachable_response is None:
        return False, "Serviço iniciou, mas nenhum probe HTTP básico respondeu com status 2xx/3xx."

    openapi_failure = probe_openapi_safe_routes(url)
    if openapi_failure:
        return False, openapi_failure

    module_failure = probe_browser_module_graph(url, reachable_response)
    if module_failure:
        return False, module_failure

    return True, ""


def probe_openapi_safe_routes(url: str) -> str | None:
    """Probe OpenAPI routes that are GET-only and require no path params."""
    response = http_get(join_url(url, "/openapi.json"), timeout=2)
    status = response_status(response)
    if status == 404 or status < 200 or status >= 300:
        return None

    try:
        spec = json.loads(str(response["body"] or "{}"))
    except json.JSONDecodeError:
        return None

    for path in extract_openapi_safe_get_paths(spec):
        route_response = http_get(join_url(url, path), timeout=2)
        route_status = response_status(route_response)
        if route_status >= 500:
            return format_http_failure("Serviço", path, route_response)
    return None


def extract_openapi_safe_get_paths(spec: object) -> list[str]:
    """Extract safe GET paths from an OpenAPI document."""
    if not isinstance(spec, dict):
        return []

    paths = spec.get("paths")
    if not isinstance(paths, dict):
        return []

    safe_paths: list[str] = []
    skipped_paths = {"/", "/health", "/openapi.json", "/docs", "/redoc"}
    for path, operations in paths.items():
        if not isinstance(path, str) or path in skipped_paths or "{" in path:
            continue
        if not isinstance(operations, dict):
            continue
        get_operation = operations.get("get")
        if not isinstance(get_operation, dict) or get_operation.get("requestBody"):
            continue
        safe_paths.append(path)

    safe_paths.sort(key=lambda item: (item.count("/"), item))
    return safe_paths[:12]


def probe_browser_module_graph(url: str, response: dict[str, object]) -> str | None:
    """Probe browser module imports referenced by an HTML or JS response."""
    body = str(response["body"] or "")
    module_paths = extract_browser_module_paths(body)
    checked: set[str] = set()
    queue = [path for path in module_paths if path.startswith("/")]
    while queue and len(checked) < 80:
        path = queue.pop(0)
        if path in checked:
            continue
        checked.add(path)
        module_response = http_get(join_url(url, path), timeout=2)
        module_status = response_status(module_response)
        module_body = str(module_response["body"] or "")
        if module_status >= 500:
            return format_browser_module_failure(path, module_response)
        for next_path in extract_browser_module_paths(module_body):
            if next_path.startswith("/") and next_path not in checked:
                queue.append(next_path)
    return None


def http_get(url: str, *, timeout: float, headers: dict[str, str] | None = None) -> dict[str, object]:
    """Perform a bounded HTTP GET and return a serializable response dict."""
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(200_000)
            return {
                "status": int(response.status),
                "body": raw.decode("utf-8", errors="replace"),
                "headers": {key.lower(): value for key, value in response.headers.items()},
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read(200_000)
        return {
            "status": int(exc.code),
            "body": raw.decode("utf-8", errors="replace"),
            "headers": {key.lower(): value for key, value in exc.headers.items()},
            "error": str(exc),
        }
    except Exception as exc:
        return {"status": 0, "body": "", "headers": {}, "error": str(exc)}


def join_url(base_url: str, path: str) -> str:
    """Join a base URL and path without losing the base origin."""
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def origin_for_url(url: str) -> str | None:
    """Return the URL origin when parseable."""
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def extract_browser_module_paths(content: str) -> list[str]:
    """Extract browser module paths from HTML/JS content."""
    paths: list[str] = []
    patterns = (
        r'<script[^>]+type=["\']module["\'][^>]+src=["\']([^"\']+)["\']',
        r'\bfrom\s+["\']([^"\']+)["\']',
        r'\bimport\s*\(\s*["\']([^"\']+)["\']\s*\)',
        r'\bimport\s+["\']([^"\']+)["\']',
    )
    for pattern in patterns:
        for match in re.finditer(pattern, content):
            path = match.group(1).split("?", 1)[0]
            if path.startswith("/") and path not in paths:
                paths.append(path)
    return paths


def format_browser_module_failure(path: str, response: dict[str, object]) -> str:
    """Format a Vite/browser module transform failure."""
    body = str(response.get("body") or "")
    message_match = re.search(r'"message":"((?:\\.|[^"\\])*)"', body)
    if message_match:
        try:
            decoded = json.loads(f'"{message_match.group(1)}"')
        except json.JSONDecodeError:
            decoded = message_match.group(1)
        return f"Serviço falhou ao transformar módulo {path}: {decoded}"
    return format_http_failure("Serviço", path, response)


def format_http_failure(service_label: str, path: str, response: dict[str, object]) -> str:
    """Format a concise HTTP probe failure."""
    status = response.get("status")
    error = response.get("error")
    if status:
        body_excerpt = str(response.get("body") or "").strip().splitlines()
        detail = f": {body_excerpt[0][:180]}" if body_excerpt else ""
        return f"{service_label} respondeu HTTP {status} em {path}{detail}."
    return f"{service_label} não ficou acessível em {path}: {error or 'sem resposta'}"


def terminate_process(pid: int) -> None:
    """Terminate a process group or a single process."""
    with suppress(ProcessLookupError):
        os.killpg(pid, signal.SIGTERM)
        return
    with suppress(ProcessLookupError):
        os.kill(pid, signal.SIGTERM)


def is_process_running(pid: int) -> bool:
    """Return whether a process id is currently alive."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def sanitize_command_for_response(command: str) -> str:
    """Redact sensitive command content before sending it to clients."""
    return redact_sensitive_text(command)


def response_status(response: dict[str, object]) -> int:
    """Read a numeric status from a probe response dict."""
    value = response.get("status")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        with suppress(ValueError):
            return int(value)
    return 0


def windows_process_group_flag() -> int:
    """Return the Windows process group flag when available."""
    return int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))


def truncate(value: str, *, limit: int = 96) -> str:
    """Normalize whitespace and truncate a short display string."""
    clean = " ".join(value.split())
    if len(clean) <= limit:
        return clean
    return clean[: limit - 1].rstrip() + "…"


def enum_value(value: object) -> str | None:
    """Convert enum-like values to their string value."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    raw_value = getattr(value, "value", None)
    if raw_value is None:
        return str(value)
    return str(raw_value)
