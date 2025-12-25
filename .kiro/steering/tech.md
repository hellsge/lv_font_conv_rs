---
inclusion: always
---

# 技术栈与开发规范

## 运行环境
- Node.js v14+ (CLI + 核心逻辑)
- WebAssembly (FreeType 字体渲染)

## 核心依赖
- `opentype.js` - 字体解析 (TTF/WOFF/OTF)
- `argparse` - CLI 参数解析
- `pngjs` - PNG 生成 (debug dump)
- `bit-buffer` - 位级数据操作
- `mkdirp` - 目录创建

## 开发工具
- ESLint - 代码检查 (`.eslintrc.yml`)
- Mocha - 测试框架
- nyc - 覆盖率报告
- Browserify - Web 打包
- Docker - FreeType WASM 编译环境

## 代码风格 (严格遵循)

- 文件顶部 `'use strict';`
- 单引号字符串 `'example'`
- 2 空格缩进 (禁用 tab)
- 最大行长 120 字符
- 必须使用分号
- 数组/对象字面量括号内加空格：`[ item ]` `{ key: value }`
- 遵循 `.eslintrc.yml` 规则

## 测试规范

- 测试文件镜像 `lib/` 结构，位于 `test/`
- 使用 Mocha 框架
- `npm test` 执行带覆盖率测试
- 新功能必须包含测试

## 常用命令

```bash
npm install              # 安装依赖
npm run lint             # ESLint 检查
npm test                 # 测试 + 覆盖率
npm run coverage         # 覆盖率报告
npm start                # Web dev server
npm run build            # Web 打包
npm run build:freetype   # 编译 FreeType WASM (需 Docker)
```

## 架构要点

- FreeType 编译为 WASM 实现跨平台光栅化
- Writer 可插拔模块 (`lib/writers/`) 支持多输出格式
- 字体表遵循简化 OpenType 规范，针对 bitmap 优化 
