from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, Header, Query
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles


TEST_SITE = Path(__file__).resolve().parent / "test_site"
ENCRYPTED_JSON = (
    "Rnexv/QSkD//fgajr9ZhRKbyhbHCFe9XfO0aeFwLpJ6u4WRMDkhINubWasu8/"
    "BdIJcjr+z/2IQmbDih30pdBTw=="
)

app = FastAPI(title="牛牛爱上班 API 测试站")


@app.get("/", include_in_schema=False)
async def home() -> RedirectResponse:
    return RedirectResponse(url="/test/")


@app.get("/api/plain")
async def plain_response(source: str = Query(default="button")) -> dict[str, Any]:
    return {
        "success": True,
        "mode": "plain",
        "source": source,
        "data": [{"id": 1, "name": "未加密响应", "active": True}],
    }


@app.get("/api/encrypted", response_class=PlainTextResponse)
async def encrypted_response(source: str = Query(default="button")) -> PlainTextResponse:
    return PlainTextResponse(
        ENCRYPTED_JSON,
        media_type="text/plain",
        headers={"X-Test-Mode": "encrypted", "X-Test-Source": source},
    )


@app.get("/api/partial")
async def partial_response(source: str = Query(default="button")) -> dict[str, Any]:
    return {
        "status": 200,
        "source": source,
        "message": "普通字段保持原样",
        "data": ENCRYPTED_JSON,
    }


@app.post("/api/base64")
async def base64_response(
    payload: dict[str, Any] = Body(...),
    filter_value: str = Query(default="", alias="filter"),
) -> dict[str, Any]:
    return {
        "filter": filter_value,
        "payload": payload,
        "result": "MQ==",
        "plain": "普通文本保持原样",
    }


@app.post("/api/echo")
async def echo_request(
    payload: dict[str, Any] = Body(...),
    source: str = Query(default="button"),
    x_demo_header: str = Header(default=""),
) -> dict[str, Any]:
    return {
        "success": True,
        "mode": "plain-echo",
        "source": source,
        "request_header": x_demo_header,
        "payload": payload,
    }


app.mount("/test", StaticFiles(directory=TEST_SITE, html=True), name="test-site")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "test_server:app",
        app_dir=str(Path(__file__).resolve().parent),
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[str(Path(__file__).resolve().parent)],
    )
