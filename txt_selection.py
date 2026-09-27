"""Versioned, bounded TXT selection for API and editor use. No I/O or global RNG."""
import json
import random

MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
MAX_TOTAL_CHARACTERS = 1_100_000  # TXT's 1M plus generated titles/suffixes.
MAX_ENTRIES = 500
MAX_PROMPT_CHARACTERS = 20000
SELECTION_MODES = ["手动选择", "随机抽取"]


def _error(message):
    raise ValueError("TXT library / TXT词库: " + message)


def _length(text):
    # Match the existing browser parser's JavaScript string length.
    return len(text.encode("utf-16-le", errors="surrogatepass")) // 2


def select_txt(kwargs, *, kind, modules, max_seed):
    """Return (selected body, execution metadata); None means legacy manual path."""
    mode = kwargs.get("选择模式", SELECTION_MODES[0])
    if mode == SELECTION_MODES[0]:
        return None
    if mode != SELECTION_MODES[1]:
        _error("invalid selection mode / 选择模式无效")
    seed = kwargs.get("随机种子", 0)
    if type(seed) is not int or not 0 <= seed <= max_seed:
        _error("seed must be an unsigned 64-bit integer / 种子须为无符号64位整数")
    module = kwargs.get("模块类型", modules[0]) if kind == "module" else None
    if kind == "module" and module not in modules:
        _error("unknown module / 未知模块")
    raw = kwargs.get("词库数据", "")
    if not isinstance(raw, str):
        _error("payload must be JSON text / 载荷必须是JSON文本")
    if len(raw) > MAX_PAYLOAD_BYTES or len(raw.encode("utf-8", errors="surrogatepass")) > MAX_PAYLOAD_BYTES:
        _error("payload exceeds 8 MiB / 载荷超过8MiB")
    try:
        data = json.loads(raw) if raw.strip() else {"version": 1, "kind": kind, "entries": []}
    except (ValueError, RecursionError):
        _error("invalid JSON / JSON无效")
    if not isinstance(data, dict) or type(data.get("version")) is not int or data["version"] != 1:
        _error("unsupported payload version / 不支持的载荷版本")
    if data.get("kind") != kind:
        _error("wrong library kind / 词库类型不符")
    entries = data.get("entries")
    if not isinstance(entries, list) or len(entries) > MAX_ENTRIES:
        _error("entries must be a list of at most 500 items / 条目须为不超过500项的列表")
    total = 0
    candidates = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            _error("invalid entry object / 条目对象无效")
        title, prompt, tags = entry.get("title"), entry.get("prompt"), entry.get("tags", [])
        if not isinstance(title, str) or not isinstance(prompt, str) or not isinstance(tags, list):
            _error("invalid title, prompt or tags / 标题、正文或标签类型无效")
        if any(not isinstance(tag, str) for tag in tags):
            _error("tags must be strings / 标签须为字符串")
        if not prompt.strip() or _length(prompt) > MAX_PROMPT_CHARACTERS:
            _error("prompt must contain 1–20000 characters / 正文须非空且不超过20000字符")
        entry_module = entry.get("module")
        if kind == "module" and entry_module not in modules:
            _error("unknown entry module / 条目模块无效")
        total += _length(title) + _length(prompt) + sum(_length(tag) for tag in tags)
        if kind == "module":
            total += _length(entry_module)
        if total > MAX_TOTAL_CHARACTERS:
            _error("total text exceeds limit / 总字符数超限")
        if kind == "prompt" or entry_module == module:
            candidates.append((index, entry))
    metadata = {"algorithm": "python-random-v1", "mode": mode, "seed": str(seed),
                "kind": kind, "module": module, "count": len(candidates),
                "status": "empty", "title": "", "prompt": "", "index": None}
    if not candidates:
        return "", metadata
    index, chosen = candidates[random.Random(seed).randrange(len(candidates))]
    metadata.update(status="selected", title=chosen["title"], prompt=chosen["prompt"], index=index)
    return chosen["prompt"], metadata
