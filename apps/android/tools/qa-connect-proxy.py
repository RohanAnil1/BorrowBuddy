"""Opt-in local QA tunnel for emulators on networks that block emulator DNS.

CONNECT forwards encrypted TLS bytes without intercepting certificates, headers,
credentials or request bodies. It accepts only this project's HTTPS origin and
binds only to host loopback. Never used by or packaged in the Android application.
Stop this process and clear the emulator's global http_proxy after QA.
"""
import select
import socket
import socketserver

ORIGIN = "oijteuxelpwziplqwkvi.supabase.co"


class Tunnel(socketserver.BaseRequestHandler):
    def handle(self):
        upstream = None
        try:
            self.request.settimeout(15)
            header = bytearray()
            while b"\r\n\r\n" not in header and len(header) < 8192:
                chunk = self.request.recv(1)
                if not chunk:
                    return
                header.extend(chunk)
            if bytes(header).split(b"\r\n", 1)[0] != f"CONNECT {ORIGIN}:443 HTTP/1.1".encode():
                self.request.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                return
            upstream = socket.create_connection((ORIGIN, 443), timeout=15)
            self.request.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            streams = [self.request, upstream]
            while True:
                readable, _, _ = select.select(streams, [], [], 120)
                if not readable:
                    return
                for stream in readable:
                    payload = stream.recv(65536)
                    if not payload:
                        return
                    (upstream if stream is self.request else self.request).sendall(payload)
        except (OSError, TimeoutError):
            pass
        finally:
            if upstream:
                upstream.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", 18081), Tunnel) as server:
        print("QA encrypted CONNECT tunnel on loopback:18081; one project origin only", flush=True)
        server.serve_forever()
