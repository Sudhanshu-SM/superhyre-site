"""SuperHyre dev server: python http.server + HTTP Range support.

Chrome requires Range (206 partial content) responses to make media
seekable. `python -m http.server` does not implement Range, so videos
load but cannot be scrubbed. Run:  python serve.py [port]
"""
import http.server
import os
import re
import sys
from functools import partial


class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        try:
            if not os.path.isfile(path):
                return super().send_head()
            f = open(path, 'rb')
        except OSError:
            return super().send_head()
        fs = os.fstat(f.fileno())
        size = fs.st_size

        range_header = self.headers.get('Range')
        m = re.match(r'bytes=(\d*)-(\d*)', range_header or '')
        if m:
            start = int(m.group(1) or 0)
            end = int(m.group(2) or size - 1)
            end = min(end, size - 1)
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                f.close()
                return None
            self.send_response(206)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Last-Modified', self.date_time_string(fs.st_mtime))
            self.end_headers()
            f.seek(start)
            return f

        self.send_response(200)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(size))
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Last-Modified', self.date_time_string(fs.st_mtime))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()
        return f

    def end_headers(self):
        # Keep-alive friendly headers for streaming media
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8077
    handler = partial(RangeRequestHandler, directory=os.path.dirname(os.path.abspath(__file__)))
    http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
