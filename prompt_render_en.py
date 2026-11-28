"""Deterministic offline English prompt rendering."""

from __future__ import annotations

import re
from typing import Iterable, Mapping, Sequence

try:
    from .prompt_catalog import *  # noqa: F403
    from .prompt_render_zh import (
        _active_makeup_fields,
        _visible_clothing_fields,
        _visible_pose_fields,
        module_atomic_fallback,
    )
except ImportError:
    from prompt_catalog import *  # noqa: F403
    from prompt_render_zh import (
        _active_makeup_fields,
        _visible_clothing_fields,
        _visible_pose_fields,
        module_atomic_fallback,
    )

_ENGLISH_FIELD_LIBRARY_SOURCES = {
    "成像媒介": (_THEME_MEDIA_LIBRARY, "capture.medium"),
    "写真主题": (_THEME_MEDIA_LIBRARY, "theme.subject"),
    "年龄阶段": (_CORE_LIBRARY, "person.age"),
    "族裔大类": (_CORE_LIBRARY, "person.ethnicity"),
    "地域族裔分支": (_CORE_LIBRARY, "person.ethnicity_branch"),
    **PERSON_FIELD_LIBRARY_IDS,
    **HAIR_LIBRARY_FIELDS,
    **{
        field_name: (_CORE_LIBRARY, field_id)
        for field_name, field_id in CLOTHING_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_POSE_LIBRARY, field_id)
        for field_name, field_id in POSE_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_SCENE_LIBRARY, field_id)
        for field_name, field_id in SCENE_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_CAMERA_VISUAL_LIBRARY, field_id)
        for field_name, field_id in {
            **CAMERA_LIBRARY_FIELDS, **VISUAL_LIBRARY_FIELDS,
        }.items()
    },
}

_ENGLISH_OPTION_ID_MAPS = {
    field_name: _library_label_to_id(library, field_id)
    for field_name, (library, field_id) in _ENGLISH_FIELD_LIBRARY_SOURCES.items()
}
_ENGLISH_OPTION_ID_MAPS["场景地点"].update(
    _library_label_to_id(_ADVANCED_LIBRARY, "scene.indoor_location")
)

_ENGLISH_THEME_OVERRIDES = {
    "阳台绿植晨间写真": "morning balcony portrait among green plants",
    "深夜书房独处写真": "late-night solitary study-room portrait",
    "复古胶片质感时尚写真": "retro film fashion editorial",
    "高定礼服后台写真": "haute couture backstage portrait",
    "汽车商业广告写真": "automotive commercial portrait",
    "食品饮料广告写真": "food and beverage commercial photography",
    "美甲特写美容写真": "nail-art beauty close-up",
    "香氛喷雾美容广告": "fragrance mist beauty campaign",
    "夜市烟火叙事写真": "night-market documentary portrait",
    "雨伞街头剪影写真": "street portrait with an umbrella silhouette",
    "瀑布溪流清新写真": "fresh waterfall and stream portrait",
    "高原湖泊纯净写真": "clean highland lake portrait",
    "和服京都之旅写真": "Kyoto travel portrait in kimono",
    "温泉度假休闲写真": "relaxed hot-spring resort portrait",
    "滑雪运动写真": "skiing sports portrait",
    "冲浪运动写真": "surfing sports portrait",
    "汉服襦裙写真": "traditional Hanfu ruqun portrait",
    "少数民族风情写真": "ethnic folk-style portrait",
    "昭和和风复古写真": "retro Showa-era Japanese portrait",
    "上海滩十里洋场写真": "vintage cosmopolitan Shanghai portrait",
    "剧院舞台电影静帧": "cinematic theater-stage still",
    "海港码头电影静帧": "cinematic harbor-pier still",
    "人鱼海岸概念写真": "mermaid coast concept portrait",
    "天使羽翼概念写真": "angel-wings concept portrait",
}

_ENGLISH_VALUE_OVERRIDES = {
    ("发色", "银白色"): "silver-white hair",
    ("发型造型", "双环发髻"): "ornate double-loop buns",
    ("连体服类型", "无袖瑜伽连体衣"): "a fitted sleeveless yoga bodysuit",
    ("上装类型", "简洁短袖T恤"): "a clean short-sleeve T-shirt",
    ("上装类型", "亮片吊带上衣"): "a fitted sequined camisole",
    ("上装类型", "挂脖比基尼上装"): "a halter bikini top",
    ("下装类型", "高开衩缎面长裙"): "a high-slit satin maxi skirt",
    ("下装类型", "系带比基尼泳裤"): "side-tie bikini bottoms",
    ("上装颜色", "珊瑚红"): "coral red",
    ("下装颜色", "珊瑚红"): "coral red",
    ("上装材质", "亮片面料"): "fine sequined fabric",
    ("上装材质", "泳装弹力面料"): "stretch swimwear fabric",
    ("下装材质", "泳装弹力面料"): "stretch swimwear fabric",
    ("服装配件", "浅粉色修身长袖内搭"): "a fitted pale-pink long-sleeve underlayer",
    ("画面瞬间", "夜间会所短暂停留"): "a brief pause in a nightclub",
    ("画面瞬间", "沙滩上短暂停留"): "a brief pause on the beach",
    ("画面瞬间", "瑜伽体式停留"): "holding a yoga pose",
    ("画面瞬间", "窗边安静独处"): "a quiet moment alone by the window",
    ("基础姿态", "单车侧坐"): "sitting sideways on a vintage bicycle saddle",
    ("基础姿态", "复古扶手椅坐姿"): "seated in an ornate vintage armchair",
    ("基础姿态", "沙滩侧卧"): "reclining sideways on a bright beach with the upper body slightly raised",
    ("基础姿态", "地面侧坐"): "seated sideways on the floor",
    ("基础姿态", "低位鸽子式"): "a low pigeon-pose variation on a yoga mat",
    ("基础姿态", "窗边座椅坐姿"): "seated sideways on a chair by the window",
    ("手部动作", "举白玫瑰并扶大腿"): "one hand holding white roses beside the face, the other resting on the thigh",
    ("手部动作", "双手放在脑后"): "both hands placed behind the head, elbows open",
    ("手部动作", "一手扶膝一手搭扶手"): "one hand on the knee and the other on the armrest",
    ("手部动作", "双手持刺绣团扇"): "holding an embroidered round fan with both hands",
    ("手部动作", "侧卧双手支撑"): "one forearm supporting the body and the other hand resting on the sand",
    ("手部动作", "双手交叠搭膝"): "forearms and hands crossed loosely over the raised knee",
    ("手部动作", "瑜伽手部支撑"): "one hand on the front thigh and the other relaxed near the hip",
    ("手部动作", "双手捧白色瓷杯"): "holding a white porcelain cup gently with both hands",
    ("腿部动作", "扶手椅曲腿伸展"): "one knee raised while the other leg extends downward",
    ("腿部动作", "侧卧屈伸腿"): "one leg extended and the other bent to create clear layering",
    ("腿部动作", "地面屈膝伸腿"): "one knee raised and the other leg extended along the floor",
    ("腿部动作", "鸽子式腿部伸展"): "front leg folded, rear leg extended straight back with the instep on the floor",
    ("场景地点", "公园草地"): "a sunlit park lawn",
    ("场景地点", "复古会所"): "a dimly lit vintage club interior",
    ("场景地点", "工业地下通道"): "an underground industrial passage",
    ("背景环境", "阳光公园草坪"): "a sunlit park lawn with softly blurred trees",
    ("背景环境", "复古会所雕花座椅"): "a dark ornate armchair and an East Asian decorative screen",
    ("背景环境", "工业通道铁丝网"): "chain-link fencing, concrete flooring, and a dark industrial passage",
    ("背景环境", "珊瑚粉薄荷绿渐变背景"): "a soft coral-pink and mint-green gradient backdrop",
    ("背景环境", "明亮落地窗客厅"): "a bright living room with a gray sofa, floor-to-ceiling windows, and indoor plants",
    ("背景环境", "旧式旅馆房间"): "an old hotel room with a window, bed, worn wooden furniture, and a warm table lamp",
    ("环境细节", "复古自行车与白玫瑰"): "a vintage bicycle, white roses, and a bright lawn",
    ("环境细节", "仙鹤屏风与深色家具"): "a crane-decorated screen and dark wooden furniture",
    ("主配色", "珊瑚粉与薄荷绿"): "coral pink and mint green",
    ("主配色", "银白与霓虹蓝紫"): "silver white with neon blue and violet",
    ("主配色", "奶油白与暖木色"): "cream white and warm wood tones",
    ("主配色", "浅灰与柔和肤色"): "light gray and soft skin tones",
}

_ENGLISH_VALUE_OVERRIDES.update({
    ("前景框景", "失焦嫩绿枫叶框景"): "large out-of-focus tender green maple leaves creating natural foreground framing",
    ("前景框景", "浅木色桌沿前景"): "a pale wooden table edge defining the lower foreground",
    ("前景框景", "灰色门框纵向框景"): "gray door panels and a doorframe creating vertical framing",
    ("前景框景", "深灰文件夹前景"): "a dark gray folder held upright in the foreground",
    ("前景框景", "虚化咖啡杯与桌角"): "a softly blurred coffee cup and table corner in the foreground",
    ("前景框景", "窗框留白框景"): "a window frame creating clean vertical framing and negative space",
    ("前景框景", "无明显前景"): "a clean unobstructed foreground",
    ("场景地点", "高亮庭院绿景"): "a bright green garden courtyard",
    ("场景地点", "林间纵深"): "a deep forest setting with receding tree trunks",
    ("场景地点", "窗外街景"): "a window-side setting overlooking a city street",
    ("场景地点", "奶油色客厅"): "an airy cream-toned living room",
    ("场景地点", "办公沙发与墙面"): "a modern office lounge with a sofa and clean walls",
    ("场景地点", "暖色酒店走廊"): "a warm modern hotel corridor",
    ("场景地点", "灰色门板与走廊"): "a corridor framed by gray wooden doors",
    ("场景地点", "高级灰渐变背景"): "a refined gray gradient studio",
    ("场景地点", "木质新中式空间"): "a restrained new-Chinese interior with warm wood",
    ("场景地点", "复古茶餐厅内景"): "a retro Hong Kong-style diner interior",
    ("场景地点", "都市玻璃建筑"): "a modern urban glass building",
    ("场景地点", "大堂玻璃反射"): "a glass-walled lobby with layered reflections",
    ("场景地点", "城市天际线"): "a rooftop overlooking the city skyline",
    ("场景地点", "白墙展厅"): "a white-walled contemporary gallery",
    ("场景地点", "鲜花陈列"): "a street-facing flower shop filled with floral displays",
    ("场景地点", "网球场围网"): "an outdoor tennis court beside a metal fence",
    ("场景地点", "健身房镜面"): "a bright mirrored fitness studio",
    ("场景地点", "校园教学楼"): "a campus academic building",
    ("场景地点", "密林暗影"): "a shadowed dense forest",
    ("场景地点", "沙漠沙丘"): "open desert dunes",
    ("场景地点", "湖面倒影"): "a quiet lakeside with natural reflections",
    ("场景地点", "高亮夏日树林庭院"): "a bright summer garden surrounded by dense foliage",
    ("场景地点", "暖木咖啡馆卡座"): "a warm wood cafe with a dark leather booth",
    ("场景地点", "临街咖啡馆窗景"): "a window seat in a street-facing cafe",
    ("场景地点", "暖色走廊灰色门板"): "a warm corridor framed by gray door panels",
    ("场景地点", "米杏沙发浅灰紫墙面"): "a simple office lounge with a beige sofa and pale gray-lilac wall",
    ("场景地点", "奶油色窗边室内"): "a cream-toned interior beside a softly lit window",
    ("场景地点", "现代办公休息区"): "a clean modern office lounge",
    ("场景地点", "玻璃幕墙都市夜景"): "a modern glass-walled interior overlooking city lights at night",
    ("场景地点", "当代美术馆白墙"): "a spacious contemporary gallery with white walls",
    ("场景地点", "婚纱礼服陈列厅"): "a bright elegant bridal gown showroom",
    ("场景地点", "火车站候车厅"): "a railway-station waiting hall",
    ("背景环境", "高亮夏日树林庭院"): "a bright softly blurred summer garden with dense green foliage",
    ("背景环境", "暖木咖啡馆卡座"): "warm wood walls, a dark leather booth, tables, and a softly blurred menu board",
    ("背景环境", "临街咖啡馆窗景"): "a street-facing cafe window with a softly blurred urban view",
    ("背景环境", "暖色走廊灰色门板"): "a warm corridor with pale walls, floor tiles, and textured gray door panels",
    ("背景环境", "米杏沙发浅灰紫墙面"): "a beige sofa, pale gray-lilac wall, and a softly blurred green plant",
    ("背景环境", "奶油色窗边室内"): "a cream-toned window interior with a pale tabletop and soft curtains",
    ("背景环境", "现代办公休息区"): "a tidy modern office lounge with a beige sofa, pale gray walls, and green plants",
    ("背景环境", "玻璃幕墙都市夜景"): "softly blurred glass walls and city lights at night",
    ("背景环境", "当代美术馆白墙"): "spacious white contemporary-gallery walls with a few large artworks",
    ("背景环境", "复古茶餐厅"): "retro booth seating, patterned wall tiles, and warm pendant lights",
    ("背景环境", "婚纱礼服陈列厅"): "a bright elegant bridal showroom with simple drapery and mirrors",
    ("背景环境", "火车站候车厅"): "station benches, a timetable display, and a platform entrance receding into the distance",
    ("环境细节", "铁丝网与工业地面"): "chain-link fencing and a textured industrial floor",
    ("环境细节", "美容反光板"): "a restrained beauty reflector near the frame edge",
    ("环境细节", "沙发落地窗与绿植"): "a pale gray sofa, floor-to-ceiling windows, and indoor plants",
    ("环境细节", "旧木家具与暖黄台灯"): "worn wooden furniture and a warm amber table lamp",
    ("环境细节", "漂浮气泡、水生植物、折射光纹"): (
        "featuring floating bubbles, aquatic plants, and refracted light patterns"
    ),
    ("主配色", "浅灰与暖白"): "light gray and warm white",
    ("主配色", "珊瑚粉、薄荷绿与肤色"): "coral pink, mint green, and natural skin tones",
    ("主配色", "暖棕与暖黄"): "warm brown and amber",
    ("主配色", "香槟粉与深棕黑"): "champagne pink and deep brown-black",
    ("主配色", "冷蓝与暖黄"): "cool blue and warm amber",
})

_ENGLISH_VALUE_OVERRIDES.update({
    ("背景环境", "林间小径树干纵深"): "a forest path receding between tall tree trunks and layered foliage",
    ("背景环境", "奶油公寓客厅"): "an airy cream-toned apartment with a pale sofa and soft curtains",
    ("背景环境", "都市商业街"): "a modern shopping street with glass facades and softly blurred pedestrians",
    ("背景环境", "玻璃建筑大堂"): "a modern glass-walled lobby with stone flooring and layered reflections",
    ("背景环境", "酒店阳台开阔景观"): "a hotel balcony overlooking an open city or coastal view",
    ("背景环境", "城市天台天际线"): "a rooftop with layered building silhouettes and a distant city skyline",
    ("背景环境", "海边地平线"): "a sandy shore, open sea, and a clear horizon",
    ("背景环境", "独立书店书架"): "orderly wooden bookshelves filled with visible book spines",
    ("背景环境", "临街花店陈列"): "layered displays of flowers, green leaves, and wrapping paper in a street-facing flower shop",
    ("背景环境", "室外网球场"): "a green outdoor tennis court with crisp white lines and a distant metal fence",
    ("背景环境", "明亮健身训练室"): "a bright fitness studio with mirrors, training equipment, and pale flooring",
    ("背景环境", "高级灰摄影棚"): "a restrained gray studio with a smooth tonal gradient and minimal props",
    ("背景环境", "木质新中式室内"): "a restrained new-Chinese wood interior with a screen, table, and bamboo shadows",
    ("背景环境", "家庭烘焙厨房"): "a bright tidy home kitchen with a wooden worktop, oven, and a few baking tools",
    ("背景环境", "复古唱片店"): "a retro record store with wooden racks, album-cover displays, and warm wall lights",
    ("背景环境", "自然采光画室"): "a naturally lit art studio with an easel, canvases, and neatly arranged painting tools",
    ("背景环境", "周末市集摊位"): "an outdoor weekend market with awnings, flowers, and craft stalls receding along the street",
    ("背景环境", "彩色几何摄影棚"): "a studio built from clean colorful geometric planes with minimal props",
    ("背景环境", "花艺装置摄影棚"): "a floral installation studio with large branches and generous negative space",
    ("背景环境", "夜间便利店"): "bright convenience-store shelves, glass doors, and street lights at night",
    ("背景环境", "地下停车场"): "a cool gray underground parking garage with columns, ceiling lights, and receding bay lines",
    ("背景环境", "繁忙街道路口"): "an urban intersection with a crosswalk, traffic lights, and softly blurred pedestrians",
    ("背景环境", "城市人行天桥"): "a modern pedestrian overpass with railing lines and strong architectural perspective",
    ("背景环境", "春日花海"): "a broad field of spring flowers opening toward soft distant greenery",
    ("背景环境", "静谧湖畔"): "a calm lake, near-shore grass, and a distant tree line with natural reflections",
    ("背景环境", "开阔草原"): "open grassland beneath a broad sky and a low distant horizon",
    ("背景环境", "秋日枫林"): "layered red-orange maple foliage and a leaf-covered path",
    ("背景环境", "冬日雪林"): "a quiet snowy forest with pale ground and dark tree trunks",
    ("背景环境", "清幽竹林"): "a tranquil bamboo grove with vertical depth and a narrow stone path",
    ("背景环境", "海岸悬崖"): "a coastal cliff above rolling sea and open sky",
    ("背景环境", "沙漠旷野"): "rolling desert dunes with clear wind patterns and an open horizon",
    ("背景环境", "乡间小路"): "a country lane winding through fields and hedges into the distance",
    ("背景环境", "海岛小镇街巷"): "pale lanes and low buildings in an island town with the sea beyond",
    ("背景环境", "山间露营地"): "a restrained mountain campsite with grass, a simple tent, and layered ridgelines",
    ("背景环境", "葡萄园庄园"): "ordered vineyard rows, a pale manor building, and gently sloping terrain",
    ("背景环境", "拳击训练馆"): "a boxing gym with a ring, heavy bags, and dark training equipment",
    ("背景环境", "户外骑行道路"): "an open cycling road with continuous guardrails and distant natural scenery",
    ("背景环境", "室内羽毛球馆"): "a bright indoor badminton court with a visible net, boundary lines, and high roof structure",
    ("背景环境", "室内攀岩馆"): "a deep indoor climbing space with colorful holds and high wall structures",
    ("背景环境", "江南园林"): "a Jiangnan garden with white walls, dark roof tiles, winding corridors, and damp stone paths",
    ("背景环境", "敦煌壁画空间"): "an ochre interior inspired by Dunhuang murals with flying-apsara motifs and restrained gold details",
    ("背景环境", "明制中式庭院"): "an orderly Ming-style courtyard with timber doors, windows, and gray brick paving",
    ("背景环境", "传统书院"): "a traditional academy with wooden shelves, a long table, and courtyard light entering the room",
    ("背景环境", "七十年代客厅"): "a warm 1970s living room with wooden furniture, patterned textiles, and a vintage lamp",
    ("背景环境", "复古迪斯科舞厅"): "a retro disco with a mirror ball, colored light strips, and a dark dance floor",
    ("背景环境", "经典火车站月台"): "a classic railway platform with an old station sign and tracks receding into the distance",
    ("背景环境", "美式公路餐厅"): "an American roadside diner with red booths, metal-edged tables, and neon signage",
    ("背景环境", "月夜森林"): "a dark moonlit forest with thin mist and a few glowing plants",
    ("背景环境", "哥特古堡厅堂"): "a restrained Gothic castle hall with pointed arches, stone columns, and tall windows",
    ("背景环境", "未来赛博街区"): "a futuristic city district with neon signs, wet pavement, and high-rise buildings",
    ("背景环境", "蒸汽机械空间"): "a steampunk mechanical interior of copper pipes, gears, and pressure gauges",
    ("背景环境", "超现实梦境花园"): "a surreal garden of oversized flowers, pale mist, and a curving path",
    ("背景环境", "星云神殿"): "a fantasy temple with tall stone columns, a nebula sky, and faint luminous patterns",
    ("背景环境", "水下幻境"): "a clear underwater dreamscape with floating bubbles and gently moving aquatic plants",
    ("背景环境", "冰雪宫殿"): "a cool ice palace of translucent columns, crystal arches, and snow-covered ground",
    ("背景环境", "云海仙境"): "layered clouds, distant mountains, and faint pale classical architecture",
    ("背景环境", "花瓣风暴装置空间"): "a minimal studio transformed by a dynamic installation of suspended petals",
    ("背景环境", "温泉汤池"): "a steaming hot-spring pool against warm stone walls with soft ripples on the water",
    ("背景环境", "和风木造庭院"): "a Japanese timber courtyard with a dry garden, shoji doors, and translucent light",
    ("背景环境", "瀑布溪流"): "a waterfall and clear stream with misty spray and wet rock walls",
    ("背景环境", "剧院舞台"): "a dim theater stage with deep red curtains and a single overhead beam",
    ("背景环境", "海港码头"): "a pier extending into the sea with bollards and moored boats",
    ("背景环境", "天使羽翼殿堂"): "a pure white hall filled with soft luminous mist and descending light columns",
    ("背景环境", "少数民族集市"): "a richly colored folk market with hanging brocade and silver ornaments",
    ("背景环境", "昭和和风房间"): "a Showa-era Japanese room with shoji doors, a low table, and an old warm lamp",
    ("背景环境", "上海滩街景"): "a vintage Shanghai street with neon signs, shikumen buildings, and rickshaw silhouettes",
})

_ENGLISH_SCENE_DETAIL_LABEL_IDS = {
    option["label"]: option["id"]
    for option in _SCENE_LIBRARY["fields"]["scene.detail"]["options"]
}

_ENGLISH_SCENE_THEME_MAPS = {
    field_name: {} for field_name in SCENE_OUTPUT_FIELDS
}
for _theme_label, _theme_bundles in THEME_SCENE_BUNDLES_BY_THEME.items():
    for _bundle in _theme_bundles:
        for _field_name in SCENE_OUTPUT_FIELDS:
            _selected_value = _bundle.get(_field_name)
            if _selected_value not in (None, EMPTY_CHOICE):
                _ENGLISH_SCENE_THEME_MAPS[_field_name].setdefault(
                    _selected_value, _theme_label
                )

_ENGLISH_SCENE_BUNDLE_MAPS = {
    field_name: {} for field_name in SCENE_OUTPUT_FIELDS
}
for _bundle in SCENE_BUNDLES:
    _bundle_id = _bundle.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_:-]+", _bundle_id):
        continue
    for _field_name in SCENE_OUTPUT_FIELDS:
        _selected_value = _bundle.get(_field_name)
        if _selected_value not in (None, EMPTY_CHOICE):
            _ENGLISH_SCENE_BUNDLE_MAPS[_field_name].setdefault(
                _selected_value, _bundle_id
            )

_ENGLISH_FIELD_PREFIXES = {
    "发色": ("color_",),
    "发色色调": ("undertone_",),
    "染色方式": ("dye_",),
    "头发长度": ("length_",),
    "发质与卷度": ("texture_",),
    "发型造型": ("style_",),
    "刘海": ("bangs_",),
    "头部配饰": ("headwear_",),
    "连衣裙类型": ("dress_",),
    "连体服类型": ("jumpsuit_",),
    "上装类型": ("top_",),
    "下装类型": ("bottom_",),
    "连衣裙颜色": ("color_",),
    "连体服颜色": ("color_",),
    "上装颜色": ("color_",),
    "下装颜色": ("color_",),
    "连衣裙材质": ("material_",),
    "连体服材质": ("material_",),
    "上装材质": ("material_",),
    "下装材质": ("material_",),
    "连衣裙图案": ("pattern_",),
    "连体服图案": ("pattern_",),
    "上装图案": ("pattern_",),
    "下装图案": ("pattern_",),
    "版型细节": ("fit_",),
    "袜装": ("legwear_",),
    "鞋履": ("shoes_",),
    "服装配件": ("accessory_",),
    "画面瞬间": ("event_",),
    "基础姿态": ("base_", "pose_"),
    "身体方向": ("body_direction_", "direction_"),
    "身体重心": ("weight_",),
    "肩颈状态": ("shoulders_",),
    "手部动作": ("hand_action_", "hands_", "hand_"),
    "腿部动作": ("leg_action_", "legs_", "leg_"),
    "头部方向": ("head_direction_", "head_"),
    "视线": ("gaze_",),
    "表情": ("expression_",),
    "场景地点": ("location_",),
    "时间切片": ("time_",),
    "天气状态": ("weather_",),
    "前景框景": ("foreground_",),
    "背景环境": ("background_",),
    "环境细节": ("detail_",),
    "空间材质": ("surface_",),
    "空间层次": ("spatial_",),
    "景别": ("shot_",),
    "画面布局": ("composition_",),
    "等效焦段": ("lens_",),
    "拍摄距离": ("distance_",),
    "机位": ("angle_",),
    "景深": ("depth_",),
    "对焦位置": ("focus_",),
    "主光来源": ("source_",),
    "光线方向": ("direction_",),
    "光线质地": ("quality_",),
    "照明落点": ("target_",),
    "阴影表现": ("shadow_",),
    "主配色": ("palette_",),
    "色温倾向": ("temperature_",),
    "画面对比": ("contrast_",),
    "影像风格": ("capture_",),
    "细节质地": ("texture_",),
    "高光处理": ("highlight_",),
    "颗粒质感": ("grain_",),
}

_ENGLISH_FIELD_TEMPLATES = {
    "脸型": "{value} face shape",
    "轮廓细节": "{value} facial contours",
    "眼型": "{value} eyes",
    "瞳色": "{value} irises",
    "眼睑特征": "{value} eyelids",
    "肤色": "{value} skin tone",
    "肤质": "{value} skin texture",
    "整体妆容预设": "{value} makeup",
    "底妆质感": "{value} base makeup",
    "眼影色系": "{value} eyeshadow",
    "眼线造型": "{value} eyeliner",
    "唇妆颜色": "{value} lip color",
    "唇面质感": "{value} lip finish",
    "基础身形": "{value} build",
    "身量观感": "{value} stature",
    "线条重点": "{value} body-line emphasis",
    "发色": "{value} hair",
    "发色色调": "{value} hair undertone",
    "染色方式": "{value} hair coloring",
    "头发长度": "{value} hair length",
    "发质与卷度": "{value} hair texture",
    "发型造型": "{value} hairstyle",
    "刘海": "{value} bangs",
    "头部配饰": "{value} hair accessory",
    "版型细节": "{value} fit details",
    "袜装": "{value}",
    "鞋履": "{value}",
    "服装配件": "{value}",
    "画面瞬间": "{value}",
    "基础姿态": "{value} pose",
    "身体方向": "body turned {value}",
    "身体重心": "weight {value}",
    "肩颈状态": "{value} shoulders and neck",
    "手部动作": "hands {value}",
    "腿部动作": "legs {value}",
    "头部方向": "head {value}",
    "视线": "gaze {value}",
    "表情": "{value} expression",
    "场景地点": "a {value} setting",
    "时间切片": "during {value}",
    "天气状态": "under {value}",
    "前景框景": "{value} in the foreground",
    "背景环境": "{value} in the background",
    "环境细节": "featuring {value}",
    "空间材质": "{value} surfaces",
    "空间层次": "{value} spatial depth",
    "景别": "{value} framing",
    "画面布局": "with {value} composition",
    "等效焦段": "shot at {value} full-frame-equivalent",
    "拍摄距离": "camera distance {value}",
    "机位": "from a {value} camera angle",
    "景深": "with {value} depth of field",
    "对焦位置": "focused on {value}",
    "主光来源": "lit by {value}",
    "光线方向": "coming from the {value}",
    "光线质地": "with {value} lighting",
    "照明落点": "illuminating the {value}",
    "阴影表现": "casting {value} shadows",
    "主配色": "in a {value} color palette",
    "色温倾向": "{value} color temperature",
    "画面对比": "{value} contrast",
    "影像风格": "captured in {value} style",
    "细节质地": "with {value} detail rendering",
    "高光处理": "{value} highlights",
    "颗粒质感": "{value}",
}

_ENGLISH_NATURAL_ID_PHRASES = {
    "肤质": {
        "real_texture": "realistic skin texture",
        "naturally_refined": "naturally refined skin texture",
        "soft_dewy": "soft, dewy skin texture",
        "soft_matte": "soft, matte skin texture",
    },
    "画面瞬间": {
        "adjust_hat": "caught while adjusting the hat",
        "answering_phone": "caught while answering a phone call",
        "blowing_bubbles": "caught while blowing soap bubbles",
        "cuddling_pet": "sharing a quiet moment with a small pet",
        "cycling_bike": "caught while riding a bicycle",
        "dance_spin": "caught mid-spin",
        "hair_toss": "caught in a natural hair toss",
        "holding_sword": "pausing with a sword in hand",
        "horseback_riding": "caught while riding horseback",
        "jumping": "caught mid-jump",
        "laugh_head_back": "laughing with the head tipped back",
        "lift_coffee": "lifting a coffee cup",
        "look_back_smile": "glancing back with a smile",
        "painting_canvas": "painting at a canvas",
        "pause_at_door": "pausing in a doorway",
        "pause_in_thought": "pausing in thought",
        "pause_on_balcony": "pausing on a balcony",
        "pause_under_branches": "pausing beneath leafy branches",
        "reading_book": "quietly reading a book",
        "rest_at_cafe": "resting at a cafe table",
        "rest_on_sofa": "resting comfortably on a sofa",
        "review_folder": "reviewing a folder",
        "shelter_under_umbrella": "sheltering beneath an umbrella",
        "studio_pose_reset": "a brief pause between studio poses",
        "tie_shoelace": "tying a shoelace",
        "touch_curtain": "pausing to touch a curtain",
        "turn_during_walk": "turning naturally mid-walk",
        "wait_by_wall": "waiting beside a wall",
        "wait_for_elevator": "waiting for an elevator",
    },
    "线条重点": {
        "shoulder_neck": "with a clean shoulder-and-neck line",
        "waistline": "with a naturally defined waistline",
        "soft_waist_hip": "with soft waist-and-hip curves",
        "long_legs": "with long, balanced leg lines",
        "strong_shoulder_back": "with a strong shoulder-and-back line",
    },
    "基础姿态": {
        "standing_relaxed": "standing naturally",
        "standing_three_quarter": "standing in a three-quarter pose",
        "standing_doorway": "standing in a doorway",
        "leaning_wall": "leaning lightly against a wall",
        "walking_pause": "pausing mid-step",
        "sitting_chair_edge": "sitting near the edge of a chair",
        "sitting_sofa_forward": "sitting forward on a sofa",
        "sitting_sofa_relaxed": "sitting comfortably on a sofa",
        "sitting_booth_relaxed": "sitting comfortably in a booth",
        "sitting_stool": "sitting on a stool",
        "crouching_sport": "holding a low athletic crouch",
        "squat": "squatting naturally",
        "kneel_sit": "sitting back on the heels",
        "cross_legged": "sitting cross-legged",
        "hand_on_hip": "standing with one hand on the hip",
        "standing_with_sword": "standing with a sword",
        "horseback_sitting": "sitting upright on horseback",
        "cycling_posture": "riding a bicycle",
    },
    "身体方向": {
        "front": "facing the camera",
        "left_quarter": "turned slightly to the left",
        "right_quarter": "turned slightly to the right",
        "left_profile": "shown in left profile",
        "right_profile": "shown in right profile",
        "back_turn_left": "turned away and looking back over the left shoulder",
        "back_turn_right": "turned away and looking back over the right shoulder",
        "diagonal_forward": "angled diagonally toward the camera",
        "three_quarter_back": "shown from a three-quarter back view",
    },
    "身体重心": {
        "balanced_both_feet": "with weight balanced across both feet",
        "left_leg": "with weight resting on the left leg",
        "right_leg": "with weight resting on the right leg",
        "forward": "with the body weight shifted slightly forward",
        "back": "with the body weight shifted slightly back",
        "left_hip": "with weight resting on the left hip",
        "right_hip": "with weight resting on the right hip",
        "centered_seated": "with the seated weight centered",
    },
    "肩颈状态": {
        "relaxed_level": "with relaxed, level shoulders",
        "relaxed_inward": "with the shoulders drawn gently inward",
        "one_shoulder_forward": "with one shoulder angled toward the camera",
        "one_shoulder_lower": "with one shoulder lowered naturally",
        "open_chest": "with an open chest and elongated neck",
        "forward_relaxed": "with the shoulders leaning forward naturally",
        "shrug": "with a subtle shoulder lift",
        "shoulders_back": "with the shoulders drawn back",
    },
    "手部动作": {
        "arms_relaxed_sides": "with both arms relaxed at the sides",
        "hands_folded_front": "with both hands folded naturally in front",
        "one_hand_waist": "with one hand resting on the waist",
        "one_hand_pocket": "with one hand tucked into a pocket",
        "adjust_collar": "gently adjusting the collar",
        "adjust_glasses": "gently adjusting the glasses",
        "glasses_and_folder": "adjusting the glasses while holding a folder",
        "touch_hair": "gently touching the hair",
        "hold_hat_brim": "lightly holding the brim of the hat",
        "bouquet_and_hat": "holding a bouquet while touching the hat brim",
        "hold_coffee_cup": "holding a coffee cup with both hands",
        "cup_and_table": "holding a cup with one hand and resting the other on the table",
        "hold_folder": "holding a folder close to the body",
        "pen_and_folder": "holding a pen and an upright folder",
        "door_handle_and_fan": "holding the door handle with one hand and a folding fan with the other",
        "hold_handbag": "holding a handbag naturally",
        "touch_railing": "resting one hand lightly on the railing",
        "touch_curtain": "gently touching the curtain",
        "hold_umbrella": "holding an umbrella naturally",
        "hands_on_thighs": "with both hands resting on the thighs",
        "elbow_on_knee": "with one elbow resting on a knee",
        "adjust_shoelace": "adjusting a shoelace with both hands",
        "arms_crossed": "with both arms crossed",
        "hand_on_chin": "resting the chin lightly on one hand",
        "peace_sign": "making a relaxed peace sign",
        "point_distance": "pointing toward the distance",
        "tuck_hair": "tucking a loose strand of hair behind one ear",
        "holding_book": "holding an open book",
        "holding_paintbrush": "holding a paintbrush near the canvas",
        "cradling_pet": "cradling a small pet gently",
        "holding_bubble_wand": "holding a bubble wand near the lips",
        "gripping_sword": "holding the sword securely",
        "holding_reins": "holding the reins with both hands",
        "gripping_handlebar": "holding the bicycle handlebars naturally",
        "phone_to_ear": "holding a phone to one ear",
    },
    "腿部动作": {
        "feet_parallel": "with both feet parallel",
        "one_foot_forward": "with one foot placed slightly forward",
        "ankles_crossed": "with the ankles crossed",
        "one_knee_bent": "with one knee bent",
        "raised_crossed_leg": "with one leg raised and crossed over the other",
        "walking_step": "with one leg moving through a natural walking step",
        "knees_together": "with the knees together",
        "knees_side": "with both knees angled to one side",
        "one_leg_extended": "with one leg extended",
        "legs_crossed_knee": "with the legs crossed at the knee",
        "stool_foot_rest": "with one foot resting on the stool support",
        "sport_crouch": "with both knees bent in an athletic crouch",
        "cross_legged_sit": "with the legs folded cross-legged",
        "one_leg_raised": "with one leg raised",
        "knee_up": "with one knee raised",
        "feet_in_stirrups": "with both feet placed in the stirrups",
        "pedaling": "with the legs positioned naturally on the pedals",
    },
    "头部方向": {
        "front": "head facing forward",
        "turn_left": "head turned to the left",
        "turn_right": "head turned to the right",
        "look_back_left": "head turned back over the left shoulder",
        "look_back_right": "head turned back over the right shoulder",
        "slight_tilt_left": "head tilted slightly to the left",
        "slight_tilt_right": "head tilted slightly to the right",
        "slight_lower": "chin lowered slightly",
        "head_tilt_up": "chin lifted slightly",
    },
    "视线": {
        "camera_direct": "looking directly into the camera",
        "camera_soft": "looking softly toward the camera",
        "left_near": "looking toward a nearby point on the left",
        "right_near": "looking toward a nearby point on the right",
        "left_distance": "looking into the distance on the left",
        "right_distance": "looking into the distance on the right",
        "down_prop": "looking down at the object in hand",
        "window": "looking out of the window",
        "slightly_above": "looking slightly above the camera",
        "side_camera": "glancing sideways toward the camera",
        "eyes_closed": "eyes gently closed",
        "look_up": "looking upward",
        "look_down": "looking downward",
    },
    "主光来源": {
        "beauty_dish": "lit by a beauty dish",
        "campfire": "lit by a campfire",
        "candlelight": "lit by candlelight",
        "car_headlight": "lit by car headlights",
        "ceiling_ambient": "lit by soft ambient ceiling light",
        "continuous_panel": "lit by a continuous LED panel",
        "direct_sun": "lit by direct sunlight",
        "hard_flash": "lit by hard on-camera flash",
        "large_softbox": "lit by a large softbox",
        "leaf_filtered_sun": "lit by sunlight filtered through leaves",
        "neon_signs": "lit by neon signage",
        "overcast_skylight": "lit by soft overcast skylight",
        "phone_screen": "lit by a phone screen",
        "projector": "lit by projected light",
        "reflected_bounce": "lit by reflected bounce light",
        "ring_fill": "lit by ring-light fill",
        "soft_flash": "lit by soft flash",
        "storefront_light": "lit by storefront light",
        "sunset_sun": "lit by warm sunset light",
        "tungsten_practical": "lit by tungsten practical lamps",
        "window_daylight": "lit by window daylight",
    },
    "光线质地": {
        "butterfly": "with classic butterfly lighting",
        "crisp_hard": "with crisp, hard lighting",
        "dappled": "with dappled lighting",
        "even_flat": "with soft, even lighting",
        "glowing_backlight": "with luminous backlighting",
        "low_key": "with low-key lighting",
        "mixed_color": "with mixed-color lighting",
        "rembrandt": "with Rembrandt lighting",
        "silhouette_backlight": "with silhouette backlighting",
        "soft_diffused": "with soft, diffused lighting",
        "soft_directional": "with soft directional lighting",
        "specular": "with specular lighting",
        "very_soft": "with very soft lighting",
    },
    "细节质地": {
        "atmospheric_haze": "with gently atmospheric haze",
        "ccd_direct": "with direct early-digital detail",
        "clean_crisp": "with clean, crisp detail",
        "delicate_retouch": "with delicate professional retouching",
        "documentary_real": "with realistic documentary detail",
        "dreamy_soft": "with dreamy soft detail",
        "film_softness": "with gentle film softness",
        "glossy_fashion": "with glossy fashion-editorial detail",
        "matte": "with a restrained matte finish",
        "matte_grain": "with matte, grain-rich detail",
        "natural_detail": "with natural detail",
        "oil_painting": "with oil-painting texture",
        "slightly_soft": "with slightly softened detail",
        "watercolor": "with watercolor texture",
    },
    "机位": {
        "eye_level": "at eye level",
        "chest_level": "from chest height",
        "waist_level": "from waist height",
        "slightly_high": "from a slightly elevated angle",
        "slightly_low": "from a slightly low angle",
        "high_angle": "from a high angle",
        "low_angle": "from a low angle",
        "ground_level": "from ground level",
        "overhead": "from directly overhead",
        "dutch_angle": "with a Dutch angle",
        "profile_view": "from a profile viewpoint",
        "three_quarter_view": "from a three-quarter viewpoint",
    },
    "对焦位置": {
        "both_eyes": "focused precisely on both eyes",
        "near_eye": "focused precisely on the nearer eye",
        "face": "focused on the face",
        "face_environment": "focused on the face while retaining environmental context",
        "full_figure": "focused on the full figure",
        "upper_body": "focused on the upper body",
        "hands_prop": "focused on the hands and prop",
        "garment_detail": "focused on garment details",
        "moving_subject": "tracking focus on the moving subject",
    },
    "表情": {
        "gentle_smile": "with a gentle smile",
        "sweet_smile": "with a sweet smile",
        "bright_smile": "with a bright smile",
        "relaxed_smile": "with a relaxed smile",
        "calm": "with a calm expression",
        "calm_confident": "with a calm, confident expression",
        "bright_confident": "with a bright, confident expression",
        "cool": "with a cool, composed expression",
        "focused": "with a focused expression",
        "thoughtful": "with a thoughtful expression",
        "restrained": "with a restrained expression",
        "soft_serious": "with a softly serious expression",
        "shy": "with a shy expression",
        "lazy": "with a languid expression",
        "surprised": "with a surprised expression",
        "playful_wink": "with a playful wink",
        "bright_laugh": "laughing brightly",
    },
    "照明落点": {
        "face_eyes": "illuminating the face and eyes",
        "face_shoulders": "illuminating the face, neck, and shoulders",
        "face_hands": "illuminating the face and hands",
        "upper_body": "illuminating the upper body",
        "full_figure": "illuminating the full figure",
        "hair_edge": "highlighting the hair outline",
        "garment_texture": "accentuating garment textures",
        "legs_shoes": "illuminating the legs and shoes",
        "subject_background": "illuminating the subject and nearby background",
        "prop_hands": "illuminating the hands and prop",
    },
    "光线方向": {
        "front": "coming from the front",
        "front_left": "coming from the front-left",
        "front_right": "coming from the front-right",
        "side_left": "coming from the left side",
        "side_right": "coming from the right side",
        "back_left": "coming from the back-left",
        "back_right": "coming from the back-right",
        "back": "coming from behind",
        "top_front": "coming from the upper front",
        "top": "coming from overhead",
        "below_front": "filled from below in front",
    },
    "天气状态": {
        "clear_sun": "under clear sunlight",
        "thin_clouds": "under thin clouds",
        "overcast": "under an overcast sky",
        "light_rain": "in light rain",
        "after_rain": "after rain",
        "light_fog": "in light mist",
        "sea_breeze": "in a sea breeze",
        "light_snow": "in light snowfall",
        "humid_summer": "in humid summer air",
        "autumn_breeze": "in a crisp autumn breeze",
        "heavy_rain": "in heavy rain",
        "thunderstorm": "under an approaching thunderstorm",
        "rainbow": "with a post-rain rainbow",
        "partly_cloudy": "under partly cloudy skies",
    },
    "阴影表现": {
        "barely_visible": "casting barely visible shadows",
        "soft_gradation": "casting soft graduated shadows",
        "natural_contour": "casting natural contour shadows",
        "clear_flash": "casting crisp flash shadows",
        "dappled_leaf": "casting dappled leaf shadows",
        "long_sunset": "casting long sunset shadows",
        "deep_side": "casting deep side shadows",
        "rim_separation": "casting rim-separated shadows",
        "window_pattern": "casting window-pane shadows",
        "mixed_soft": "casting soft multi-source shadows",
    },
    "色温倾向": {
        "warm": "warm color temperature",
        "slightly_warm": "slightly warm color temperature",
        "neutral": "neutral color temperature",
        "slightly_cool": "slightly cool color temperature",
        "cool": "cool color temperature",
        "warm_subject_cool_bg": "warm subject and cool background color temperature",
        "cool_subject_warm_bg": "cool subject and warm background color temperature",
        "mixed_warm_cool": "mixed warm-and-cool color temperature",
    },
    "画面对比": {
        "very_low": "very low contrast",
        "low": "low contrast",
        "medium_low": "medium-low contrast",
        "natural": "natural contrast",
        "medium_high": "medium-high contrast",
        "high": "high contrast",
        "soft_highlights_deep_blacks": "soft highlights with deep blacks",
        "compressed_tones": "compressed tonal range",
    },
    "高光处理": {
        "controlled": "controlled highlights",
        "soft_rolloff": "soft roll-off highlights",
        "slight_bloom": "slight highlight bloom",
        "strong_bloom": "pronounced highlight bloom",
        "bright_clean": "bright, clean highlights",
        "specular_crisp": "crisp specular highlights",
        "warm_glow": "warm glowing highlights",
        "subdued": "subdued highlights",
    },
    "颗粒质感": {
        "fine_grain": "fine film grain",
        "visible_grain": "visible film grain",
        "coarse_grain": "coarse film grain",
        "subtle_digital_noise": "subtle digital noise",
        "ccd_noise": "CCD color noise",
        "clean_surface": "a clean grain-free surface",
        "silver_grain": "silver-halide film grain",
    },
    "影像风格": {
        "full_frame_camera": "captured in a full-frame camera style",
        "portable_digital": "captured in a compact digital style",
        "phone_camera": "captured in a smartphone camera style",
        "ccd_camera": "captured in a CCD camera style",
        "medium_format": "captured in a medium-format camera style",
        "color_negative_film": "captured in a color negative film style",
        "slide_film": "captured in a slide film style",
        "black_white_film": "captured in a black-and-white film style",
        "editorial_camera": "captured in an editorial fashion style",
        "direct_flash_snapshot": "captured in a direct-flash snapshot style",
        "instant_film_print": "captured in an instant-film print style",
        "disposable_film_camera": "captured in a disposable film camera style",
        "commercial_product": "captured in a commercial beauty-and-product style",
        "cinematic_still": "captured in a cinematic still style",
        "dslr": "captured in a DSLR camera style",
        "mirrorless": "captured in a mirrorless camera style",
    },
    "画面布局": {
        "centered": "with a centered composition",
        "center_right": "with a center-right composition",
        "center_left": "with a center-left composition",
        "left_third": "with a left-third composition",
        "right_third": "with a right-third composition",
        "lower_center": "with a lower-center composition",
        "symmetrical": "with a symmetrical composition",
        "doorway_frame": "framed within a doorway",
        "foreground_frame": "with foreground framing",
        "diagonal": "with a diagonal composition",
        "negative_space": "with negative-space framing",
        "gaze_space": "leaving breathing room in the direction of gaze",
        "edge_cropped": "with an edge-cropped composition",
        "triangle": "with a triangular composition",
        "leading_lines": "with leading-line composition",
        "frame_within_frame": "with a frame-within-a-frame composition",
        "golden_ratio": "with a golden-ratio composition",
    },
}

_ENGLISH_FIT_PHRASES = {
    "fitted": "with a fitted silhouette",
    "relaxed": "with a relaxed drape",
    "defined_waist": "with a clearly defined waist",
    "high_waist": "with a high-waisted cut",
    "deep_v": "with a deep V neckline",
    "square_neck": "with a square neckline",
    "boat_neck": "with a boat neckline",
    "high_neck": "with a high neckline",
    "slit": "with a side slit",
    "pleated": "with structured pleats",
    "draped": "with natural draping",
    "layered": "with layered construction",
    "backless": "with an open back",
    "puff_sleeve": "with puff sleeves",
    "ruffle": "with ruffled trim",
    "tie_waist": "with a tied waist",
    "lantern_sleeve": "with lantern sleeves",
    "crop": "with a cropped cut",
    "strapless": "with a strapless neckline",
}


_ENGLISH_MODULE_ORDER = (
    "画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现",
)


def _humanize_english_id(field_name: str, option_id: str) -> str:
    value = option_id
    for prefix in _ENGLISH_FIELD_PREFIXES.get(field_name, ()):
        if value.startswith(prefix):
            value = value[len(prefix):]
            break
    value = value.replace("_plus_", " and ").replace("_and_", " and ")
    value = value.replace("_", " ")
    value = re.sub(r"\s+", " ", value).strip()
    exact_replacements = {
        "black white": "black-and-white",
        "t shirt": "T-shirt",
        "a line": "A-line",
        "east asian": "East Asian",
        "southeast asian": "Southeast Asian",
        "south asian": "South Asian",
        "central asian": "Central Asian",
        "west asian middle eastern": "West Asian or Middle Eastern",
        "latin american": "Latin American",
    }
    value = exact_replacements.get(value, value)
    for source, replacement in (
        ("full frame", "full-frame"),
        ("medium format", "medium-format"),
        ("close up", "close-up"),
        ("three quarter", "three-quarter"),
        ("dark brown black", "dark brown-black"),
        ("half up", "half-up"),
        ("soft rolloff", "soft roll-off"),
        ("center left", "center-left"),
        ("center right", "center-right"),
    ):
        value = value.replace(source, replacement)
    return value


# Explicit translations for new pose atoms and reused accessory sets.
_ENGLISH_VALUE_OVERRIDES.update({
    ("基础姿态", "泳池边坐姿"): "sitting upright on the pool edge",
    ("腿部动作", "双脚分开微屈膝"): "feet shoulder-width apart with knees slightly bent",
    ("腿部动作", "双脚垂入池水"): "legs hanging from the pool edge with both feet in the water",
    ("腿部动作", "一脚侧伸点地"): "weight on the straight left leg, right leg extended sideways with toes touching the floor",
    ("画面瞬间", "网球接球前准备"): "readying for a tennis return",
    ("手部动作", "一手握网球拍一手扶拍颈"): "right hand holding a tennis racket handle, left hand supporting its throat at waist level",
    ("画面瞬间", "力量训练组间休息"): "resting between strength-training sets",
    ("手部动作", "双手各握一只哑铃垂于体侧"): "holding one dumbbell in each hand with arms resting at the sides",
    ("画面瞬间", "慢跑起步前停顿"): "pausing before starting a jog",
    ("手部动作", "双臂屈肘前后错开"): "elbows lightly bent, left arm forward and right arm back, hands relaxed",
    ("画面瞬间", "游泳后池边休息"): "resting at the pool edge after a swim",
    ("手部动作", "双手撑在池沿两侧"): "palms resting on the pool edge on either side of the body",
    ("画面瞬间", "舞蹈排练中保持姿态"): "holding a pose during dance rehearsal",
    ("手部动作", "一手扶把杆另一臂侧展"): "left hand lightly resting on a horizontal ballet barre, right arm extended sideways with a relaxed wrist",
    ("画面瞬间", "拳击训练前保持防守姿态"): "holding a guard before boxing practice",
    ("手部动作", "戴拳击手套双拳举至颊旁"): "wearing boxing gloves, fists raised beside the cheeks and elbows tucked in front of the torso",
    ("画面瞬间", "羽毛球发球前停顿"): "pausing before a badminton serve",
    ("手部动作", "一手持羽毛球拍一手拿球"): "right hand holding a badminton racket at the side, left hand holding a shuttlecock at waist level",
    ("画面瞬间", "攀岩前整理双手"): "preparing hands before indoor climbing",
    ("手部动作", "双手在腰前轻搓镁粉"): "gently rubbing chalk between the palms at waist level",
    ("画面瞬间", "滑雪间歇短暂停留"): "pausing between ski runs",
    ("手部动作", "双手各握一根直立雪杖"): "holding a ski pole in each hand with both tips resting in the snow beside the body",
    ("画面瞬间", "冲浪前在岸边停留"): "pausing on shore before surfing",
    ("手部动作", "一手扶住身侧直立冲浪板"): "right hand steadying the edge of an upright surfboard beside the body, tail resting on the sand, left arm relaxed",
    ("画面瞬间", "商务肖像拍摄时停留"): "holding still for a business portrait",
    ("手部动作", "双臂在胸前自然交叠"): "arms loosely folded across the chest, hands resting on upper arms, shoulders relaxed",
    ("画面瞬间", "展示服装正面版型"): "presenting the front cut of an outfit",
    ("手部动作", "双臂与腰线稍微分开"): "arms hanging slightly away from the waist with fingers relaxed",
    ("画面瞬间", "转头展示耳饰"): "turning the head to display earrings",
    ("手部动作", "一手将头发拢至耳后露出耳饰"): "left hand tucking hair behind the left ear to reveal an earring, right arm relaxed",
    ("画面瞬间", "将香水瓶举至胸前展示"): "presenting a perfume bottle at chest level",
    ("手部动作", "一手托香水瓶底一手扶瓶侧"): "left hand supporting the base of a perfume bottle, right hand steadying its side, bottle front facing the camera",
    ("画面瞬间", "抬起手腕展示腕表"): "raising the wrist to display a watch",
    ("手部动作", "一手托住另一只戴腕表的手腕"): "watch on the left wrist raised to chest level with its dial facing the camera, right hand supporting the wrist from below",
    ("画面瞬间", "展示佩戴中的眼镜"): "presenting a pair of glasses while wearing them",
    ("手部动作", "戴细框眼镜一手轻扶镜腿"): "wearing thin-frame glasses, right fingertips resting on the right temple arm, left arm relaxed",
    ("画面瞬间", "在身前展示手袋"): "presenting a handbag in front of the body",
    ("手部动作", "双手握提柄使手袋正面朝向镜头"): "holding the handbag handles with both hands above the thighs, front of the bag facing the camera",
    ("画面瞬间", "举起饮料瓶展示"): "raising a drink bottle for a product portrait",
    ("手部动作", "一手握饮料瓶下半部举至胸前"): "right hand holding the lower half of a drink bottle at chest level, bottle front facing the camera, left arm relaxed",
})
_ACCESSORY_SET_ENGLISH = {
    "minimal_pearl": "pearl stud earrings, a single-pearl necklace, a fine gold bracelet and a plain band ring",
    "office_gold": "geometric gold earrings, a fine gold necklace, a leather-strap watch, a small crystal ring, thin gold rectangular glasses and a structured handbag",
    "office_silver": "rectangular drop earrings, a fine silver necklace, a metal watch, a plain band ring, thin silver rectangular glasses and a leather tote bag",
    "cafe_soft": "small flower stud earrings, a small pendant necklace, a fine gold bracelet, an open ring and a short-strap shoulder bag",
    "summer_straw": "fabric flower earrings, a single-pearl necklace, a colorful beaded bracelet, an open ring and a woven straw bag",
    "french_gold": "small gold hoop earrings, layered fine necklaces, a fine gold bracelet, stacked thin rings and a chain-strap bag",
    "evening_crystal": "crystal chandelier earrings, a crystal necklace, a wide metal cuff, a small crystal ring and a velvet evening bag",
    "black_gold": "black enamel earrings, a rigid gold collar necklace, a gold bangle, a black gemstone ring and a clutch bag",
    "new_chinese_jade": "jade drop earrings, a jade pendant, a jade bangle and a jade ring",
    "retro_clip": "vintage clip-on earrings, a short pearl necklace, a leather-strap watch, a small signet ring and a miniature top-handle bag",
    "urban_silver": "a metal ear cuff, a fine silver necklace, a chain bracelet, mixed rings, narrow sunglasses and a short-strap shoulder bag",
    "street_black": "silver hoop earrings, a thin black choker, a wide metal cuff, a geometric ring, black sunglasses and a small crossbody bag",
    "sweet_ribbon": "pearl drop earrings, a ribbon-bow neck accessory, a pearl bracelet, a pearl ring and a beaded handbag",
    "gallery_geometric": "geometric gold earrings, a small pendant necklace, a gold bangle, a geometric ring, rimless glasses and a clutch bag",
    "travel_practical": "small gold hoop earrings, a leather-strap watch, a plain band ring, brown sunglasses and a small crossbody bag",
    "sport_active": "clear crystal stud earrings, a sports watch, sports sunglasses and a sports duffel bag",
    "bookstore_intellectual": "pearl stud earrings, a fine silver necklace, a leather-strap watch, an open ring, tortoiseshell glasses and a leather tote bag",
    "transparent_modern": "asymmetric earrings, a Y-shaped chain necklace, a chain bracelet, stacked thin rings, clear-frame glasses and a miniature top-handle bag",
}
_ENGLISH_VALUE_OVERRIDES.update({
    ("服装配件", ACCESSORY_SET_LABELS[bundle_id]): text
    for bundle_id, text in _ACCESSORY_SET_ENGLISH.items()
})


_ENGLISH_VALUE_OVERRIDES.update({
    ("头发长度", "及臀长发"): "hip-length hair",
    ("刘海", "全幅齐刘海"): "full, straight-across bangs",
    ("上装类型", "运动背心"): "athletic tank top",
    ("等效焦段", "手机主摄"): "shot with a phone main camera at approximately 24mm full-frame-equivalent",
    ("眼线造型", "彩色眼线"): "colored eyeliner",
    ("写真主题", "黑白电影肖像"): "photorealistic black-and-white cinematic portrait",
    ("成像媒介", "专业数码相机摄影"): "professional digital camera photography",
    ("成像媒介", "全画幅微单摄影"): "full-frame mirrorless photography",
    ("成像媒介", "半画幅微单摄影"): "APS-C mirrorless photography",
    ("成像媒介", "数码单反摄影"): "DSLR photography",
    ("成像媒介", "中画幅数码摄影"): "medium-format digital photography",
    ("成像媒介", "手机计算摄影"): "computational smartphone photography",
    ("成像媒介", "便携数码相机摄影"): "compact digital camera photography",
    ("成像媒介", "早期CCD数码摄影"): "early CCD digital photography",
    ("成像媒介", "35毫米胶片摄影"): "35mm film photography",
    ("成像媒介", "中画幅胶片摄影"): "medium-format film photography",
    ("成像媒介", "即时成像相纸摄影"): "instant-film photography",
    ("成像媒介", "一次性胶片相机摄影"): "disposable film camera photography",
})

_ENGLISH_PATTERN_PHRASES = {
    "细小碎花": "a tiny floral print",
    "横向条纹": "horizontal stripes",
    "纵向细条纹": "fine vertical stripes",
    "细格纹": "a fine plaid pattern",
    "小波点": "a polka-dot pattern",
    "暗纹提花": "a subtle jacquard pattern",
    "植物印花": "a botanical print",
    "几何纹样": "a geometric pattern",
    "花卉刺绣": "floral embroidery",
    "纵向罗纹": "a ribbed texture",
    "压褶纹理": "a pleated texture",
    "拼色结构": "color-block panels",
    "佩斯利纹": "a paisley pattern",
    "千鸟格": "a houndstooth pattern",
    "大格纹": "a large plaid pattern",
    "豹纹": "a leopard print",
    "波西米亚印花": "a bohemian print",
}
_ENGLISH_VALUE_OVERRIDES.update({
    (prefix + "图案", label): phrase
    for prefix in ("上装", "下装", "连衣裙", "连体服")
    for label, phrase in _ENGLISH_PATTERN_PHRASES.items()
})

_ENGLISH_MAKEUP_DETAILS = {
    "自然裸妆": "a sheer natural base, soft brows and muted nude lips",
    "清透裸粉妆": "a translucent base, pale pink blush and dewy nude-pink lips",
    "蜜桃珊瑚妆": "a lightweight base, peach blush and soft coral lips",
    "奶茶棕妆": "a soft-matte base, muted beige-brown eye makeup and beige-brown lips",
    "豆沙柔雾妆": "a refined soft-matte base, subtle eye makeup and muted dusty-rose lips",
    "清透水光妆": "a translucent dewy base, finely shimmering eye makeup and glossy translucent lips",
    "明艳红唇妆": "a clean base, defined eyeliner and vivid red lips with crisp edges",
    "浆果色妆容": "a refined base, deep-brown eye makeup and vivid berry lips",
    "大地色妆容": "muted warm earth tones across the makeup",
    "小烟熏妆": "softly blended, subtle smoky eye makeup",
    "伪素颜妆": "a sheer, natural-looking no-makeup makeup finish",
}

# Keep ID-based renderers in sync with the explicit public-option translations.
for _field_name, _phrases in _ENGLISH_NATURAL_ID_PHRASES.items():
    for _label, _option_id in _ENGLISH_OPTION_ID_MAPS[_field_name].items():
        _translation = _ENGLISH_VALUE_OVERRIDES.get((_field_name, _label))
        if _translation:
            _phrases.setdefault(_option_id, _translation)


def _english_article(phrase: str) -> str:
    lower = phrase.lstrip().lower()
    if not lower or lower[0] not in "aeiou":
        return "a"
    if lower.startswith(("eu", "uni", "use", "one", "uk")):
        return "a"
    return "an"


def _english_option_id(field_name: str, value: str) -> str:
    return _ENGLISH_OPTION_ID_MAPS.get(field_name, {}).get(value, "")


def _english_atomic_value(field_name: str, value: str) -> str:
    if value in (None, EMPTY_CHOICE) or value in DEPENDENCY_PLACEHOLDER_VALUES.get(
        field_name, ()
    ):
        return ""
    override = _ENGLISH_VALUE_OVERRIDES.get((field_name, value))
    if override:
        if field_name == "主配色" and not override.endswith("color palette"):
            return f"in {_english_article(override)} {override} color palette"
        return override
    if field_name == "场景地点":
        background_override = _ENGLISH_VALUE_OVERRIDES.get(("背景环境", value))
        if background_override:
            return f"set in {background_override}"
    if field_name == "画面比例":
        width, height = ASPECT_RESOLUTIONS.get(value, (0, 0))
        ratio = value.split("竖构图", 1)[0].split("横构图", 1)[0].split("方形构图", 1)[0]
        orientation = "square" if width == height else ("landscape" if width > height else "portrait")
        return f"{ratio} {orientation} composition"
    if field_name == "写真主题" and value in _ENGLISH_THEME_OVERRIDES:
        return f"photorealistic {_ENGLISH_THEME_OVERRIDES[value]}"
    if field_name == "拍摄距离":
        return f"camera distance {str(value).removesuffix('米')} m"
    option_id = _english_option_id(field_name, value)
    if not option_id and field_name == "环境细节":
        detail_labels = re.split(r"[、，]", value)
        if detail_labels and all(
            label in _ENGLISH_SCENE_DETAIL_LABEL_IDS for label in detail_labels
        ):
            details = [
                _humanize_english_id(
                    field_name, _ENGLISH_SCENE_DETAIL_LABEL_IDS[label]
                )
                for label in detail_labels
            ]
            return f"featuring {_join_english_list(details)}"
    if not option_id and field_name in SCENE_OUTPUT_FIELDS:
        theme_label = _ENGLISH_SCENE_THEME_MAPS[field_name].get(value, "")
        bundle_id = _ENGLISH_SCENE_BUNDLE_MAPS[field_name].get(value, "")
        if theme_label:
            theme_core = _ENGLISH_THEME_OVERRIDES.get(theme_label, "")
            if not theme_core:
                theme_id = _english_option_id("写真主题", theme_label)
                theme_core = _humanize_english_id("写真主题", theme_id)
            scene_fallbacks = {
                "场景地点": f"a setting designed for {theme_core}",
                "前景框景": f"foreground framing suited to {theme_core}",
                "背景环境": f"a softly detailed {theme_core} background",
                "环境细节": f"environmental details consistent with {theme_core}",
            }
            if field_name in scene_fallbacks:
                return scene_fallbacks[field_name]
        if bundle_id:
            bundle_core = _humanize_english_id(field_name, bundle_id)
            bundle_fallbacks = {
                "场景地点": f"{_english_article(bundle_core)} {bundle_core} setting",
                "前景框景": f"{bundle_core} foreground framing",
                "背景环境": f"{_english_article(bundle_core)} {bundle_core} background",
                "环境细节": f"{bundle_core} environmental details",
            }
            if field_name in bundle_fallbacks:
                return bundle_fallbacks[field_name]
    if not option_id:
        return ""
    if field_name == "年龄阶段":
        return {
            "age_20s": "around 20 years old",
            "age_30s": "around 30 years old",
            "age_40s": "around 40 years old",
            "age_50s": "around 50 years old",
            "age_60s": "around 60 years old",
        }.get(option_id, _humanize_english_id(field_name, option_id))
    natural_phrase = _ENGLISH_NATURAL_ID_PHRASES.get(field_name, {}).get(option_id)
    if natural_phrase:
        return natural_phrase
    if field_name == "版型细节" and option_id in _ENGLISH_FIT_PHRASES:
        return _ENGLISH_FIT_PHRASES[option_id]
    humanized = _humanize_english_id(field_name, option_id)
    if field_name in ("族裔大类", "地域族裔分支"):
        return (humanized.title().replace(" Descent", " descent")
                .replace("Mixed", "mixed").replace(" Or ", " or "))
    if field_name == "主配色":
        return f"in {_english_article(humanized)} {humanized} color palette"
    if field_name == "成像媒介":
        return f"{humanized} photography"
    if field_name == "写真主题":
        return f"photorealistic {humanized} portrait photography"
    if field_name == "场景地点":
        return f"{_english_article(humanized)} {humanized} setting"
    if field_name == "画面布局":
        return f"with {_english_article(humanized)} {humanized} composition"
    if field_name == "影像风格":
        return f"captured in {_english_article(humanized)} {humanized} style"
    if field_name == "机位":
        return f"from {_english_article(humanized)} {humanized} camera angle"
    if field_name == "脸型" and humanized.endswith(" face"):
        return humanized
    if field_name == "头发长度":
        length_terms = {
            "chin": "chin-length hair",
            "collarbone": "collarbone-length hair",
            "shoulder": "shoulder-length hair",
            "chest": "chest-length hair",
            "waist": "waist-length hair",
        }
        return length_terms.get(humanized, f"{humanized} hair length")
    if field_name == "刘海":
        return humanized if humanized.endswith(("bangs", "fringe")) else f"{humanized} bangs"
    if field_name == "细节质地" and humanized.endswith(" detail"):
        return f"{humanized} rendering"
    if field_name == "颗粒质感" and humanized.endswith(("grain", "noise", "surface")):
        return humanized
    template = _ENGLISH_FIELD_TEMPLATES.get(field_name, "{value}")
    return template.format(value=humanized)


def _english_person_identity_text(fields: Mapping[str, str]) -> str:
    age = _english_atomic_value("年龄阶段", fields.get("年龄阶段", EMPTY_CHOICE))
    branch = fields.get("地域族裔分支", EMPTY_CHOICE)
    ethnicity_field = "地域族裔分支"
    if branch in (EMPTY_CHOICE, ETHNICITY_BRANCH_GENERIC):
        branch = fields.get("族裔大类", EMPTY_CHOICE)
        ethnicity_field = "族裔大类"
    ethnicity = _english_atomic_value(ethnicity_field, branch)
    if ethnicity:
        ethnicity = ethnicity.replace(" descent", "")
    if age and ethnicity:
        article = ("an" if ethnicity[:1].lower() in "aeiou"
                   and not ethnicity.lower().startswith("european") else "a")
        return f"{article} {ethnicity} woman {age}"
    if ethnicity:
        return f"an adult {ethnicity} woman"
    if age:
        return f"an adult woman {age}"
    return ""


def _join_english_list(items: Sequence[str]) -> str:
    cleaned = [item for item in items if item]
    if len(cleaned) < 2:
        return cleaned[0] if cleaned else ""
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def _english_garment_phrase(
    fields: Mapping[str, str],
    prefix: str,
    density: str,
    retain_pattern: bool = False,
) -> str:
    type_field = f"{prefix}类型"
    garment_type = _english_atomic_value(type_field, fields.get(type_field, EMPTY_CHOICE))
    if not garment_type and not any(
        fields.get(f"{prefix}{suffix}", EMPTY_CHOICE) != EMPTY_CHOICE
        for suffix in ("颜色", "材质", "图案")
    ):
        return ""
    garment_type = re.sub(r"^(?:a|an)\s+", "", garment_type, flags=re.IGNORECASE)

    color_field = f"{prefix}颜色"
    material_field = f"{prefix}材质"
    pattern_field = f"{prefix}图案"
    color = _english_atomic_value(color_field, fields.get(color_field, EMPTY_CHOICE))
    material = _english_atomic_value(
        material_field, fields.get(material_field, EMPTY_CHOICE)
    )
    pattern = ""
    if density != "精简" or not garment_type or retain_pattern:
        pattern = _english_atomic_value(
            pattern_field, fields.get(pattern_field, EMPTY_CHOICE)
        )

    # A known outfit structure supplies the noun when its type is unspecified.
    garment_type = garment_type or {
        "上装": "top", "下装": "bottoms", "连衣裙": "dress", "连体服": "jumpsuit",
    }[prefix]
    plural_endings = (
        "jeans", "trousers", "pants", "shorts", "leggings", "bottoms", "culottes",
    )
    article = "" if garment_type.lower().endswith(plural_endings) else (
        "an" if garment_type[:1].lower() in "aeiou" else "a"
    )
    phrase = f"{article} {garment_type}".strip()
    fabric_description = " ".join(part for part in (color, material) if part)
    if fabric_description:
        phrase = f"{phrase} in {fabric_description}"
    if pattern:
        phrase = f"{phrase} with {pattern}"
    return phrase


_ENGLISH_LEGWEAR_PHRASES = {
    "black_sheer_tights": "black sheer tights",
    "dark_gray_sheer_tights": "dark-gray sheer tights",
    "black_thigh_high": "black thigh-high stockings",
    "lace_top_thigh_high": "lace-top thigh-high stockings",
    "cream_ankle_socks": "cream ankle socks",
    "ribbed_knee_socks": "ribbed knee-high socks",
    "sports_socks": "white sports socks",
    "lace_ankle_socks": "lace ankle socks",
    "fishnet": "fishnet tights",
    "thigh_high_socks": "thigh-high socks",
    "ankle_socks": "ankle socks",
    "black_sheer": "black sheer stockings",
}

_ENGLISH_SHOE_PHRASES = {
    "pointed_stiletto": "pointed-toe stiletto heels",
    "patent_pumps": "patent-leather pumps",
    "slingback_heels": "slingback heels",
    "block_heels": "block-heel pumps",
    "loafers": "leather loafers",
    "mary_jane": "Mary Jane shoes",
    "ankle_boots": "pointed-toe ankle boots",
    "knee_boots": "knee-high boots",
    "white_sneakers": "white sneakers",
    "retro_sneakers": "retro sneakers",
    "flat_sandals": "flat strappy sandals",
    "mules": "pointed-toe mules",
    "over_knee_boots": "over-the-knee boots",
    "canvas_sneakers": "canvas sneakers",
    "ballet_flats": "ballet flats",
    "martin_boots": "lace-up combat boots",
    "heeled_sandals": "heeled sandals",
}

_ENGLISH_ACCESSORY_PHRASES = {
    "pearl_studs": "pearl stud earrings",
    "pearl_drop": "pearl drop earrings",
    "metal_tassel": "metal tassel earrings",
    "gold_hoops": "gold hoop earrings",
    "geometric_earrings": "geometric earrings",
    "fine_necklace": "a fine necklace",
    "pearl_necklace": "a pearl necklace",
    "rectangle_glasses": "slim rectangular glasses",
    "round_glasses": "slim round glasses",
    "leather_belt": "a slim leather belt",
    "structured_handbag": "a structured handbag",
    "shoulder_bag": "a small shoulder bag",
    "silk_scarf": "a narrow silk scarf",
    "wristwatch": "a wristwatch",
    "sunglasses": "sunglasses",
    "hair_clip": "a hair clip",
    "choker": "a leather choker",
    "brooch": "a brooch",
    "bracelet": "a bracelet",
    "hair_band": "a headband",
    "shawl": "a shawl",
}


def _english_clothing_prompt_text(
    fields: Mapping[str, str],
    density: str,
) -> str:
    fields = _visible_clothing_fields(fields, density)
    mode = fields.get("穿搭结构", EMPTY_CHOICE)
    garment_prefixes = {
        "连衣裙": ("连衣裙",),
        "连体服": ("连体服",),
        "上装＋下装": ("上装", "下装"),
        "西装套装": ("上装", "下装"),
        "叠穿造型": ("上装", "下装"),
    }.get(mode, ())
    if mode == EMPTY_CHOICE:
        garment_prefixes = ("连衣裙", "连体服", "上装", "下装")
    atomic_details = []
    if mode == EMPTY_CHOICE:
        # Blank-canvas properties do not imply that any garment was selected.
        atomic_details = [
            _english_atomic_value(prefix + suffix, fields.get(prefix + suffix, EMPTY_CHOICE))
            for prefix in garment_prefixes
            if fields.get(prefix + "类型", EMPTY_CHOICE) == EMPTY_CHOICE
            for suffix in ("颜色", "材质", "图案")
        ]
        garment_prefixes = tuple(
            prefix for prefix in garment_prefixes
            if fields.get(prefix + "类型", EMPTY_CHOICE) != EMPTY_CHOICE
        )
    garments = [
        _english_garment_phrase(fields, prefix, density, retain_pattern=mode == EMPTY_CHOICE)
        for prefix in garment_prefixes
    ]
    garments = [garment for garment in garments if garment]
    if len(garments) == 2:
        outfit = f"{garments[0]} paired with {garments[1]}"
    else:
        outfit = _join_english_list(garments)
    parts = [f"wearing {outfit}"] if outfit else []
    parts.extend(detail for detail in atomic_details if detail)

    # These selected details are rendered at every density, matching Chinese.
    fit = _english_atomic_value("版型细节", fields.get("版型细节", EMPTY_CHOICE))
    if fit:
        parts.append(fit)

    legwear_value = fields.get("袜装", EMPTY_CHOICE)
    legwear_id = _english_option_id("袜装", legwear_value)
    legwear = _ENGLISH_LEGWEAR_PHRASES.get(
        legwear_id, _english_atomic_value("袜装", legwear_value)
    )
    shoes_value = fields.get("鞋履", EMPTY_CHOICE)
    shoes_id = _english_option_id("鞋履", shoes_value)
    shoes = _ENGLISH_SHOE_PHRASES.get(
        shoes_id, _english_atomic_value("鞋履", shoes_value)
    )
    if legwear or shoes:
        parts.append(f"styled with {_join_english_list([legwear, shoes])}")

    accessory_value = fields.get("服装配件", EMPTY_CHOICE)
    accessory_id = _english_option_id("服装配件", accessory_value)
    accessory = _ENGLISH_ACCESSORY_PHRASES.get(
        accessory_id, _english_atomic_value("服装配件", accessory_value)
    )
    if accessory:
        parts.append(f"accessorized with {accessory}")

    return ", ".join(parts)


def _english_module_fields(module_name: str, fields: Mapping[str, str], density: str) -> tuple[str, ...]:
    if module_name == "画面基础":
        return ("画面比例", "成像媒介", "写真主题")
    if module_name == "人物":
        makeup_fields = _active_makeup_fields(fields)
        detail_fields = (
            *PERSON_FACE_FIELDS, *PERSON_EYE_FIELDS, *PERSON_SKIN_FIELDS,
            *makeup_fields, *BODY_OUTPUT_FIELDS,
        )
        return detail_fields
    if module_name == "发型":
        return HAIR_OUTPUT_FIELDS
    if module_name == "姿态动作":
        if density == "精简":
            return ("基础姿态", "手部动作", "视线", "表情")
        return POSE_OUTPUT_FIELDS
    if module_name == "场景":
        if density == "精简":
            return ("场景地点", "时间切片", "前景框景", "背景环境")
        if density == "标准":
            return ("场景地点", "时间切片", "天气状态", "前景框景", "背景环境", "环境细节")
        return SCENE_OUTPUT_FIELDS
    if module_name == "摄影":
        if density != "详细":
            return tuple(field_name for field_name in CAMERA_OUTPUT_FIELDS if field_name != "拍摄距离")
        return CAMERA_OUTPUT_FIELDS
    if module_name == "视觉表现":
        if density == "详细":
            return VISUAL_OUTPUT_FIELDS
        active = tuple(field for field in VISUAL_OUTPUT_FIELDS
                       if fields.get(field, EMPTY_CHOICE) != EMPTY_CHOICE)
        finish = tuple(field for field in ("细节质地", "高光处理", "颗粒质感") if field in active)
        if not finish and "影像风格" in active:
            finish = ("影像风格",)
        color = tuple(field for field in COLOR_OUTPUT_FIELDS if field in active)
        if density == "精简":
            color, finish = color[:2], finish[:2]
        return (*LIGHTING_OUTPUT_FIELDS, *color, *finish)
    return ()


def _strip_leading_article(text: str) -> str:
    return re.sub(r"^(?:a|an|the)\s+", "", text.strip(), flags=re.IGNORECASE).lower()


def render_english_module_fragment(
    module_name: str,
    fields: Mapping[str, str],
    density: str = "标准",
) -> str:
    """Render one built-in structured module as an English positive prompt."""

    if density not in PROMPT_DENSITIES:
        density = "标准"
    if module_name == "服装":
        clothing = _english_clothing_prompt_text(fields, density)
        return f"{clothing}." if clothing else ""
    if module_name == "姿态动作":
        fields = _visible_pose_fields(fields, density)
    if module_name == "视觉表现":
        selected_fields = _english_module_fields(module_name, fields, density)
        subgroups = (
            tuple(f for f in LIGHTING_OUTPUT_FIELDS if f in selected_fields),
            tuple(f for f in COLOR_OUTPUT_FIELDS if f in selected_fields),
            tuple(f for f in FINISH_OUTPUT_FIELDS if f in selected_fields),
        )
        sections = []
        for group in subgroups:
            group_parts = [
                _english_atomic_value(f, fields.get(f, EMPTY_CHOICE))
                for f in group
            ]
            group_parts = [part for part in group_parts if part]
            if group_parts:
                sections.append(", ".join(group_parts))
        if not sections:
            fallback = module_atomic_fallback(module_name, fields, density, english=True)
            return f"{fallback}." if fallback else ""
        return f"{'; '.join(sections)}."
    parts = []
    if module_name == "人物":
        identity = _english_person_identity_text(fields)
        if identity:
            parts.append(identity)
    location_val = fields.get("场景地点", EMPTY_CHOICE) if module_name == "场景" else EMPTY_CHOICE
    location_en = ""
    for field_name in _english_module_fields(module_name, fields, density):
        value = fields.get(field_name, EMPTY_CHOICE)
        rendered = _english_atomic_value(field_name, value)
        if module_name == "场景":
            if field_name == "场景地点":
                location_en = rendered
            elif field_name == "背景环境" and location_en and rendered:
                bg_core = _strip_leading_article(rendered)
                if value == location_val or (bg_core and bg_core in location_en.lower()):
                    rendered = ""
        if density == "详细" and field_name == "整体妆容预设" and value in _ENGLISH_MAKEUP_DETAILS:
            rendered += ", " + _ENGLISH_MAKEUP_DETAILS[value]
        if rendered:
            parts.append(rendered)
    if not parts:
        fallback = module_atomic_fallback(module_name, fields, density, english=True)
        return f"{fallback}." if fallback else ""
    return f"{', '.join(parts)}."


def compose_english_prompt_text(
    fields: Mapping[str, str],
    density: str = "标准",
    excluded_modules: Iterable[str] = (),
) -> str:
    """Compose offline English from built-in fields only.

    Arbitrary Chinese free text and user TXT fragments are intentionally not
    machine-translated. A user fragment that replaces a module excludes that
    module from this English output instead of silently emitting stale fields.
    """

    excluded = set(excluded_modules)
    fragments = [
        render_english_module_fragment(module_name, fields, density).rstrip(". ")
        for module_name in _ENGLISH_MODULE_ORDER
        if module_name not in excluded
    ]
    body = ". ".join(fragment for fragment in fragments if fragment)
    return f"{body}." if body else ""


def join_english_prompt_text(first: str, second: str) -> str:
    """Join two English prompt fragments with stable sentence punctuation."""

    first_text = "" if first is None else str(first).strip()
    second_text = "" if second is None else str(second).strip()
    if not first_text:
        return second_text
    if not second_text:
        return first_text
    separator = " " if first_text.endswith(tuple(".!?;:,。！？；：，、…")) else ". "
    return f"{first_text}{separator}{second_text}"




__all__ = [
    "_ENGLISH_FIELD_LIBRARY_SOURCES",
    "_ENGLISH_OPTION_ID_MAPS",
    "_ENGLISH_THEME_OVERRIDES",
    "_ENGLISH_VALUE_OVERRIDES",
    "_ENGLISH_SCENE_DETAIL_LABEL_IDS",
    "_ENGLISH_SCENE_THEME_MAPS",
    "_ENGLISH_SCENE_BUNDLE_MAPS",
    "_ENGLISH_FIELD_PREFIXES",
    "_ENGLISH_FIELD_TEMPLATES",
    "_ENGLISH_NATURAL_ID_PHRASES",
    "_ENGLISH_FIT_PHRASES",
    "_ENGLISH_MODULE_ORDER",
    "_humanize_english_id",
    "_ACCESSORY_SET_ENGLISH",
    "_ENGLISH_PATTERN_PHRASES",
    "_ENGLISH_MAKEUP_DETAILS",
    "_english_article",
    "_english_option_id",
    "_english_atomic_value",
    "_english_person_identity_text",
    "_join_english_list",
    "_english_garment_phrase",
    "_ENGLISH_LEGWEAR_PHRASES",
    "_ENGLISH_SHOE_PHRASES",
    "_ENGLISH_ACCESSORY_PHRASES",
    "_english_clothing_prompt_text",
    "_english_module_fields",
    "_strip_leading_article",
    "render_english_module_fragment",
    "compose_english_prompt_text",
    "join_english_prompt_text",
]
