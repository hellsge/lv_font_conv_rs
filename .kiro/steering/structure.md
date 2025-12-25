---
inclusion: always
---

# 项目结构

```
lv_font_conv/
├── lv_font_conv.js      # CLI 入口
├── lib/
│   ├── cli.js           # 参数解析 + 流程编排
│   ├── convert.js       # 主转换 API (CLI/Web 共用)
│   ├── collect_font_data.js  # 字体加载 + 字形提取
│   ├── ranger.js        # Unicode 范围管理
│   ├── utils.js         # 通用工具
│   ├── app_error.js     # 自定义错误类
│   ├── font/            # 字体表生成
│   │   ├── font.js      # Font 主类
│   │   ├── compress.js  # RLE 压缩
│   │   ├── table_*.js   # 各字体表 (head/cmap/glyf/loca/kern)
│   │   └── cmap_build_subtables.js
│   ├── freetype/        # WASM FreeType 封装
│   │   ├── index.js     # JS 接口
│   │   ├── render.c     # C helper
│   │   └── build/       # 编译后 WASM
│   └── writers/         # 输出格式 writer
│       ├── bin.js       # Binary 格式
│       ├── dump.js      # Debug dump (PNG + JSON)
│       └── lvgl/        # LVGL C 代码生成
│           ├── index.js
│           └── lv_*.js  # 各表 C 代码生成
├── web/                 # 浏览器 UI
├── test/                # Mocha 测试 (镜像 lib/)
├── doc/                 # 文档
│   └── font_spec.md     # Binary 格式规范
└── support/             # 构建脚本 + Docker
```

## 数据流

1. **输入** → CLI 参数 / Web 表单 → `cli.js` / `web/index.js`
2. **采集** → `collect_font_data.js` 用 FreeType (WASM) 光栅化字形
3. **处理** → `font/font.js` 构建内部字体表
4. **输出** → Writer (`bin.js` / `lvgl/` / `dump.js`) 序列化目标格式

## 关键模式

- 字体表遵循简化 OpenType 规范 (针对 bitmap 优化)
- Writer 可插拔架构 (`lib/writers/`)
- FreeType 编译为 WASM 实现跨平台渲染
- 测试镜像 `lib/` 结构于 `test/`
