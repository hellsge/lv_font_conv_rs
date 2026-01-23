# lv_font_conv 扩展功能

本 fork 版本在原始 [lv_font_conv](https://github.com/lvgl/lvgl/tree/master/scripts/lv_font_conv) 基础上新增了两个扩展功能。

## 快速示例

```bash
# 同时使用两个扩展功能
lv_font_conv --font Roboto-Regular.ttf \
  --range 0x20-0x7F \
  --size 16 \
  --format lvgl \
  --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  --extract-glyph-bitmap \
  --output my_font.c
```

生成文件：
- `my_font.c` - 字体元数据和宏引用
- `my_font_glyph_bitmap.bin` - LSB 格式的 bitmap 数据

---

## 功能 1: 像素顺序控制 (`--pixel-order`)

控制字节内像素位的排列方式，以匹配不同显示硬件的要求。

### 基本用法

```bash
# MSB 排序（默认）- 最高位代表最左侧像素
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order MSB \
  -o font.c

# LSB 排序 - 最低位代表最左侧像素（需要 --no-compress）
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  -o font.c
```

### 像素排序示例

**4 BPP (2 像素/字节)**
```
像素序列: [p1, p0]

MSB: p1p1p1p1 p0p0p0p0  (高位在左)
LSB: p0p0p0p0 p1p1p1p1  (低位在左)
```

**2 BPP (4 像素/字节)**
```
像素序列: [p3, p2, p1, p0]

MSB: p3p3 p2p2 p1p1 p0p0
LSB: p0p0 p1p1 p2p2 p3p3
```

### 重要限制

⚠️ **LSB 模式必须配合 `--no-compress` 使用**

```bash
# ❌ 错误
lv_font_conv --pixel-order LSB -o font.c

# ✅ 正确
lv_font_conv --pixel-order LSB --no-compress -o font.c
```

### 应用场景

- **单色 OLED (SSD1306)**: 通常需要 LSB 格式
- **标准 TFT 显示器**: 通常使用 MSB 格式（默认）

---

## 功能 2: Glyph Bitmap 提取 (`--extract-glyph-bitmap`)

将字形 bitmap 数据分离到独立的二进制文件，适用于将字体存储在 flash 内存的嵌入式系统。

### 基本用法

```bash
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --extract-glyph-bitmap \
  -o my_font.c
```

生成两个文件：
- `my_font.c` - 字体元数据
- `my_font_glyph_bitmap.bin` - bitmap 数据

### 使用方法

在 C 代码中定义 flash 地址：

```c
// 定义 bitmap 数据在 flash 中的地址
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000

#include "my_font.c"

// 在 LVGL 中使用
lv_obj_t *label = lv_label_create(lv_scr_act());
lv_label_set_text(label, "Hello World");
lv_obj_set_style_text_font(label, &my_font, 0);
```

### 工作原理

**标准模式**（不使用 `--extract-glyph-bitmap`）：
```c
static const uint8_t glyph_bitmap[] = {
    0x00, 0x01, 0x02, ...  // 所有数据内联
};
```

**提取模式**（使用 `--extract-glyph-bitmap`）：
```c
#ifndef MY_FONT_GLYPH_BITMAP_BIN
#define MY_FONT_GLYPH_BITMAP_BIN 0
#warning "Please define MY_FONT_GLYPH_BITMAP_BIN"
#endif

static const uint8_t * const glyph_bitmap = 
    (const uint8_t *)MY_FONT_GLYPH_BITMAP_BIN;
```

### 嵌入式系统集成

**STM32 示例**：
```c
// 1. 链接脚本中定义 flash 区域
// MEMORY { FLASH_FONT (rx) : ORIGIN = 0x08100000, LENGTH = 64K }

// 2. 烧录二进制文件到指定地址

// 3. 使用字体
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000
#include "my_font.c"
```

**ESP32 示例**：
```c
// 1. 分区表中定义字体分区
// font, data, 0x40, 0x310000, 64K

// 2. 烧录: esptool.py write_flash 0x310000 my_font_glyph_bitmap.bin

// 3. 使用
#define MY_FONT_GLYPH_BITMAP_BIN 0x3F410000
#include "my_font.c"
```

### 优势

- **节省 RAM**: bitmap 数据通过内存映射访问 flash，不占用 RAM
- **灵活布局**: 可以将字体数据放在 flash 的任意位置
- **完全兼容**: 与标准 LVGL 字体行为完全相同

---

## 组合使用

两个功能可以同时使用：

```bash
# MSB + 提取（可以使用压缩）
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order MSB \
  --extract-glyph-bitmap \
  -o font.c

# LSB + 提取（必须禁用压缩）
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  --extract-glyph-bitmap \
  -o font.c
```

---

## 故障排除

### LSB 与压缩冲突

**错误**: `error: --pixel-order LSB requires --no-compress`

**解决**: 添加 `--no-compress` 参数

### 未定义宏警告

**警告**: `warning: "Please define MY_FONT_GLYPH_BITMAP_BIN"`

**解决**: 在包含字体前定义宏：
```c
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000
#include "my_font.c"
```

### 显示乱码

**可能原因**:
1. 二进制文件未烧录到正确地址
2. 宏定义地址与实际地址不匹配
3. 像素顺序与硬件不匹配

**解决**:
1. 验证烧录地址
2. 检查宏定义
3. 尝试切换 MSB/LSB

---

## 版本历史

- **v1.1** (2026-01-23): 修复 `--extract-glyph-bitmap` 与空字形的兼容性问题
- **v1.0**: 初始版本，添加像素顺序控制和 bitmap 提取功能

基于 lv_font_conv v1.5.3

## 参考资料

### 官方文档
- [LVGL 官方文档](https://docs.lvgl.io/)
- [LVGL 字体系统](https://docs.lvgl.io/master/overview/font.html)
- [lv_font_conv 原始仓库](https://github.com/lvgl/lvgl/tree/master/scripts/lv_font_conv)

### 开发参考
- [LVGL 字体解码器源码](https://github.com/lvgl/lvgl/blob/master/src/font/lv_font_fmt_txt.c) - 了解 LVGL 如何解析字体数据
- [字体格式规范](doc/font_spec.md) - Binary 格式详细说明

### 测试资源
开发测试使用 HarmonyOS.ttf 字体，可从 [HarmonyOS 官网](https://developer.harmonyos.com/cn/design/resource) 下载
