from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, Header, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles


TEST_SITE = Path(__file__).resolve().parent / "test_site"
ENCRYPTED_JSON = (
    "Rnexv/QSkD//fgajr9ZhRKbyhbHCFe9XfO0aeFwLpJ6u4WRMDkhINubWasu8/"
    "BdIJcjr+z/2IQmbDih30pdBTw=="
)
PNG_1X1 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

app = FastAPI(title="牛牛爱上班 API 测试站")


async def mock_sql_explain(request: Request) -> JSONResponse:
    body = await request.body()
    source = request.query_params.get("source", "").replace("\r", " ").replace("\n", " ")[:120]
    demo_header = request.headers.get("x-demo-header", "(missing)").replace("\r", " ").replace("\n", " ")[:120]
    sql = "\n".join((
        "-- Mock SQL explain response",
        f"-- method: {request.method}",
        f"-- query parameter count: {len(request.query_params)}",
        f"-- source parameter: {source}",
        f"-- body bytes: {len(body)}",
        f"-- mock cookie received: {'yes' if 'niuniu_test_session' in request.cookies else 'no'}",
        f"-- x-demo-header: {demo_header}",
        "SELECT id, name, active",
        "FROM demo_items",
        "WHERE source = 'mock'",
        "ORDER BY id",
        "LIMIT 20;",
    ))
    return JSONResponse({"data": [{"sql": sql}]}, headers={"X-Test-Mode": "sql-explain"})


@app.get("/", include_in_schema=False)
async def home() -> RedirectResponse:
    return RedirectResponse(url="/test/")


@app.get("/api/plain")
async def plain_response(
    request: Request,
    source: str = Query(default="button"),
    is_explain: bool = Query(default=False, alias="isExplain"),
) -> Any:
    if is_explain:
        return await mock_sql_explain(request)
    return {
        "success": True,
        "mode": "plain",
        "source": source,
        "data": [{"id": 1, "name": "未加密响应", "active": True}],
    }


@app.get("/api/table")
def table_response(source: str = Query(default="button")) -> list[dict[str, Any]]:
    return [
        {"id": 1, "name": "小明", "score": 98, "active": True, "source": source},
        {"id": 2, "name": "小红", "score": 95, "active": False, "source": source},
    ]


@app.get("/api/image")
def image_response() -> Response:
    import base64

    return Response(base64.b64decode(PNG_1X1), media_type="image/png")


@app.get("/api/encrypted", response_class=PlainTextResponse)
async def encrypted_response(
    request: Request,
    source: str = Query(default="button"),
    is_explain: bool = Query(default=False, alias="isExplain"),
) -> PlainTextResponse:
    if is_explain:
        return await mock_sql_explain(request)
    return PlainTextResponse(
        ENCRYPTED_JSON,
        media_type="text/plain",
        headers={"X-Test-Mode": "encrypted", "X-Test-Source": source},
    )


@app.get("/api/partial")
async def partial_response(
    request: Request,
    source: str = Query(default="button"),
    is_explain: bool = Query(default=False, alias="isExplain"),
) -> Any:
    if is_explain:
        return await mock_sql_explain(request)
    return {
        "status": 200,
        "source": source,
        "message": "普通字段保持原样",
        "data": ENCRYPTED_JSON,
    }


@app.post("/api/base64")
async def base64_response(
    request: Request,
    payload: dict[str, Any] = Body(...),
    filter_value: str = Query(default="", alias="filter"),
    is_explain: bool = Query(default=False, alias="isExplain"),
) -> Any:
    if is_explain:
        return await mock_sql_explain(request)
    return {
        "filter": filter_value,
        "payload": payload,
        "result": "MQ==",
        "plain": "普通文本保持原样",
    }


@app.post("/api/echo")
async def echo_request(
    request: Request,
    payload: dict[str, Any] = Body(...),
    source: str = Query(default="button"),
    x_demo_header: str = Header(default=""),
    is_explain: bool = Query(default=False, alias="isExplain"),
) -> Any:
    if is_explain:
        return await mock_sql_explain(request)
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
