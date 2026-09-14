"""Generate importable TXT acceptance prompts from the real prompt builder."""

from __future__ import annotations
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import nodes as n  # noqa: E402

TARGET = ROOT / "examples" / "组合兼容性验收.txt"
CASES = [
    ("拳击运动搭配", "拳击训练力量写真", "健身训练室", "3:4竖构图", "全身构图", ""),
    ("泳池边坐姿全身", "室内泳池运动写真", "室内泳池", "3:4竖构图", "全身构图", ""),
    ("瑜伽地面姿态", "瑜伽普拉提生活写真", "瑜伽教室", "16:9横构图", "全身构图", "低位鸽子式"),
    ("商务头像", "专业商务头像写真", "摄影棚", "4:5竖构图", "头肩近景", ""),
    ("香水瓶身朝向", "香水商业广告写真", "摄影棚", "3:4竖构图", "腰部以上", ""),
    ("手袋完整展示", "手袋商业广告写真", "摄影棚", "3:4竖构图", "全身构图", ""),
]


def build_samples():
    rows = []
    for title, theme, location, aspect, shot, pose in CASES:
        fields = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
        for group in (n.CLOTHING_OUTPUT_FIELDS, n.POSE_OUTPUT_FIELDS, n.CAMERA_OUTPUT_FIELDS):
            fields.update({f: n.RANDOM_CHOICE for f in group})
        fields.update({
            "写真主题": theme, "场景地点": location, "画面比例": aspect, "景别": shot,
            "年龄阶段": "20–29岁", "族裔大类": "东亚",
            "成像媒介": "专业数码相机摄影",
            "对焦位置": "近侧眼睛" if shot == "头肩近景" else "完整人物",
        })
        if pose:
            fields["基础姿态"] = pose
        for field, value in fields.items():
            if value not in (n.EMPTY_CHOICE, n.RANDOM_CHOICE):
                assert value in n.FIELD_OPTIONS[field], (field, value)
        result = n.ZImageChinesePromptBuilder().build_prompt(
            **fields, 预设=n.PRESET_OPTIONS[1], 随机范围=n.RANDOM_SCOPES[1],
            随机种子=7, 提示词密度="标准", 输出排版="按模块分段",
            自由提示词="柔和均匀的光线，主体清晰，背景简洁，自然摄影质感",
        )
        rows.append((title, result[0]))
    return rows


def render_samples():
    header = (
        "# 先在完整节点点击全部清空，再导入 TXT 用户词库并应用条目，避免叠加原有预设；也可使用独立 TXT 节点。\n"
        "# 按正文中的比例设置实际图像宽高；比例文字不会自动改变 latent 尺寸。\n"
        "# 这六条由当前节点生成；固定节点随机种子为 7。尚未通过实机生图验收。\n"
        "# 保持你常用的模型和采样设置，每条可试 3 个采样器噪声种子。\n"
        "# 验收重点：服装符合主题、坐卧姿态与裁切匹配、道具及手部关系清楚。\n"
        "# 商务头像只需头肩构图；其余条目按各自正文构图检查。\n"
        "# 本文件的多行正文会保留模块分段；标题、标签与此说明不进入提示词。\n\n"
    )
    return header + "\n---\n\n".join(
        f"## {title}\n标签：兼容性验收，待生图验证\n{prompt}\n"
        for title, prompt in build_samples()
    )


if __name__ == "__main__":
    TARGET.write_text(render_samples(), encoding="utf-8", newline="\n")
