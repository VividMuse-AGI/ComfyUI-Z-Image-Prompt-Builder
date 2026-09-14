"""Resolution arithmetic, independent of ComfyUI and prompt generation."""
import math


# Keep the original recommendations byte-for-byte compatible with old workflows.
ASPECT_RESOLUTIONS = {
    "2:3竖构图": (832, 1248),
    "3:4竖构图": (768, 1024),
    "4:5竖构图": (896, 1120),
    "9:16竖构图": (720, 1280),
    "9:21竖构图": (576, 1344),
    "1:1方形构图": (1024, 1024),
    "3:2横构图": (1248, 832),
    "4:3横构图": (1024, 768),
    "5:4横构图": (1120, 896),
    "16:9横构图": (1280, 720),
    "21:9横构图": (1344, 576),
}
PIXEL_BUDGET_MODE = "固定比例总像素"
# Defaults for workflows created before the pixel-budget control existed.
RESOLUTION_DEFAULTS = {
    "分辨率模式": "原推荐尺寸", "目标总像素": 1.0, "尺寸对齐倍数": 8,
    "目标总像素（万）": 100.0,
}
RESOLUTION_INPUTS = {
    "分辨率模式": (
        ["原推荐尺寸", "按总像素计算", PIXEL_BUDGET_MODE],
        {"default": PIXEL_BUDGET_MODE, "tooltip": "新节点按总像素计算并固定比例；另两种模式仅供旧工作流兼容。"},
    ),
    "目标总像素": (
        "FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1,
                  "tooltip": "MP 表示总像素；按官方计算口径，1 MP 为 1024×1024 像素，不是长边 1K。"},
    ),
    "尺寸对齐倍数": (
        "INT", {"default": 8, "min": 8, "max": 128, "step": 4,
                "tooltip": "新模式同时保持比例与尺寸对齐，选择最接近目标总像素的可用宽高。"},
    ),
    "目标总像素（万）": (
        "FLOAT", {"default": 100.0, "min": 10.0, "max": 1600.0, "step": 10.0,
                  "tooltip": "输入 100、200、300，分别表示 100 万、200 万、300 万像素。画面比例保持不变；实际像素受尺寸对齐限制。"},
    ),
}


def calculate_resolution(aspect, mode="原推荐尺寸", megapixels=1.0, multiple=8):
    """Match official MP arithmetic; legacy mode intentionally ignores scaling."""
    if aspect not in ASPECT_RESOLUTIONS:
        raise ValueError("不支持的画面比例 / Unsupported aspect ratio")
    if mode == "原推荐尺寸":
        return ASPECT_RESOLUTIONS[aspect]
    if mode != "按总像素计算":
        raise ValueError("分辨率模式无效 / Invalid resolution mode")
    if (isinstance(megapixels, bool) or not isinstance(megapixels, (int, float))
            or not math.isfinite(megapixels) or not 0.1 <= megapixels <= 16.0):
        raise ValueError("目标总像素须为 0.1–16 MP / Megapixels must be between 0.1 and 16")
    if (type(multiple) is not int or not 8 <= multiple <= 128 or multiple % 4):
        raise ValueError("对齐倍数须为 8–128 内的 4 的倍数 / Alignment must be a multiple of 4 between 8 and 128")
    # Use the intended ratio, not an already rounded output resolution.
    ratio = aspect.split("竖")[0].split("横")[0].split("方")[0]
    w_ratio, h_ratio = map(int, ratio.split(":"))
    scale = math.sqrt(megapixels * 1024 * 1024 / (w_ratio * h_ratio))
    return (round(w_ratio * scale / multiple) * multiple,
            round(h_ratio * scale / multiple) * multiple)


def calculate_pixel_resolution(aspect, pixels_wan=100.0, multiple=8):
    """Closest pixel area on a grid that preserves the exact selected ratio."""
    if aspect not in ASPECT_RESOLUTIONS:
        raise ValueError("不支持的画面比例 / Unsupported aspect ratio")
    if (isinstance(pixels_wan, bool) or not isinstance(pixels_wan, (int, float))
            or not math.isfinite(pixels_wan) or not 10 <= pixels_wan <= 1600):
        raise ValueError("总像素须为 10–1600 万 / Pixel budget must be 10–1600 units of 10,000 pixels")
    if type(multiple) is not int or not 8 <= multiple <= 128 or multiple % 4:
        raise ValueError("对齐倍数须为 8–128 内的 4 的倍数 / Invalid alignment multiple")
    ratio = aspect.split("竖")[0].split("横")[0].split("方")[0]
    w_ratio, h_ratio = map(int, ratio.split(":"))
    divisor = math.gcd(w_ratio, h_ratio)
    w_unit, h_unit = w_ratio // divisor * multiple, h_ratio // divisor * multiple
    target = pixels_wan * 10000
    unit_area = w_unit * h_unit
    lower = max(1, math.floor(math.sqrt(target / unit_area)))
    # Compare area error rather than independently rounding the dimensions.
    count = min((lower, lower + 1), key=lambda k: abs(k * k * unit_area - target))
    return w_unit * count, h_unit * count


def resolution_from_options(aspect, options):
    mode = options.get("分辨率模式", PIXEL_BUDGET_MODE if "目标总像素（万）" in options else "原推荐尺寸")
    if mode == PIXEL_BUDGET_MODE:
        return calculate_pixel_resolution(aspect, options.get("目标总像素（万）", 100.0),
                                          options.get("尺寸对齐倍数", 8))
    return calculate_resolution(aspect, options.get("分辨率模式", "原推荐尺寸"),
                                options.get("目标总像素", 1.0), options.get("尺寸对齐倍数", 8))
