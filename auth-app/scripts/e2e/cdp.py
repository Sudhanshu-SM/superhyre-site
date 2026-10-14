"""Minimal headless-Chrome driver over the DevTools protocol (python `websockets` only).

    from cdp import Browser
    b = Browser(port=9340, size=(1440, 900)); await b.start()
    await b.goto("http://localhost:5173/access/")
    await b.wait_text("Send me a code"); await b.js("document.querySelector('#email').focus()")
    await b.type("someone@acme-co.io", enter=True)        # code step: '#code', then type "000000"

Each Browser() is a fresh profile (a different person). Local development only.
"""
import asyncio, atexit, base64, json, os, shutil, signal, subprocess, tempfile, time, urllib.request
import websockets

# Every Chrome started here is killed (whole process group, profile removed) on close() and when python exits, so a crashed
# or interrupted test run cannot leave browsers running. Run ONE Browser at a time and close it before opening the next.
_LIVE = []


def _reap(proc, directory):
    if proc is not None and proc.poll() is None:
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(proc.pid, sig)
            except (ProcessLookupError, PermissionError):
                break
            try:
                proc.wait(timeout=3)
                break
            except subprocess.TimeoutExpired:
                continue
    shutil.rmtree(directory, ignore_errors=True)


@atexit.register
def _reap_all():
    for proc, directory in list(_LIVE):
        _reap(proc, directory)


class Browser:
    def __init__(self, port=9333, size=(1440, 900), dark=False):
        self.port, self.size, self.dark, self._id, self.proc, self.ws = port, size, dark, 0, None, None
        self.dir = tempfile.mkdtemp(prefix="cdp-profile-")
        self.logs = []

    async def start(self):
        self.proc = subprocess.Popen(
            ["google-chrome", "--headless=new", f"--remote-debugging-port={self.port}", f"--user-data-dir={self.dir}",
             f"--window-size={self.size[0]},{self.size[1]}", "--no-first-run", "--no-default-browser-check",
             "--disable-gpu", "--no-sandbox", "--disable-extensions", "--disable-background-networking",
             "--disable-dev-shm-usage", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        _LIVE.append((self.proc, self.dir))
        page = None
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json"))
                page = next(t for t in tabs if t["type"] == "page")
                break
            except Exception:
                await asyncio.sleep(0.25)
        if page is None:
            raise RuntimeError("chrome did not start")
        self.ws = await websockets.connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024)
        self._pending = {}
        self._reader = asyncio.create_task(self._read())
        for d in ("Page", "Runtime", "Network", "Log"):
            await self.send(f"{d}.enable")
        await self.send("Emulation.setDeviceMetricsOverride", width=self.size[0], height=self.size[1], deviceScaleFactor=1, mobile=False)
        if self.dark:
            await self.send("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": "dark"}])

    async def _read(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if "id" in m and m["id"] in self._pending:
                self._pending.pop(m["id"]).set_result(m)
            elif m.get("method") == "Runtime.consoleAPICalled":
                self.logs.append(("console." + m["params"]["type"], " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])))
            elif m.get("method") == "Runtime.exceptionThrown":
                self.logs.append(("exception", m["params"]["exceptionDetails"].get("text", "")))

    async def send(self, method, **params):
        self._id += 1
        fut = asyncio.get_event_loop().create_future()
        self._pending[self._id] = fut
        await self.ws.send(json.dumps({"id": self._id, "method": method, "params": params}))
        r = await asyncio.wait_for(fut, 60)
        if "error" in r:
            raise RuntimeError(f"{method}: {r['error']}")
        return r.get("result", {})

    async def goto(self, url):
        await self.send("Page.navigate", url=url)
        await asyncio.sleep(0.8)

    async def js(self, expr):
        r = await self.send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", "js error"))
        return r["result"].get("value")

    async def text(self):
        return await self.js("document.body ? document.body.innerText : ''")

    async def url(self):
        return await self.js("location.href")

    async def wait_text(self, needle, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if needle.lower() in ((await self.text()) or "").lower():
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.3)
        return False

    async def wait_js(self, expr, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if await self.js(expr):
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.3)
        return False

    async def type(self, text, enter=False):
        await self.send("Input.insertText", text=text)
        if enter:
            await self.key("Enter")

    async def key(self, key):
        code = {"Enter": 13, "Tab": 9, "Escape": 27}[key]
        for t in ("keyDown", "keyUp"):
            await self.send("Input.dispatchKeyEvent", type=t, key=key, code=key, windowsVirtualKeyCode=code,
                            text="\r" if key == "Enter" and t == "keyDown" else "")

    async def click_exact(self, label):
        """Click the first visible button/link whose first line of text equals `label` (case-insensitive)."""
        return await self.js(
            "((l)=>{const el=[...document.querySelectorAll('button,a,[role=button]')].find(e=>{const t=(e.innerText||'').trim().split('\\n')[0].trim().toLowerCase();return t===l.toLowerCase()&&e.getBoundingClientRect().width>0});if(!el)return false;el.click();return true})("
            + json.dumps(label) + ")")

    async def shot(self, path):
        r = await self.send("Page.captureScreenshot", format="png")
        open(path, "wb").write(base64.b64decode(r["data"]))

    async def close(self):
        try:
            if self.ws:
                await self.ws.close()
        finally:
            _reap(self.proc, self.dir)
            _LIVE[:] = [(p, d) for p, d in _LIVE if p is not self.proc]
