---
inclusion: always
---

# 产品概述

lv_font_conv 将矢量字体 (TTF/WOFF/OTF) 转换为紧凑的 bitmap 格式，专为资源受限的嵌入式系统优化。

## 核心目标

为无法实时渲染矢量字体的嵌入式设备光栅化字形。主要用于 [LVGL](https://github.com/lvgl/lvgl) (轻量级嵌入式 GUI 库)。

## 关键特性

- Bitmap 转换，支持抗锯齿 (1/2/3/4/8 bpp)
- 保留 kerning 信息确保文本间距正确
- 内置 RLE 压缩最小化存储
- 字体子集化 - 仅包含所需字形
- 多源字体合并
- 三种输出格式：binary、LVGL C 代码、debug dump (PNG + JSON)

## 关键约束

开发时务必记住：

- 目标用户内存极度受限 (嵌入式系统)
- 输出大小优化至关重要 - 每个字节都重要
- 与 LVGL 兼容性是首要需求
- 通过 WebAssembly 实现跨平台 (无 native 依赖)

## 输出格式要求

- Binary 格式必须遵循 `doc/font_spec.md` 规范
- LVGL C 代码必须兼容 LVGL v7+ API
- 所有输出必须确定性 (deterministic) 以便版本控制

## 分发方式

- npm package: `lv_font_conv`
- 双接口：CLI 工具 + Web UI
- 最低 Node.js v14+
