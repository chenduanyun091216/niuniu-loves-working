import json
import unittest

from test_server.test_server import app


async def request(method: str, path: str, query: str = "", body: bytes = b"", headers=None):
    messages = []
    request_sent = False

    async def receive():
        nonlocal request_sent
        if request_sent:
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    encoded_headers = [(name.lower().encode(), value.encode()) for name, value in (headers or [])]
    await app({
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": query.encode(),
        "headers": encoded_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8000),
        "root_path": "",
    }, receive, send)

    start = next(message for message in messages if message["type"] == "http.response.start")
    response_body = b"".join(
        message.get("body", b"") for message in messages if message["type"] == "http.response.body"
    )
    return start["status"], dict(start["headers"]), response_body


class TestServerSmokeTest(unittest.IsolatedAsyncioTestCase):
    async def test_plain_route_keeps_normal_behavior(self):
        status, _, body = await request("GET", "/api/plain", "source=smoke")
        payload = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(payload["source"], "smoke")
        self.assertEqual(payload["data"][0]["name"], "未加密响应")

    async def test_explain_route_reports_request_context_without_cookie_value(self):
        status, headers, body = await request(
            "POST",
            "/api/echo",
            "source=smoke&isExplain=true",
            b'{"name":"demo"}',
            [("content-type", "application/json"), ("cookie", "niuniu_test_session=secret")],
        )
        payload = json.loads(body)
        sql = payload["data"][0]["sql"]
        self.assertEqual(status, 200)
        self.assertEqual(headers[b"x-test-mode"], b"sql-explain")
        self.assertIn("-- method: POST", sql)
        self.assertIn("-- mock cookie received: yes", sql)
        self.assertNotIn("secret", sql)

    async def test_table_route_supports_sql_explain(self):
        status, headers, body = await request("GET", "/api/table", "source=smoke&isExplain=true")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get(b"x-test-mode"), b"sql-explain")
        self.assertIn("SELECT", json.loads(body)["data"][0]["sql"])

    async def test_table_route_returns_direct_object_list(self):
        status, _, body = await request("GET", "/api/table", "source=smoke")
        payload = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(len(payload), 2)
        self.assertEqual(payload[0]["source"], "smoke")

    async def test_loose_params_route_echoes_python_style_parameter(self):
        status, _, body = await request(
            "POST",
            "/api/loose-params",
            body=b'{"params":"{\'tag_id\': \'LTE=\'}"}',
            headers=[("content-type", "application/json")],
        )
        payload = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(payload["mode"], "loose-params")
        self.assertEqual(payload["payload"]["params"], "{'tag_id': 'LTE='}")


if __name__ == "__main__":
    unittest.main()
