# 牛牛爱上班

Chrome Manifest V3 扩展，用于查看当前网页的接口请求，并在本地解密、格式化响应 JSON。

## 使用

1. 打开 Chrome 的扩展管理页，启用「开发者模式」，选择「加载已解压的扩展程序」，并选择项目中的 `extension/` 目录。
2. 打开需要调试的网页，再打开开发者工具。
3. 选择开发者工具顶部的「牛牛爱上班」面板。面板打开时会先载入当前 Network 中已有的接口请求，之后继续跟随浏览器捕获新请求。

工具栏图标会显示使用提示。面板通过 Chrome DevTools Network API 读取当前检查页面的请求，不申请站点访问权限。解密在浏览器本地执行。

Payload 面板会尝试解密 Query、Form Data 和 JSON 请求体中的密文或 Base64 文本；Response 会递归处理 JSON 对象和数组中的字段，也支持整段密文响应。面板「解密设置」支持 AES（ECB/PKCS7，默认）、DES（ECB/PKCS7）、3DES（ECB/PKCS7）和 Base64 解码；默认方式和默认密钥仍来自 `crypto.js`，自定义配置只保存在扩展本地。`Preview` 显示结构化内容，图片、音视频和 PDF 等文件按类型预览，`Response` 显示格式化后的文本响应。

工具栏的「原始内容」开关可在原始请求/响应与解密或解码后的请求/响应之间切换。

亮色、暗色主题都使用紧凑的专业布局：提供 13px 普通界面字体、窄宽度双行工具栏、Method / Status / Time 请求列，以及表格行悬停、冻结序号列、列宽拖动和长文本查看；请求列表标题栏的箭头可切换极简/详细列表并自动调整宽度，JSON、SQL 等数据区域仍使用 11px 等宽字体。

接口列表使用 Chrome Network 风格的名称和类型图标；可拖动列表与详情之间的分隔线调整宽度。Payload 和 Response 中的 JSON 会格式化并进行语法着色，原始模式仍保留密文和 Base64 字段值。

当解码后的 JSON 中包含适合展示的对象列表时，详情区域会自动显示「表格」页签，不依赖固定字段名；表格页签支持与 Response 一致的搜索、高亮和匹配计数。图片、音视频、字体、PDF、压缩包、Office 和附件下载等文件类响应不会显示「获取 SQL」。设置中可配置禁止获取 SQL 的接口标识，默认包含 `make_new`、`make_update`、`make_remove`、`nonsense`；接口 URL 命中任一标识，或原请求已包含 `isExplain=true` 时，会直接禁用「获取 SQL」。其他接口点击「获取 SQL」后会显示实际追加 `isExplain=true` 的完整接口地址，并用红色文字提示不要对写操作接口执行重放。

作者：Mr.Chen

## 本地测试站

项目包含一个 FastAPI 测试网页，可同时验证未加密 JSON、直接对象列表、PNG 二进制 Preview、整段 AES、部分字段 AES、Base64 请求/响应、Python 风格转义参数，以及请求 Header/Payload 的展示。

首次安装测试站依赖时运行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r test_server/requirements-test.txt
```

依赖安装后，从项目根目录运行 `./test_server/start.sh` 启动后端。脚本会执行 `test_server.py`，由 Python 主入口调用 `uvicorn.run()`。停止服务时，在终端按 `Ctrl+C`。如果提示 8000 端口已被占用，先停止旧服务再启动。

打开 `http://127.0.0.1:8000/test/`，在本页打开开发者工具并切换到「牛牛爱上班」面板，再点「运行全部样例」。加密接口使用与默认 AES 密钥匹配的固定密文；使用其他密钥测试时，需要同步更新 `test_server/test_server.py` 中的测试密文。

提交改动前可运行以下自动回归：

```bash
node --test tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

浏览器交互回归加载真实的 `panel.html` 和全部模块，仅替换 DevTools API 与本地存储，不改扩展配置。运行：

```bash
.venv/bin/python tests/serve_browser.py
```

打开 `http://127.0.0.1:8765/tests/panel-browser.html`，等待页面显示全部通过且无运行错误。此服务禁用缓存，修改模块后可直接刷新。它覆盖筛选、搜索、解码配置、异步正文、HAR、表格和亮暗主题；真实扩展仍需在 Chrome 扩展管理页重新加载，再通过本地测试站验证 DevTools API。

## 代码结构

- `extension/panel.js`：请求列表、详情页签与事件协调。
- `extension/panel-settings.js`：解密配置、主题、列表模式和分栏宽度。
- `extension/panel-response.js`：DevTools 正文读取、编码处理和响应缓存。
- `extension/panel-views.js`、`panel-table.js`：内容渲染、语法高亮、搜索标记和表格交互。
- `extension/sql-replay.js`：检查页面内的请求重放、轮询、超时和异常清理。
- `extension/*-utils.js`：网络元数据、递归解码、SQL 和表格识别规则。

此次重构与验证边界见 [重构验收记录](docs/refactor-validation.md)。

## 发布包

测试通过后，从项目根目录重新生成发布包：

```bash
(cd extension && zip -r -FS ../extension.zip .)
```
