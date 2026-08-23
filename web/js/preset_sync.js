import { app } from "../../scripts/app.js";

const NODE_CLASS = "VividMuse_ZImageChinesePromptBuilder";
const FOLLOW_PRESET = "跟随预设";
const RANDOM_CHOICE = "随机抽取";
const EMPTY_CHOICE = "不使用";
const LOCAL_SCOPE = "局部微调（动作、表情、色彩、质感）";
const THEME_SCOPE = "同主题重拍（保留主题和人物）";
const MIX_SCOPE = "跨风格混搭（全部字段）";

const FIELD_NAMES = [
  "画面比例", "成像媒介", "写真大类", "写真主题",
  "年龄阶段", "族裔大类", "地域族裔分支", "脸型", "轮廓细节", "眼型", "瞳色", "眼睑特征",
  "肤色", "肤质", "妆容模式", "整体妆容预设", "底妆质感", "眼影色系", "眼线造型", "唇妆颜色",
  "唇面质感", "基础身形", "身量观感", "线条重点",
  "发色模式", "发色", "发色色调", "染色方式", "头发长度", "发质与卷度", "发型造型", "刘海", "头部配饰",
  "穿搭结构", "连衣裙类型", "连衣裙颜色", "连衣裙材质", "连衣裙图案",
  "连体服类型", "连体服颜色", "连体服材质", "连体服图案",
  "上装类型", "上装颜色", "上装材质", "上装图案", "下装类型", "下装颜色", "下装材质", "下装图案",
  "版型细节", "袜装", "鞋履", "服装配件", "画面瞬间", "基础姿态", "身体方向", "身体重心", "肩颈状态",
  "手部动作", "腿部动作", "头部方向", "视线", "表情",
  "场景大类", "场景地点", "时间切片", "天气状态", "前景框景", "背景环境", "环境细节", "空间材质", "空间层次",
  "主光来源", "光线方向", "光线质地", "照明落点", "阴影表现",
  "主配色", "色温倾向", "画面对比", "景别", "画面布局", "等效焦段", "拍摄距离", "机位", "景深", "对焦位置",
  "影像风格", "细节质地", "高光处理", "颗粒质感",
];
// 自由提示词和拼接位置不属于结构化字段，预设、随机和结构化清空操作必须保留它们。

const MODULE_FIELD_GROUPS = {
  "画面基础": ["画面比例", "成像媒介", "写真大类", "写真主题"],
  "人物": [
    "年龄阶段", "族裔大类", "地域族裔分支", "脸型", "轮廓细节", "眼型", "瞳色", "眼睑特征",
    "肤色", "肤质", "妆容模式", "整体妆容预设", "底妆质感", "眼影色系", "眼线造型", "唇妆颜色",
    "唇面质感", "基础身形", "身量观感", "线条重点",
  ],
  "发型": ["发色模式", "发色", "发色色调", "染色方式", "头发长度", "发质与卷度", "发型造型", "刘海", "头部配饰"],
  "服装": ["穿搭结构", "连衣裙类型", "连衣裙颜色", "连衣裙材质", "连衣裙图案", "连体服类型", "连体服颜色", "连体服材质", "连体服图案", "上装类型", "上装颜色", "上装材质", "上装图案", "下装类型", "下装颜色", "下装材质", "下装图案", "版型细节", "袜装", "鞋履", "服装配件"],
  "姿态动作": ["画面瞬间", "基础姿态", "身体方向", "身体重心", "肩颈状态", "手部动作", "腿部动作", "头部方向", "视线", "表情"],
  "场景": ["场景大类", "场景地点", "时间切片", "天气状态", "前景框景", "背景环境", "环境细节", "空间材质", "空间层次"],
  "摄影": ["景别", "画面布局", "等效焦段", "拍摄距离", "机位", "景深", "对焦位置"],
  "视觉表现": ["主光来源", "光线方向", "光线质地", "照明落点", "阴影表现", "主配色", "色温倾向", "画面对比", "影像风格", "细节质地", "高光处理", "颗粒质感"],
};
const groupedFields = Object.values(MODULE_FIELD_GROUPS).flat();
const invalidGroupedFields = groupedFields.filter((name) => !FIELD_NAMES.includes(name));
const missingGroupedFields = FIELD_NAMES.filter((name) => !groupedFields.includes(name));
const duplicateGroupedFields = [...new Set(
  groupedFields.filter((name, index) => groupedFields.indexOf(name) !== index),
)];
if (invalidGroupedFields.length) console.error("VividMuse: invalid module fields", invalidGroupedFields);
if (missingGroupedFields.length) console.error("VividMuse: missing module fields", missingGroupedFields);
if (duplicateGroupedFields.length) console.error("VividMuse: duplicate module fields", duplicateGroupedFields);

const CLOTHING_MODE_FIELDS = {
  "连衣裙": ["连衣裙类型", "连衣裙颜色", "连衣裙材质", "连衣裙图案"],
  "连体服": ["连体服类型", "连体服颜色", "连体服材质", "连体服图案"],
  "上装＋下装": ["上装类型", "上装颜色", "上装材质", "上装图案", "下装类型", "下装颜色", "下装材质", "下装图案"],
  "西装套装": ["上装类型", "上装颜色", "上装材质", "上装图案", "下装类型", "下装颜色", "下装材质", "下装图案"],
  "叠穿造型": ["上装类型", "上装颜色", "上装材质", "上装图案", "下装类型", "下装颜色", "下装材质", "下装图案"],
};
const CLOTHING_BRANCH_FIELDS = [...new Set(Object.values(CLOTHING_MODE_FIELDS).flat())];
const MAKEUP_CUSTOM_FIELDS = ["底妆质感", "眼影色系", "眼线造型", "唇妆颜色", "唇面质感"];
const EMPTY_MAKEUP_PRESET_VALUES = {
  "底妆质感": "不使用", "眼影色系": "不使用", "眼线造型": "不使用",
  "唇妆颜色": "不使用", "唇面质感": "不使用",
};
// Literal blank values keep presets auditable and make old saved workflows easy to migrate.
const EMPTY_CLOTHING_PRESET_VALUES = {
  "连衣裙类型": "不使用", "连衣裙颜色": "不使用", "连衣裙材质": "不使用", "连衣裙图案": "不使用",
  "连体服类型": "不使用", "连体服颜色": "不使用", "连体服材质": "不使用", "连体服图案": "不使用",
  "上装类型": "不使用", "上装颜色": "不使用", "上装材质": "不使用", "上装图案": "不使用",
  "下装类型": "不使用", "下装颜色": "不使用", "下装材质": "不使用", "下装图案": "不使用",
  "版型细节": "不使用", "袜装": "不使用", "鞋履": "不使用", "服装配件": "不使用",
};

const LIGHT_RANDOM_FIELDS = [
  "画面瞬间", "基础姿态", "身体方向", "身体重心", "肩颈状态",
  "手部动作", "腿部动作", "头部方向", "视线", "表情",
  "光线质地", "阴影表现", "主配色", "色温倾向", "画面对比", "细节质地", "高光处理", "颗粒质感",
];
const THEME_RANDOM_EXCLUDED_FIELDS = new Set([
  "画面比例", "写真大类", "写真主题", ...MODULE_FIELD_GROUPS["人物"],
]);
const STANDARD_RANDOM_FIELDS = FIELD_NAMES.filter((name) => !THEME_RANDOM_EXCLUDED_FIELDS.has(name));

const CAPTURE_MEDIA = [
  "专业数码相机摄影", "全画幅微单摄影", "半画幅微单摄影", "数码单反摄影",
  "中画幅数码摄影", "手机计算摄影", "便携数码相机摄影", "早期CCD数码摄影",
  "35毫米胶片摄影", "中画幅胶片摄影", "即时成像相纸摄影", "一次性胶片相机摄影",
];

const THEME_OPTIONS_BY_CATEGORY = {
  "日常生活": ["日系咖啡馆生活写真", "窗边奶油暖调生活写真", "居家晨光松弛写真", "花店日常清新写真", "雨天室内安静写真", "书店周末阅读写真", "厨房烘焙日常写真", "唱片店闲逛写真", "画室创作日常写真", "周末市集漫步写真", "阳台绿植晨间写真", "深夜书房独处写真"],
  "时尚编辑": ["夜间室内轻奢时尚写真", "高级杂志棚拍写真", "极简黑白时尚写真", "都市街头穿搭写真", "金属未来感时尚写真", "红毯礼服时尚写真", "彩色几何棚拍写真", "极简西装廓形写真", "柔软针织质感写真", "实验花艺时尚写真", "复古胶片质感时尚写真", "高定礼服后台写真"],
  "商业广告": ["都市职场轻奢写真", "专业商务头像写真", "服装电商模特写真", "珠宝首饰广告写真", "香水商业广告写真", "高级酒店品牌写真", "腕表商业广告写真", "眼镜商业广告写真", "手袋商业广告写真", "婚纱礼服品牌写真", "汽车商业广告写真", "食品饮料广告写真"],
  "美妆美容": ["影棚水光妆美容特写", "自然真实肤质特写", "清透裸妆美容写真", "浓郁红唇妆面特写", "彩色眼妆创意特写", "护肤品清洁美容广告", "柔雾哑光妆面特写", "珠光眼妆创意特写", "清透腮红妆面写真", "护发造型美容广告", "美甲特写美容写真", "香氛喷雾美容广告"],
  "都市叙事": ["都市夜行叙事写真", "玻璃幕墙通勤写真", "地铁站台都市写真", "雨夜街头霓虹写真", "天台蓝调时刻写真", "旧城区巷道纪实写真", "便利店夜间叙事写真", "停车场冷调都市写真", "街道路口纪实写真", "城市天桥通勤写真", "夜市烟火叙事写真", "雨伞街头剪影写真"],
  "自然户外": ["日系森系夏日写真", "春日花海清新写真", "湖畔清风自然写真", "草原旷野环境写真", "秋日枫林氛围写真", "冬日雪林清冷写真", "竹林清幽自然写真", "海岸悬崖环境写真", "沙漠落日旷野写真", "乡间小路生活写真", "瀑布溪流清新写真", "高原湖泊纯净写真"],
  "旅行度假": ["海边夏日度假写真", "酒店阳台度假写真", "山野徒步旅行写真", "古镇漫步旅行写真", "热带泳池假日写真", "公路旅行随行写真", "海岛小镇漫步写真", "山间露营旅行写真", "葡萄园庄园旅行写真", "火车站候车旅行写真", "和服京都之旅写真", "温泉度假休闲写真"],
  "运动健康": ["网球场阳光运动写真", "健身房力量训练写真", "瑜伽普拉提生活写真", "城市慢跑活力写真", "室内泳池运动写真", "舞蹈排练动态写真", "拳击训练力量写真", "户外骑行活力写真", "羽毛球训练写真", "室内攀岩运动写真", "滑雪运动写真", "冲浪运动写真"],
  "中式美学": ["新中式室内写真", "茶室竹影中式写真", "旗袍民国雅致写真", "宋韵素雅庭院写真", "唐风华贵宫廷写真", "水墨留白中式写真", "江南园林雨景写真", "敦煌壁画灵感写真", "明制雅致庭院写真", "传统书院文雅写真", "汉服襦裙写真", "少数民族风情写真"],
  "复古年代": ["复古港风夜景写真", "九十年代家居写真", "千禧复古派对写真", "美式复古汽车旅馆写真", "法式旧公寓复古写真", "八十年代影楼复古写真", "七十年代暖调客厅写真", "复古迪斯科舞厅写真", "经典火车站旅人写真", "美式公路餐厅复古写真", "昭和和风复古写真", "上海滩十里洋场写真"],
  "电影叙事": ["室内克制情绪电影写真", "暖调室内电影叙事写真", "蓝调城市电影静帧", "悬疑走廊叙事写真", "明亮梦境电影写真", "黑白电影肖像", "雨夜独行电影静帧", "公寓独处剧情写真", "旅馆窗边电影静帧", "公路停靠电影叙事", "剧院舞台电影静帧", "海港码头电影静帧"],
  "幻想概念": ["月夜森林精灵概念写真", "哥特古堡暗黑写真", "未来都市赛博写真", "蒸汽机械复古幻想写真", "梦境花园超现实写真", "星云神殿概念写真", "水下幻境概念写真", "冰雪宫殿幻想写真", "云雾仙境幻想写真", "花瓣风暴概念写真", "人鱼海岸概念写真", "天使羽翼概念写真"],
};

const ETHNICITY_BRANCHES_BY_CATEGORY = {
  "东亚": ["大类通用外观", "东北亚地域外观", "东亚南部地域外观"],
  "东南亚": ["大类通用外观", "大陆东南亚地域外观", "海岛东南亚地域外观"],
  "南亚": ["大类通用外观", "北部南亚地域外观", "南部南亚地域外观"],
  "中亚": ["大类通用外观", "草原中亚地域外观", "西部中亚地域外观"],
  "西亚／中东": ["大类通用外观", "阿拉伯裔", "波斯裔", "黎凡特地域外观", "安纳托利亚地域外观"],
  "欧洲裔": ["大类通用外观", "斯拉夫裔", "北欧裔", "西欧裔", "地中海欧洲裔"],
  "非洲裔": ["大类通用外观", "北非地域外观", "西非地域外观", "东非地域外观", "中非地域外观", "南部非洲地域外观"],
  "拉丁美洲裔": ["大类通用外观", "安第斯地域外观", "加勒比地域外观", "南锥体地域外观"],
  "多族裔混合外观": ["大类通用外观", "东亚与欧洲混合族裔", "非洲与欧洲混合族裔", "南亚与欧洲混合族裔", "拉丁美洲与欧洲混合族裔"],
};

const SCENE_LOCATIONS_BY_CATEGORY = {
  "居住空间": ["采光客厅", "奶油色卧室", "开放式厨房", "窗边书房", "石材浴室", "封闭阳台", "奶油色公寓", "室内门廊"],
  "餐饮与酒店": ["暖木咖啡馆", "酒店客房", "酒店休息厅", "餐厅卡座", "鸡尾酒吧", "酒店走廊", "咖啡馆卡座", "咖啡馆窗边", "复古茶餐厅", "酒店阳台"],
  "商业零售": ["独立书店", "花店", "唱片店", "服装精品店", "珠宝陈列室", "现代药店"],
  "文化艺术": ["图书馆阅览室", "白墙美术馆", "博物馆展厅", "剧院前厅", "舞蹈排练室", "陶艺工作室", "当代美术馆", "校园教室"],
  "办公工作": ["行政办公室", "玻璃会议室", "创意工作室", "服装工作室", "新闻编辑室", "洁净实验室", "办公休息区", "玻璃大堂"],
  "交通空间": ["车站候车厅", "地铁站台", "机场休息室", "列车车厢", "地下停车场", "电梯厅"],
  "运动康体": ["健身训练室", "瑜伽教室", "室内泳池", "水疗休息区", "运动更衣室", "普拉提教室", "室外网球场", "校园操场", "室外篮球场"],
  "东方传统": ["新中式茶室", "寺院偏殿", "传统书斋", "老宅厅堂", "传统织造坊", "茶馆内廊", "温泉汤池"],
  "工业功能": ["仓库通道", "工厂走道", "机械设备间", "地下洗衣房", "后勤走廊", "玻璃温室", "蒸汽机械空间"],
  "专业特色": ["摄影棚", "后台化妆间", "音乐排练室", "钟表工坊", "天文观测室", "档案室", "高级灰影棚", "哥特古堡厅堂", "星云神殿", "水下幻境", "冰雪宫殿", "花瓣风暴装置空间"],
  "自然户外": ["夏日庭院", "林间小径", "海边", "月夜森林", "超现实梦境花园", "云海仙境", "海边灯塔", "沙滩", "竹林", "湖边"],
  "都市户外": ["都市街道", "城市天台", "未来赛博街区", "石拱桥", "码头"],
};

const PRESETS = {
  "日系森系夏日柔光写真": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "2:3竖构图",
    "成像媒介": "35毫米胶片摄影",
    "写真大类": "自然户外",
    "写真主题": "日系森系夏日写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "标准鹅蛋脸", "轮廓细节": "下颌线柔和",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "暖白肤色", "肤质": "自然细腻",
    "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
    "基础身形": "自然匀称", "身量观感": "中等身量", "线条重点": "肩颈线条舒展",
    "发色模式": "基础发色",
    "发色": "深棕黑色",
    "发色色调": "不使用",
    "染色方式": "不使用",
    "头发长度": "及胸长发",
    "发质与卷度": "柔和微卷",
    "发型造型": "自然披散",
    "刘海": "轻薄空气刘海",
    "头部配饰": "浅草色编织草帽",
    "穿搭结构": "连衣裙", "连衣裙类型": "碎花吊带连衣裙", "连衣裙颜色": "薄荷绿", "连衣裙材质": "雪纺", "连衣裙图案": "细小碎花",
    "连体服类型": EMPTY_CHOICE, "连体服颜色": EMPTY_CHOICE, "连体服材质": EMPTY_CHOICE, "连体服图案": EMPTY_CHOICE,
    "上装类型": EMPTY_CHOICE, "上装颜色": EMPTY_CHOICE, "上装材质": EMPTY_CHOICE, "上装图案": EMPTY_CHOICE,
    "下装类型": EMPTY_CHOICE, "下装颜色": EMPTY_CHOICE, "下装材质": EMPTY_CHOICE, "下装图案": EMPTY_CHOICE,
    "版型细节": "自然垂褶", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE, "服装配件": "珍珠耳坠",
    "画面瞬间": "枝叶下短暂停留", "基础姿态": "侧身站立", "身体方向": "左侧三分之二身", "身体重心": "右腿承重", "肩颈状态": "双肩放松平稳",
    "手部动作": "抱花束并扶帽檐", "腿部动作": "一腿轻微屈膝", "头部方向": "向右回眸", "视线": "柔和看向镜头", "表情": "温柔浅笑",
    "场景大类": "自然户外", "场景地点": "夏日庭院", "时间切片": "夏日午后", "天气状态": "湿润夏日",
    "前景框景": "嫩绿枫叶", "背景环境": "高亮庭院绿景", "环境细节": "浓密枝叶、白色小雏菊、浅色石板路", "空间材质": "不使用", "空间层次": "植物层叠空间",
    "主光来源": "叶隙阳光", "光线方向": "左后方", "光线质地": "斑驳光影", "照明落点": "面部与肩颈", "阴影表现": "枝叶投影",
    "主配色": "薄荷绿与白", "色温倾向": "轻微偏暖", "画面对比": "低反差",
    "景别": "胸部以上", "画面布局": "中央偏右", "等效焦段": "85mm", "拍摄距离": "1.5米",
    "机位": "平视", "景深": "前景虚化", "对焦位置": "双眼与面部",
    "影像风格": "彩色负片", "细节质地": "胶片柔度", "高光处理": "轻微溢光", "颗粒质感": "细微颗粒",
  },
  "日系咖啡馆暖调近景人像": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "3:4竖构图",
    "成像媒介": "便携数码相机摄影",
    "写真大类": "日常生活",
    "写真主题": "日系咖啡馆生活写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "圆润脸型", "轮廓细节": "面颊饱满",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "暖白肤色", "肤质": "自然细腻",
    "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
    "基础身形": "柔和丰润", "身量观感": "中等身量", "线条重点": "肩颈线条舒展",
    "发色模式": "基础发色",
    "发色": "深栗棕色",
    "发色色调": "不使用",
    "染色方式": "不使用",
    "头发长度": "齐下巴",
    "发质与卷度": "整齐内扣",
    "发型造型": "利落短发轮廓",
    "刘海": "轻薄空气刘海",
    "头部配饰": "不使用",
    "穿搭结构": "上装＋下装", "连衣裙类型": EMPTY_CHOICE, "连衣裙颜色": EMPTY_CHOICE, "连衣裙材质": EMPTY_CHOICE, "连衣裙图案": EMPTY_CHOICE,
    "连体服类型": EMPTY_CHOICE, "连体服颜色": EMPTY_CHOICE, "连体服材质": EMPTY_CHOICE, "连体服图案": EMPTY_CHOICE,
    "上装类型": "挂脖针织上衣", "上装颜色": "咖色", "上装材质": "细罗纹针织", "上装图案": "横向条纹",
    "下装类型": "垂坠中长裙", "下装颜色": "奶油白", "下装材质": "西装面料", "下装图案": EMPTY_CHOICE,
    "版型细节": "修身贴合", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE, "服装配件": "珍珠耳坠",
    "画面瞬间": "咖啡馆短暂休息", "基础姿态": "卡座放松坐姿", "身体方向": "右侧三分之二身", "身体重心": "重心轻微后移", "肩颈状态": "肩膀轻微内收",
    "手部动作": "双手自然放在大腿上", "腿部动作": "坐姿双膝并拢", "头部方向": "头部正对镜头", "视线": "直视镜头", "表情": "平静自然",
    "场景大类": "餐饮与酒店", "场景地点": "咖啡馆卡座", "时间切片": "入夜不久", "天气状态": "不使用",
    "前景框景": "浅木桌沿", "背景环境": "暖木咖啡馆", "环境细节": "浅木餐桌、菜单牌、咖啡杯碟", "空间材质": "深棕皮革", "空间层次": "紧凑室内层次",
    "主光来源": "室内顶光", "光线方向": "前上方", "光线质地": "柔和散射", "照明落点": "面部与肩颈", "阴影表现": "多光源软影",
    "主配色": "暖棕与奶白", "色温倾向": "偏暖", "画面对比": "中低反差",
    "景别": "胸部以上", "画面布局": "居中构图", "等效焦段": "50mm", "拍摄距离": "1米",
    "机位": "略高机位", "景深": "浅景深", "对焦位置": "双眼与面部",
    "影像风格": "便携数码相机", "细节质地": "轻微柔焦", "高光处理": "受控保留", "颗粒质感": "洁净画面",
  },
  "夜间室内轻奢硬闪时尚写真": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "2:3竖构图",
    "成像媒介": "专业数码相机摄影",
    "写真大类": "时尚编辑",
    "写真主题": "夜间室内轻奢时尚写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "修长脸型", "轮廓细节": "下颌线清晰",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "冷白肤色", "肤质": "柔雾均匀",
    "妆容模式": "整体预设", "整体妆容预设": "明艳红唇妆",
    "基础身形": "柔和丰润", "身量观感": "高挑身量", "线条重点": "腰胯曲线柔和",
    "发色模式": "基础发色",
    "发色": "自然黑色",
    "发色色调": "不使用",
    "染色方式": "不使用",
    "头发长度": "及胸长发",
    "发质与卷度": "柔和微卷",
    "发型造型": "整洁高盘发",
    "刘海": "轻盈碎刘海",
    "头部配饰": "不使用",
    "穿搭结构": "连衣裙", "连衣裙类型": "高领修身连衣裙", "连衣裙颜色": "玄黑色", "连衣裙材质": "薄纱", "连衣裙图案": EMPTY_CHOICE,
    "连体服类型": EMPTY_CHOICE, "连体服颜色": EMPTY_CHOICE, "连体服材质": EMPTY_CHOICE, "连体服图案": EMPTY_CHOICE,
    "上装类型": EMPTY_CHOICE, "上装颜色": EMPTY_CHOICE, "上装材质": EMPTY_CHOICE, "上装图案": EMPTY_CHOICE,
    "下装类型": EMPTY_CHOICE, "下装颜色": EMPTY_CHOICE, "下装材质": EMPTY_CHOICE, "下装图案": EMPTY_CHOICE,
    "版型细节": "侧开衩", "袜装": "蕾丝袜口大腿袜", "鞋履": "漆皮高跟鞋", "服装配件": "金属流苏耳饰",
    "画面瞬间": "推门时停下", "基础姿态": "门框间站立", "身体方向": "右侧三分之二身", "身体重心": "左腿承重", "肩颈状态": "一侧肩膀降低",
    "手部动作": "门把手与折扇", "腿部动作": "屈膝抬腿交叉", "头部方向": "头部正对镜头", "视线": "直视镜头", "表情": "明艳自信",
    "场景大类": "居住空间", "场景地点": "室内门廊", "时间切片": "入夜不久", "天气状态": "不使用",
    "前景框景": "纵向门框", "背景环境": "灰色门板与走廊", "环境细节": "金属门把手、浅色石材地面", "空间材质": "灰色木饰面", "空间层次": "纵向框景",
    "主光来源": "镜头方向硬闪", "光线方向": "正面", "光线质地": "清晰硬光", "照明落点": "完整人物", "阴影表现": "清晰闪光阴影",
    "主配色": "黑红金", "色温倾向": "轻微偏暖", "画面对比": "中高反差",
    "景别": "全身构图", "画面布局": "门框框景", "等效焦段": "65mm", "拍摄距离": "3.5米",
    "机位": "略低机位", "景深": "中等景深", "对焦位置": "完整人物",
    "影像风格": "直闪抓拍", "细节质地": "光泽时尚", "高光处理": "镜面高光", "颗粒质感": "轻微数码噪点",
  },
  "都市职场轻奢坐姿写真": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "2:3竖构图",
    "成像媒介": "全画幅微单摄影",
    "写真大类": "商业广告",
    "写真主题": "都市职场轻奢写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "修长脸型", "轮廓细节": "下颌线清晰",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "暖白肤色", "肤质": "自然细腻",
    "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
    "基础身形": "自然匀称", "身量观感": "中等身量", "线条重点": "腰线自然清晰",
    "发色模式": "基础发色",
    "发色": "深棕黑色",
    "发色色调": "不使用",
    "染色方式": "不使用",
    "头发长度": "及胸长发",
    "发质与卷度": "顺滑高光质感",
    "发型造型": "整洁低盘发",
    "刘海": "自然中分",
    "头部配饰": "不使用",
    "穿搭结构": "西装套装", "连衣裙类型": EMPTY_CHOICE, "连衣裙颜色": EMPTY_CHOICE, "连衣裙材质": EMPTY_CHOICE, "连衣裙图案": EMPTY_CHOICE,
    "连体服类型": EMPTY_CHOICE, "连体服颜色": EMPTY_CHOICE, "连体服材质": EMPTY_CHOICE, "连体服图案": EMPTY_CHOICE,
    "上装类型": "修身西装马甲", "上装颜色": "玄黑色", "上装材质": "西装面料", "上装图案": EMPTY_CHOICE,
    "下装类型": "西装短裙", "下装颜色": "炭灰色", "下装材质": "西装面料", "下装图案": EMPTY_CHOICE,
    "版型细节": "深V领口", "袜装": "深灰半透明连裤袜", "鞋履": EMPTY_CHOICE, "服装配件": "细框矩形眼镜",
    "画面瞬间": "查看文件", "基础姿态": "沙发前倾坐姿", "身体方向": "正面朝向镜头", "身体重心": "重心轻微前移", "肩颈状态": "前倾时肩颈放松",
    "手部动作": "签字笔与文件夹", "腿部动作": "坐姿双膝并拢", "头部方向": "头部正对镜头", "视线": "直视镜头", "表情": "冷静自信",
    "场景大类": "办公工作", "场景地点": "办公休息区", "时间切片": "上午晚些时候", "天气状态": "不使用",
    "前景框景": "桌面文件", "背景环境": "办公沙发与墙面", "环境细节": "绿色植物、玻璃立柱、浅色石材地面", "空间材质": "米杏织物", "空间层次": "紧凑室内层次",
    "主光来源": "反射补光", "光线方向": "正面", "光线质地": "极柔和", "照明落点": "面部与双眼", "阴影表现": "极浅阴影",
    "主配色": "暖灰与玄黑", "色温倾向": "中性", "画面对比": "自然反差",
    "景别": "坐姿半身", "画面布局": "中央偏右", "等效焦段": "70mm", "拍摄距离": "2米",
    "机位": "略高机位", "景深": "浅景深", "对焦位置": "双眼与面部",
    "影像风格": "全画幅相机", "细节质地": "细腻商业精修", "高光处理": "受控保留", "颗粒质感": "洁净画面",
  },
  "古风汉服写真": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "2:3竖构图",
    "成像媒介": "全画幅微单摄影",
    "写真大类": "中式美学",
    "写真主题": "汉服襦裙写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "标准鹅蛋脸", "轮廓细节": "下颌线柔和",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "暖白肤色", "肤质": "自然细腻",
    "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
    "基础身形": "自然匀称", "身量观感": "中等身量", "线条重点": "肩颈线条舒展",
    "发色模式": "基础发色",
    "发色": "深棕黑色",
    "发色色调": "不使用",
    "染色方式": "不使用",
    "头发长度": "及胸长发",
    "发质与卷度": "自然顺直",
    "发型造型": "整洁低盘发",
    "刘海": "自然中分",
    "头部配饰": "金色发簪",
    "穿搭结构": "连衣裙", "连衣裙类型": "汉服", "连衣裙颜色": "酒红色", "连衣裙材质": "真丝", "连衣裙图案": "暗纹提花",
    "版型细节": "明确收腰", "袜装": "不使用", "鞋履": "不使用", "服装配件": "珍珠耳坠",
    "画面瞬间": "回眸一笑", "基础姿态": "自然站立", "身体方向": "左侧三分之二身", "身体重心": "右腿承重", "肩颈状态": "双肩放松平稳",
    "手部动作": "双手身前轻握", "腿部动作": "一腿轻微屈膝", "头部方向": "向右回眸", "视线": "柔和看向镜头", "表情": "温柔浅笑",
    "场景大类": "东方传统", "场景地点": "江南园林", "时间切片": "阴天下午", "天气状态": "不使用",
    "前景框景": "树枝前景", "背景环境": "江南园林", "环境细节": "木质屏风", "空间材质": "不使用", "空间层次": "前中后三层",
    "主光来源": "窗户日光", "光线方向": "左侧", "光线质地": "柔和定向", "照明落点": "面部与肩颈", "阴影表现": "自然轮廓阴影",
    "主配色": "新中式木色", "色温倾向": "轻微偏暖", "画面对比": "压缩灰阶",
    "景别": "胸部以上", "画面布局": "中央偏右", "等效焦段": "85mm", "拍摄距离": "1.5米",
    "机位": "平视", "景深": "前景虚化", "对焦位置": "双眼与面部",
    "影像风格": "全画幅相机", "细节质地": "哑光质感", "高光处理": "克制高光", "颗粒质感": "细微颗粒",
  },
  "海边假日度假写真": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "2:3竖构图",
    "成像媒介": "便携数码相机摄影",
    "写真大类": "旅行度假",
    "写真主题": "海边夏日度假写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "标准鹅蛋脸", "轮廓细节": "下颌线柔和",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "暖白肤色", "肤质": "自然细腻",
    "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
    "基础身形": "自然匀称", "身量观感": "中等身量", "线条重点": "肩颈线条舒展",
    "发色模式": "基础发色",
    "发色": "深棕黑色",
    "发色色调": "不使用",
    "染色方式": "不使用",
    "头发长度": "及胸长发",
    "发质与卷度": "柔和微卷",
    "发型造型": "自然披散",
    "刘海": "轻薄空气刘海",
    "头部配饰": "浅草色编织草帽",
    "穿搭结构": "连衣裙", "连衣裙类型": "缎面吊带长裙", "连衣裙颜色": "天蓝色", "连衣裙材质": "雪纺", "连衣裙图案": "不使用",
    "版型细节": "自然垂褶", "袜装": "不使用", "鞋履": "不使用", "服装配件": "珍珠耳坠",
    "画面瞬间": "回眸一笑", "基础姿态": "自然站立", "身体方向": "左侧三分之二身", "身体重心": "右腿承重", "肩颈状态": "双肩放松平稳",
    "手部动作": "指向远方", "腿部动作": "一腿轻微屈膝", "头部方向": "向右回眸", "视线": "柔和看向镜头", "表情": "明朗笑容",
    "场景大类": "自然户外", "场景地点": "海边", "时间切片": "日落前金色时刻", "天气状态": "晴朗日照",
    "前景框景": "水面光斑", "背景环境": "海边地平线", "环境细节": "细小海浪", "空间材质": "不使用", "空间层次": "开阔户外纵深",
    "主光来源": "日落阳光", "光线方向": "右后方", "光线质地": "发光逆光", "照明落点": "发丝轮廓", "阴影表现": "日落长影",
    "主配色": "海天蓝与沙色", "色温倾向": "轻微偏暖", "画面对比": "中低反差",
    "景别": "胸部以上", "画面布局": "中央偏右", "等效焦段": "85mm", "拍摄距离": "1.5米",
    "机位": "平视", "景深": "前景虚化", "对焦位置": "双眼与面部",
    "影像风格": "便携数码相机", "细节质地": "自然细节", "高光处理": "明亮洁净", "颗粒质感": "洁净画面",
  },
  "赛博都市夜景写真": {
    ...EMPTY_CLOTHING_PRESET_VALUES,
    ...EMPTY_MAKEUP_PRESET_VALUES,
    "画面比例": "2:3竖构图",
    "成像媒介": "全画幅微单摄影",
    "写真大类": "幻想概念",
    "写真主题": "未来都市赛博写真",
    "年龄阶段": "20–29岁",
    "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "修长脸型", "轮廓细节": "下颌线清晰",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "冷白肤色", "肤质": "柔雾均匀",
    "妆容模式": "整体预设", "整体妆容预设": "明艳红唇妆",
    "基础身形": "柔和丰润", "身量观感": "高挑身量", "线条重点": "腰胯曲线柔和",
    "发色模式": "进阶染发",
    "发色": "蓝黑色",
    "发色色调": "蓝黑反光",
    "染色方式": "均匀单色染",
    "头发长度": "及胸长发",
    "发质与卷度": "柔和微卷",
    "发型造型": "自然披散",
    "刘海": "轻薄空气刘海",
    "头部配饰": "几何金属发夹",
    "穿搭结构": "连衣裙", "连衣裙类型": "抹胸连衣裙", "连衣裙颜色": "玄黑色", "连衣裙材质": "漆皮", "连衣裙图案": "拼色结构",
    "版型细节": "修身贴合", "袜装": "不使用", "鞋履": "不使用", "服装配件": "金属流苏耳饰",
    "画面瞬间": "行走中回头", "基础姿态": "行走中停步", "身体方向": "左侧三分之二身", "身体重心": "重心轻微前移", "肩颈状态": "双肩放松平稳",
    "手部动作": "双臂自然垂落", "腿部动作": "自然迈步", "头部方向": "向右回眸", "视线": "柔和看向镜头", "表情": "明艳自信",
    "场景大类": "都市户外", "场景地点": "未来赛博街区", "时间切片": "夜间", "天气状态": "不使用",
    "前景框景": "失焦光点", "背景环境": "未来赛博街区", "环境细节": "霓虹招牌", "空间材质": "不使用", "空间层次": "反射空间层次",
    "主光来源": "霓虹灯牌", "光线方向": "左侧", "光线质地": "混合色光", "照明落点": "上半身", "阴影表现": "深侧影",
    "主配色": "紫蓝霓虹", "色温倾向": "冷暖混合", "画面对比": "中高反差",
    "景别": "胸部以上", "画面布局": "中央偏右", "等效焦段": "85mm", "拍摄距离": "1.5米",
    "机位": "平视", "景深": "前景虚化", "对焦位置": "双眼与面部",
    "影像风格": "全画幅相机", "细节质地": "光泽时尚", "高光处理": "镜面高光", "颗粒质感": "洁净画面",
  },
  "自定义组合": {
    "画面比例": "2:3竖构图", "成像媒介": "全画幅微单摄影",
    "写真大类": "不使用", "写真主题": "不使用",
    "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
    "脸型": "标准鹅蛋脸", "轮廓细节": "颧骨柔和",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "自然浅肤色", "肤质": "真实皮肤纹理",
    "妆容模式": "整体预设", "整体妆容预设": "自然裸妆",
    "底妆质感": "不使用", "眼影色系": "不使用", "眼线造型": "不使用",
    "唇妆颜色": "不使用", "唇面质感": "不使用",
    "基础身形": "自然匀称", "身量观感": "中等身量", "线条重点": "腰线自然清晰",
    "发色模式": "不使用", "发色": "不使用", "发色色调": "不使用", "染色方式": "不使用",
    "头发长度": "不使用", "发质与卷度": "不使用", "发型造型": "不使用", "刘海": "不使用", "头部配饰": "不使用",
    "穿搭结构": "不使用",
    "连衣裙类型": "不使用", "连衣裙颜色": "不使用", "连衣裙材质": "不使用", "连衣裙图案": "不使用",
    "连体服类型": "不使用", "连体服颜色": "不使用", "连体服材质": "不使用", "连体服图案": "不使用",
    "上装类型": "不使用", "上装颜色": "不使用", "上装材质": "不使用", "上装图案": "不使用",
    "下装类型": "不使用", "下装颜色": "不使用", "下装材质": "不使用", "下装图案": "不使用",
    "版型细节": "不使用", "袜装": "不使用", "鞋履": "不使用", "服装配件": "不使用",
    "画面瞬间": "不使用", "基础姿态": "不使用", "身体方向": "不使用", "身体重心": "不使用", "肩颈状态": "不使用",
    "手部动作": "不使用", "腿部动作": "不使用", "头部方向": "不使用", "视线": "不使用", "表情": "不使用",
    "场景大类": "不使用", "场景地点": "不使用", "时间切片": "不使用", "天气状态": "不使用",
    "前景框景": "不使用", "背景环境": "不使用", "环境细节": "不使用", "空间材质": "不使用", "空间层次": "不使用",
    "主光来源": "不使用", "光线方向": "不使用", "光线质地": "不使用", "照明落点": "不使用", "阴影表现": "不使用",
    "主配色": "不使用", "色温倾向": "不使用", "画面对比": "不使用",
    "景别": "不使用", "画面布局": "不使用", "等效焦段": "不使用", "拍摄距离": "不使用",
    "机位": "不使用", "景深": "不使用", "对焦位置": "不使用",
    "影像风格": "不使用", "细节质地": "不使用", "高光处理": "不使用", "颗粒质感": "不使用",
  },
};

function widgetByName(node, name) {
  return node.widgets?.find((widget) => widget.name === name);
}

function setWidgetValue(node, name, value) {
  const widget = widgetByName(node, name);
  if (!widget) return;
  const allowedValues = widget.options?.values;
  if (Array.isArray(allowedValues) && !allowedValues.includes(value)) return;
  widget.value = value;
}

function addNonSerializedWidget(node, type, name, value, callback, options = {}) {
  const widget = node.addWidget(type, name, value, callback, { ...options, serialize: false });
  widget.serialize = false;
  widget.options = widget.options || {};
  widget.options.serialize = false;
  return widget;
}

function installCompactWidgetSerialization(node) {
  if (node.__vividMuseCompactSerialization) return;
  const originalOnSerialize = node.onSerialize;
  node.onSerialize = function (info) {
    const result = originalOnSerialize?.apply(this, arguments);
    if (Array.isArray(info.widgets_values)) {
      info.widgets_values = (node.widgets || []).flatMap((widget, index) => (
        widget.serialize === false ? [] : [info.widgets_values[index]]
      ));
    }
    return result;
  };
  node.__vividMuseCompactSerialization = true;
}

function installCompactWidgetConfigure(node) {
  if (node.__vividMuseCompactConfigure) return;
  const originalOnConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    const result = originalOnConfigure?.apply(this, arguments);
    ensureConfiguredNode(node);
    return result;
  };
  node.__vividMuseCompactConfigure = true;
}

function markDirty(node) {
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function setWidgetVisibilityReason(widget, reason, visible) {
  if (!widget) return;
  widget.__vividMuseHiddenReasons ??= new Set();
  if (visible) widget.__vividMuseHiddenReasons.delete(reason);
  else widget.__vividMuseHiddenReasons.add(reason);

  const shouldHide = widget.__vividMuseHiddenReasons.size > 0;
  if (shouldHide && !widget.__vividMuseHidden) {
    widget.__vividMuseOriginalType ??= widget.type;
    widget.__vividMuseOriginalComputeSize ??= widget.computeSize;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
  } else if (!shouldHide && widget.__vividMuseHidden) {
    widget.type = widget.__vividMuseOriginalType;
    widget.computeSize = widget.__vividMuseOriginalComputeSize;
  }
  widget.__vividMuseHidden = shouldHide;
  // ComfyUI 0.33.x 的 widget 绘制不再完全尊重 "converted-widget" 占位类型，
  // 隐藏的字段会残留标题文字却无法交互；用 LiteGraph 原生的 hidden 属性彻底隐藏。
  widget.hidden = shouldHide;
}

function resizeNode(node) {
  const computed = node.computeSize?.();
  if (computed) node.setSize?.([Math.max(computed[0], 360), computed[1]]);
}

const DEFAULT_ACTIVE_MODULE = "画面基础";

const ACTIVE_MODULE_PROPERTY = "vividMuseActiveModule";
const ONLY_ENABLED_MODULE_PROPERTY = "vividMuseOnlyEnabledModule";

function normalizeModuleName(moduleName) {
  return Object.hasOwn(MODULE_FIELD_GROUPS, moduleName)
    ? moduleName
    : DEFAULT_ACTIVE_MODULE;
}

function syncModuleVisibility(node, moduleName, resize = true) {
  const normalized = normalizeModuleName(moduleName);
  const visibleFields = new Set(MODULE_FIELD_GROUPS[normalized]);
  for (const fieldName of FIELD_NAMES) {
    setWidgetVisibilityReason(
      widgetByName(node, fieldName),
      "module",
      visibleFields.has(fieldName),
    );
  }
  if (resize) resizeNode(node);
  return normalized;
}

function setActiveModule(node, moduleName) {
  const normalized = normalizeModuleName(moduleName);
  node.properties ??= {};
  node.properties[ACTIVE_MODULE_PROPERTY] = normalized;
  if (node.__vividMuseModuleWidget) node.__vividMuseModuleWidget.value = normalized;
  syncModuleVisibility(node, normalized, false);
  syncMakeupVisibility(node, false, false);
  syncHairAdvancedVisibility(node, false, false);
  syncClothingVisibility(node, false, false);
  resizeNode(node);
  markDirty(node);
  return normalized;
}

function syncConfiguredNode(node) {
  syncThemeOptions(node, false);
  syncEthnicityBranchOptions(node, false);
  syncSceneLocationOptions(node, false);
  const normalized = setActiveModule(node, node.properties?.[ACTIVE_MODULE_PROPERTY]);
  node.__vividMuseConfiguredState = configuredNodeState(node);
  return normalized;
}

function configuredNodeState(node) {
  return JSON.stringify([
    node.properties?.[ACTIVE_MODULE_PROPERTY],
    widgetByName(node, "预设")?.value,
    widgetByName(node, "写真大类")?.value,
    widgetByName(node, "族裔大类")?.value,
    widgetByName(node, "场景大类")?.value,
    widgetByName(node, "妆容模式")?.value,
    widgetByName(node, "发色模式")?.value,
    widgetByName(node, "穿搭结构")?.value,
  ]);
}

function ensureConfiguredNode(node) {
  const computed = node.computeSize?.();
  const expectedSize = computed && [Math.max(computed[0], 360), computed[1]];
  const sizeIsCurrent = !expectedSize || (
    node.size?.[0] === expectedSize[0] && node.size?.[1] === expectedSize[1]
  );
  if (node.__vividMuseConfiguredState === configuredNodeState(node) && sizeIsCurrent) {
    return normalizeModuleName(node.properties?.[ACTIVE_MODULE_PROPERTY]);
  }
  return syncConfiguredNode(node);
}

function moveWidgetBefore(node, widget, targetWidget) {
  if (!widget || !targetWidget) return;
  const oldIndex = node.widgets.indexOf(widget);
  if (oldIndex >= 0) node.widgets.splice(oldIndex, 1);
  const targetIndex = node.widgets.indexOf(targetWidget);
  node.widgets.splice(targetIndex, 0, widget);
}

function syncHairAdvancedVisibility(node, clearWhenBasic = false, resize = true) {
  const modeWidget = widgetByName(node, "发色模式");
  const advancedWidgets = [
    widgetByName(node, "发色色调"),
    widgetByName(node, "染色方式"),
  ];
  if (!modeWidget) return;
  const visible = ["进阶染发", RANDOM_CHOICE].includes(modeWidget.value);
  if (!visible && clearWhenBasic) {
    for (const widget of advancedWidgets) {
      if (widget) widget.value = EMPTY_CHOICE;
    }
  }
  for (const widget of advancedWidgets) setWidgetVisibilityReason(widget, "dependency", visible);
  if (resize) resizeNode(node);
  markDirty(node);
}

function syncMakeupVisibility(node, clearHidden = false, resize = true) {
  const modeWidget = widgetByName(node, "妆容模式");
  if (!modeWidget) return;
  let mode = modeWidget.value;
  if (mode === FOLLOW_PRESET) {
    const preset = widgetByName(node, "预设")?.value;
    mode = PRESETS[preset]?.["妆容模式"];
  }
  const showAll = [RANDOM_CHOICE, EMPTY_CHOICE, undefined].includes(mode);
  const visibilityByField = {
    "整体妆容预设": showAll || mode === "整体预设",
    ...Object.fromEntries(MAKEUP_CUSTOM_FIELDS.map(name => [name, showAll || mode === "分项自定义"])),
  };
  for (const [fieldName, visible] of Object.entries(visibilityByField)) {
    const widget = widgetByName(node, fieldName);
    if (!visible && clearHidden && widget) widget.value = EMPTY_CHOICE;
    setWidgetVisibilityReason(widget, "dependency", visible);
  }
  if (resize) resizeNode(node);
  markDirty(node);
}

function syncClothingVisibility(node, clearHidden = false, resize = true) {
  const modeWidget = widgetByName(node, "穿搭结构");
  if (!modeWidget) return;
  let mode = modeWidget.value;
  if (mode === FOLLOW_PRESET) {
    const preset = widgetByName(node, "预设")?.value;
    mode = PRESETS[preset]?.["穿搭结构"];
  }
  const showAll = [RANDOM_CHOICE, EMPTY_CHOICE, undefined].includes(mode);
  const visibleFields = new Set(CLOTHING_MODE_FIELDS[mode] || []);
  for (const fieldName of CLOTHING_BRANCH_FIELDS) {
    const widget = widgetByName(node, fieldName);
    const visible = showAll || visibleFields.has(fieldName);
    if (!visible && clearHidden && widget) widget.value = EMPTY_CHOICE;
    setWidgetVisibilityReason(widget, "dependency", visible);
  }
  if (resize) resizeNode(node);
  markDirty(node);
}

function applyPreset(node, presetName) {
  const values = PRESETS[presetName];
  if (!values) return;
  delete node.properties?.[ONLY_ENABLED_MODULE_PROPERTY];
  setWidgetValue(node, "写真大类", values["写真大类"]);
  syncThemeOptions(node, false);
  setWidgetValue(node, "族裔大类", values["族裔大类"]);
  syncEthnicityBranchOptions(node, false);
  setWidgetValue(node, "场景大类", values["场景大类"]);
  syncSceneLocationOptions(node, false);
  for (const [name, value] of Object.entries(values)) {
    setWidgetValue(node, name, value);
  }
  syncMakeupVisibility(node, true);
  syncHairAdvancedVisibility(node, true);
  syncClothingVisibility(node, true);
  markDirty(node);
}

function syncEthnicityBranchOptions(node, chooseFirst = false) {
  const categoryWidget = widgetByName(node, "族裔大类");
  const branchWidget = widgetByName(node, "地域族裔分支");
  if (!categoryWidget || !branchWidget) return;

  const category = categoryWidget.value;
  const allowed = ETHNICITY_BRANCHES_BY_CATEGORY[category];
  const allBranches = [...new Set(Object.values(ETHNICITY_BRANCHES_BY_CATEGORY).flat())];
  const choices = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allBranches)];
  branchWidget.options = branchWidget.options || {};
  branchWidget.options.values = choices;

  if (chooseFirst && allowed?.length) {
    branchWidget.value = allowed[0];
  } else if (!choices.includes(branchWidget.value)) {
    branchWidget.value = FOLLOW_PRESET;
  }
}

function syncThemeOptions(node, chooseFirst = false) {
  const categoryWidget = widgetByName(node, "写真大类");
  const themeWidget = widgetByName(node, "写真主题");
  if (!categoryWidget || !themeWidget) return;

  const category = categoryWidget.value;
  const allowed = THEME_OPTIONS_BY_CATEGORY[category];
  const allThemes = Object.values(THEME_OPTIONS_BY_CATEGORY).flat();
  const choices = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allThemes)];
  themeWidget.options = themeWidget.options || {};
  themeWidget.options.values = choices;

  if (chooseFirst && allowed?.length) {
    themeWidget.value = allowed[0];
  } else if (!choices.includes(themeWidget.value)) {
    themeWidget.value = FOLLOW_PRESET;
  }
}

function syncSceneLocationOptions(node, chooseFirst = false) {
  const categoryWidget = widgetByName(node, "场景大类");
  const locationWidget = widgetByName(node, "场景地点");
  if (!categoryWidget || !locationWidget) return;

  const category = categoryWidget.value;
  const allowed = SCENE_LOCATIONS_BY_CATEGORY[category];
  const allLocations = [...new Set(Object.values(SCENE_LOCATIONS_BY_CATEGORY).flat())];
  const choices = [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, ...(allowed || allLocations)];
  locationWidget.options = locationWidget.options || {};
  locationWidget.options.values = choices;

  if (chooseFirst && allowed?.length) {
    locationWidget.value = allowed[0];
  } else if (!choices.includes(locationWidget.value)) {
    locationWidget.value = FOLLOW_PRESET;
  }
}

function randomFieldsForScope(scope) {
  if (scope === MIX_SCOPE) return FIELD_NAMES;
  if (scope === THEME_SCOPE) return STANDARD_RANDOM_FIELDS;
  return LIGHT_RANDOM_FIELDS;
}

function exclusivelyEnabledModule(node) {
  const enabledModules = Object.entries(MODULE_FIELD_GROUPS)
    .filter(([, fieldNames]) => fieldNames.some(
      (fieldName) => widgetByName(node, fieldName)?.value !== EMPTY_CHOICE,
    ))
    .map(([moduleName]) => moduleName);
  if (enabledModules.length === 1) return enabledModules[0];
  if (enabledModules.length === 0 && Object.hasOwn(
    MODULE_FIELD_GROUPS,
    node.properties?.[ONLY_ENABLED_MODULE_PROPERTY],
  )) {
    return node.properties[ONLY_ENABLED_MODULE_PROPERTY];
  }
  return undefined;
}

function prepareRandomCombination(node) {
  const scope = widgetByName(node, "随机范围")?.value ?? LOCAL_SCOPE;
  const onlyEnabledModule = exclusivelyEnabledModule(node);
  const candidateFields = onlyEnabledModule
    ? MODULE_FIELD_GROUPS[onlyEnabledModule]
    : randomFieldsForScope(scope);
  for (const fieldName of candidateFields) {
    setWidgetValue(node, fieldName, RANDOM_CHOICE);
  }

  const seedWidget = widgetByName(node, "随机种子");
  if (seedWidget) {
    seedWidget.value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  }
  syncThemeOptions(node);
  syncEthnicityBranchOptions(node);
  syncMakeupVisibility(node);
  syncHairAdvancedVisibility(node);
  syncClothingVisibility(node);
  syncSceneLocationOptions(node);
  markDirty(node);
}

function syncDependentWidgets(node) {
  syncThemeOptions(node);
  syncEthnicityBranchOptions(node);
  syncMakeupVisibility(node, true);
  syncHairAdvancedVisibility(node, true);
  syncClothingVisibility(node, true);
  syncSceneLocationOptions(node);
  markDirty(node);
}

function clearStructuredFields(node) {
  delete node.properties?.[ONLY_ENABLED_MODULE_PROPERTY];
  for (const fieldName of FIELD_NAMES) setWidgetValue(node, fieldName, EMPTY_CHOICE);
  syncDependentWidgets(node);
}

function enableOnlyModule(node, moduleName) {
  const moduleFields = MODULE_FIELD_GROUPS[moduleName];
  if (!moduleFields) {
    console.error(`VividMuse: unknown module ${moduleName}`);
    return;
  }
  const activeValues = new Map(moduleFields.map((fieldName) => [
    fieldName,
    widgetByName(node, fieldName)?.value,
  ]));
  for (const fieldName of FIELD_NAMES) {
    if (!moduleFields.includes(fieldName)) setWidgetValue(node, fieldName, EMPTY_CHOICE);
  }
  for (const [fieldName, value] of activeValues) setWidgetValue(node, fieldName, value);
  node.properties ??= {};
  node.properties[ONLY_ENABLED_MODULE_PROPERTY] = moduleName;
  syncThemeOptions(node);
  syncEthnicityBranchOptions(node);
  syncMakeupVisibility(node, false);
  syncHairAdvancedVisibility(node, false);
  syncClothingVisibility(node, false);
  syncSceneLocationOptions(node);
  markDirty(node);
}

function clearEverything(node) {
  clearStructuredFields(node);
  setWidgetValue(node, "自由提示词", "");
  markDirty(node);
}

function placeStructuredActionsBeforePromptLibraries(node) {
  const target = node.__vividMuseFreePromptSpacer || widgetByName(node, "自由提示词");
  if (!target) return;
  const actions = [
    node.__vividMuseRandomButton,
    node.__vividMuseEnableOnlyModuleButton,
    node.__vividMuseClearStructuredButton,
    node.__vividMuseClearEverythingButton,
  ];
  for (const action of actions) moveWidgetBefore(node, action, target);
}

app.registerExtension({
  name: "VividMuse.ZImagePromptBuilder.V4",
  async nodeCreated(node) {
    const isTarget = node.comfyClass === NODE_CLASS || node.constructor?.type === NODE_CLASS;
    if (!isTarget) return;

    installCompactWidgetSerialization(node);
    installCompactWidgetConfigure(node);

    const presetWidget = widgetByName(node, "预设");
    if (presetWidget && !presetWidget.__vividMusePresetSync) {
      const originalCallback = presetWidget.callback;
      presetWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        applyPreset(node, value);
        return result;
      };
      presetWidget.__vividMusePresetSync = true;
    }

    const categoryWidget = widgetByName(node, "写真大类");
    if (categoryWidget && !categoryWidget.__vividMuseThemeFilter) {
      const originalCallback = categoryWidget.callback;
      categoryWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncThemeOptions(node, Boolean(THEME_OPTIONS_BY_CATEGORY[value]));
        markDirty(node);
        return result;
      };
      categoryWidget.__vividMuseThemeFilter = true;
    }

    const ethnicityCategoryWidget = widgetByName(node, "族裔大类");
    if (ethnicityCategoryWidget && !ethnicityCategoryWidget.__vividMuseEthnicityFilter) {
      const originalCallback = ethnicityCategoryWidget.callback;
      ethnicityCategoryWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncEthnicityBranchOptions(node, Boolean(ETHNICITY_BRANCHES_BY_CATEGORY[value]));
        markDirty(node);
        return result;
      };
      ethnicityCategoryWidget.__vividMuseEthnicityFilter = true;
    }

    const makeupModeWidget = widgetByName(node, "妆容模式");
    if (makeupModeWidget && !makeupModeWidget.__vividMuseMakeupModeFilter) {
      const originalCallback = makeupModeWidget.callback;
      makeupModeWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncMakeupVisibility(node, ["整体预设", "分项自定义"].includes(value));
        return result;
      };
      makeupModeWidget.__vividMuseMakeupModeFilter = true;
    }

    const sceneCategoryWidget = widgetByName(node, "场景大类");
    if (sceneCategoryWidget && !sceneCategoryWidget.__vividMuseSceneFilter) {
      const originalCallback = sceneCategoryWidget.callback;
      sceneCategoryWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncSceneLocationOptions(node, Boolean(SCENE_LOCATIONS_BY_CATEGORY[value]));
        markDirty(node);
        return result;
      };
      sceneCategoryWidget.__vividMuseSceneFilter = true;
    }

    const hairModeWidget = widgetByName(node, "发色模式");
    if (hairModeWidget && !hairModeWidget.__vividMuseHairModeFilter) {
      const originalCallback = hairModeWidget.callback;
      hairModeWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncHairAdvancedVisibility(node, value === "基础发色");
        return result;
      };
      hairModeWidget.__vividMuseHairModeFilter = true;
    }

    const clothingModeWidget = widgetByName(node, "穿搭结构");
    if (clothingModeWidget && !clothingModeWidget.__vividMuseClothingModeFilter) {
      const originalCallback = clothingModeWidget.callback;
      clothingModeWidget.callback = function (value) {
        const result = originalCallback?.apply(this, arguments);
        syncClothingVisibility(node, ![FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE].includes(value));
        return result;
      };
      clothingModeWidget.__vividMuseClothingModeFilter = true;
    }

    if (!node.__vividMuseModuleWidget) {
      const moduleNames = Object.keys(MODULE_FIELD_GROUPS);
      const saved = normalizeModuleName(node.properties?.[ACTIVE_MODULE_PROPERTY]);
      const moduleWidget = addNonSerializedWidget(
        node,
        "combo",
        "当前编辑模块",
        saved,
        value => setActiveModule(node, value),
        { values: moduleNames },
      );
      node.__vividMuseModuleWidget = moduleWidget;
      moveWidgetBefore(node, moduleWidget, widgetByName(node, FIELD_NAMES[0]));
    }

    if (!node.__vividMuseFreePromptSpacer) {
      const spacer = addNonSerializedWidget(
        node, "button", "__vividMuseFreePromptSpacer", null, () => {},
      );
      spacer.computeSize = () => [0, 8];
      spacer.draw = () => {};
      node.__vividMuseFreePromptSpacer = spacer;
      moveWidgetBefore(node, spacer, widgetByName(node, "自由提示词"));
    }

    if (!node.__vividMuseEnableOnlyModuleButton) {
      node.__vividMuseEnableOnlyModuleButton = addNonSerializedWidget(
        node,
        "button",
        "仅启用当前模块",
        null,
        () => enableOnlyModule(node, node.__vividMuseModuleWidget?.value),
      );
    }

    if (!node.__vividMuseRandomButton) {
      node.__vividMuseRandomButton = addNonSerializedWidget(
        node, "button", "🎲 生成随机组合", null, () => prepareRandomCombination(node),
      );
    }

    if (!node.__vividMuseClearStructuredButton) {
      node.__vividMuseClearStructuredButton = addNonSerializedWidget(
        node, "button", "清空结构化模块", null, () => clearStructuredFields(node),
      );
    }

    if (!node.__vividMuseClearEverythingButton) {
      node.__vividMuseClearEverythingButton = addNonSerializedWidget(
        node, "button", "全部清空", null, () => clearEverything(node),
      );
    }

    placeStructuredActionsBeforePromptLibraries(node);
    ensureConfiguredNode(node);
  },
  loadedGraphNode(node) {
    const isTarget = node.comfyClass === NODE_CLASS || node.constructor?.type === NODE_CLASS;
    if (!isTarget || !node.__vividMuseModuleWidget) return;
    placeStructuredActionsBeforePromptLibraries(node);
    ensureConfiguredNode(node);
  },
});
