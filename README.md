# 牛牛爱上班

Chrome Manifest V3 扩展，用于查看当前网页的接口请求，并在本地解密、格式化响应 JSON。

## 使用

1. 打开 Chrome 的扩展管理页，启用「开发者模式」，选择「加载已解压的扩展程序」，并选择项目中的 `extension/` 目录。
2. 打开需要调试的网页，再打开开发者工具。
3. 选择开发者工具顶部的「牛牛爱上班」面板，然后刷新网页以捕获完整请求。

工具栏图标会显示使用提示。面板通过 Chrome DevTools Network API 读取当前检查页面的请求，不申请站点访问权限。AES 解密在浏览器本地执行。

Payload 面板会尝试解密 Query、Form Data 和 JSON 请求体中的 AES 密文或 Base64 文本；Response 会递归处理 JSON 对象和数组中的字段，也支持整段 AES/Base64 响应。普通文本、无效 Base64 和密钥不匹配的值保持原样。AES 解密使用面板「解密设置」中的密钥，默认使用 `crypto.js` 内置密钥；自定义密钥只保存在扩展本地。`Preview` 显示结构化内容，`Response` 显示格式化后的响应。

工具栏的「原始内容」开关可在原始请求/响应与解码后的请求/响应之间切换。

接口列表使用 Chrome Network 风格的名称和类型图标；可拖动列表与详情之间的分隔线调整宽度。Payload 和 Response 中的 JSON 会格式化并进行语法着色，原始模式仍保留密文和 Base64 字段值。

作者：Mr.Chen

## 本地测试站

项目包含一个 FastAPI 测试网页，可同时验证未加密 JSON、整段 AES、部分字段 AES、Base64 请求/响应，以及请求 Header/Payload 的展示。

首次安装测试站依赖时运行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r test_server/requirements-test.txt
```

依赖安装后，从项目根目录运行 `./test_server/start.sh` 启动后端。脚本会执行 `test_server.py`，由 Python 主入口调用 `uvicorn.run()`。停止服务时，在终端按 `Ctrl+C`。如果提示 8000 端口已被占用，先停止旧服务再启动。

打开 `http://127.0.0.1:8000/test/`，在本页打开开发者工具并切换到「牛牛爱上班」面板，再点「运行全部样例」。加密接口使用与默认 AES 密钥匹配的固定密文；使用其他密钥测试时，需要同步更新 `test_server/test_server.py` 中的测试密文。
