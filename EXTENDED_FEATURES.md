# lv_font_conv 扩展功能文档

本文档说明此 fork 版本相对于原始 [lv_font_conv](https://github.com/lvgl/lv_font_conv) 新增的扩展功能。

## 快速开始

同时启用两个扩展功能的完整示例：

**Linux/macOS (Bash):**
```sh
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

**Windows (CMD):**
```cmd
lv_font_conv --font Roboto-Regular.ttf ^
  --range 0x20-0x7F ^
  --size 16 ^
  --format lvgl ^
  --bpp 4 ^
  --pixel-order LSB ^
  --no-compress ^
  --extract-glyph-bitmap ^
  --output my_font.c
```

**Windows (PowerShell):**
```powershell
lv_font_conv --font Roboto-Regular.ttf `
  --range 0x20-0x7F `
  --size 16 `
  --format lvgl `
  --bpp 4 `
  --pixel-order LSB `
  --no-compress `
  --extract-glyph-bitmap `
  --output my_font.c
```

**单行命令（所有平台）:**
```sh
lv_font_conv --font Roboto-Regular.ttf --range 0x20-0x7F --size 16 --format lvgl --bpp 4 --pixel-order LSB --no-compress --extract-glyph-bitmap --output my_font.c
```

这将生成：
- `my_font.c` - 包含字体元数据和宏引用的 C 文件
- `my_font_glyph_bitmap.bin` - 包含 LSB 格式像素数据的二进制文件

使用方法：
```c
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000  // 定义 flash 地址
#include "my_font.c"
```

---

## 目录

- [像素顺序控制 (Pixel Order Control)](#像素顺序控制-pixel-order-control)
- [Glyph Bitmap 提取 (Glyph Bitmap Extraction)](#glyph-bitmap-提取-glyph-bitmap-extraction)
- [组合使用两个功能](#组合使用两个功能)

---

## 像素顺序控制 (Pixel Order Control)

### 功能概述

`--pixel-order` 选项允许控制字节内像素位的排列方式（MSB 或 LSB），以匹配不同显示硬件的像素格式要求。

### 使用场景

某些显示控制器期望特定的像素位顺序：
- **MSB (Most Significant Bit)**: 最高有效位代表字节中最左侧的像素（默认）
- **LSB (Least Significant Bit)**: 最低有效位代表字节中最左侧的像素

### 基本用法

**Linux/macOS:**
```sh
# 使用 MSB 排序（默认）
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order MSB \
  -o my_font.c

# 使用 LSB 排序
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  -o my_font.c
```

**Windows (CMD):**
```cmd
REM 使用 MSB 排序（默认）
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F ^
  --size 16 --format lvgl --bpp 4 ^
  --pixel-order MSB ^
  -o my_font.c

REM 使用 LSB 排序
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F ^
  --size 16 --format lvgl --bpp 4 ^
  --pixel-order LSB ^
  --no-compress ^
  -o my_font.c
```

### 像素排序说明

不同 BPP 下的像素打包方式：

#### 1 BPP (8 像素/字节)
```
像素序列: [p7, p6, p5, p4, p3, p2, p1, p0]

MSB: p7p6p5p4p3p2p1p0 (最左侧像素在最高位)
LSB: p0p1p2p3p4p5p6p7 (最左侧像素在最低位)
```

#### 2 BPP (4 像素/字节)
```
像素序列: [p3, p2, p1, p0]

MSB: p3p3 p2p2 p1p1 p0p0
LSB: p0p0 p1p1 p2p2 p3p3
```

#### 4 BPP (2 像素/字节)
```
像素序列: [p1, p0]

MSB: p1p1p1p1 p0p0p0p0
LSB: p0p0p0p0 p1p1p1p1
```

#### 8 BPP (1 像素/字节)
```
无需重排序，每个像素占用完整字节
```

### 重要限制

⚠️ **LSB 像素排序与压缩模式不兼容**

```sh
# ❌ 错误：LSB 不能与压缩同时使用
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  -o font.c

# ✅ 正确：LSB 必须配合 --no-compress
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  -o font.c

# ✅ 正确：MSB 可以使用压缩
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order MSB \
  -o font.c
```

### 应用场景示例

#### 场景 1: 单色 OLED 显示器 (SSD1306)

某些 OLED 控制器期望 LSB 格式：

```sh
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 12 --format lvgl --bpp 1 \
  --pixel-order LSB \
  --no-compress \
  -o oled_font.c
```

#### 场景 2: 标准 TFT 显示器

大多数 TFT 显示器使用 MSB 格式（默认）：

```sh
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order MSB \
  -o tft_font.c
```

---

## Glyph Bitmap 提取 (Glyph Bitmap Extraction)

### 功能概述

`--extract-glyph-bitmap` 选项将字形 bitmap 数据分离到独立的二进制文件中，适用于将字体数据存储在 flash 内存并通过内存映射地址访问的嵌入式系统。

### 使用场景

在资源受限的嵌入式系统中，将大型字体数据存储在 flash 内存（而非 RAM）中是常见做法。使用此功能，你可以：

1. 将包含字形 bitmap 的二进制文件存储在 flash 内存的已知地址
2. 通过宏在 C 代码中引用该 flash 地址
3. 将字体元数据（字符映射、kerning 表）保留在 C 源文件中

这种方法在保持完整 LVGL 字体兼容性的同时减少了 RAM 使用。

### 基本用法

#### 生成带提取 bitmap 的字体

**Linux/macOS:**
```sh
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --extract-glyph-bitmap \
  -o my_font.c
```

**Windows (CMD):**
```cmd
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F ^
  --size 16 --format lvgl --bpp 4 ^
  --extract-glyph-bitmap ^
  -o my_font.c
```

这将创建两个文件：
- `my_font.c` - LVGL 字体结构，包含元数据和对 bitmap 数据的宏引用
- `my_font_glyph_bitmap.bin` - 包含所有字形 bitmap 数据的二进制文件

#### 定义 Flash 地址

生成的 C 文件包含一个宏，你必须定义它以指向加载二进制文件的 flash 内存地址：

```c
// 在包含字体之前定义 flash 地址
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000

#include "my_font.c"
```

如果不定义该宏，编译器将发出警告并默认使用地址 `0`，这可能导致运行时错误。

### 工作原理

#### 标准模式（不使用 `--extract-glyph-bitmap`）

```c
static const uint8_t glyph_bitmap[] = {
    0x00, 0x01, 0x02, 0x03, ...  // 所有 bitmap 数据内联
};
```

#### 提取模式（使用 `--extract-glyph-bitmap`）

```c
#ifndef MY_FONT_GLYPH_BITMAP_BIN
#define MY_FONT_GLYPH_BITMAP_BIN 0
#warning "Please define MY_FONT_GLYPH_BITMAP_BIN to the flash memory address"
#endif

static const uint8_t * const glyph_bitmap = (const uint8_t *)MY_FONT_GLYPH_BITMAP_BIN;
```

二进制文件（`my_font_glyph_bitmap.bin`）包含与内联数组中相同的字节序列，确保与 LVGL 字体渲染引擎完全兼容。

### 高级用法

#### 多字体处理

处理多个字体时，每个字体会生成独立的二进制文件：

```sh
# 生成两个字体
lv_font_conv --font Font1.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --extract-glyph-bitmap \
  -o font1.c

lv_font_conv --font Font2.ttf -r 0x20-0x7F \
  --size 24 --format lvgl --bpp 4 \
  --extract-glyph-bitmap \
  -o font2.c
```

输出文件：
- `font1.c` + `font1_glyph_bitmap.bin`
- `font2.c` + `font2_glyph_bitmap.bin`

#### 与压缩配合使用

提取功能与 RLE 压缩完全兼容：

```sh
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --extract-glyph-bitmap \
  -o my_font.c
# 默认启用压缩，二进制文件将包含压缩后的数据
```

#### 自定义对齐

使用 `--align` 参数控制 glyph 数据对齐：

```sh
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --align 4 \
  --extract-glyph-bitmap \
  -o my_font.c
# 每个 glyph 的起始地址将按 4 字节对齐
```

### 嵌入式系统集成示例

#### STM32 示例

```c
// 1. 在链接脚本中定义 flash 区域
// MEMORY
// {
//   FLASH_FONT (rx) : ORIGIN = 0x08100000, LENGTH = 64K
// }

// 2. 将二进制文件烧录到指定地址
// 使用 STM32CubeProgrammer 或其他工具

// 3. 在代码中使用字体
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000
#include "my_font.c"

// 4. 在 LVGL 中使用
lv_obj_t *label = lv_label_create(lv_scr_act());
lv_label_set_text(label, "Hello World");
lv_obj_set_style_text_font(label, &my_font, 0);
```

#### ESP32 示例

```c
// 1. 在分区表中定义字体分区
// # Name,   Type, SubType, Offset,  Size
// font,     data, 0x40,    0x310000, 64K

// 2. 烧录二进制文件到分区
// esptool.py write_flash 0x310000 my_font_glyph_bitmap.bin

// 3. 在代码中使用
#define MY_FONT_GLYPH_BITMAP_BIN 0x3F410000  // 映射后的地址
#include "my_font.c"
```

### 重要限制

#### Glyph Bitmap 提取限制

- **仅支持 LVGL 格式**：此功能仅在 `--format lvgl` 时可用
- **地址必须正确**：二进制文件必须放置在指定的 flash 地址，否则会导致运行时错误
- **内存映射**：目标系统必须支持 flash 内存映射访问

#### 数据一致性保证

- 二进制文件使用与标准格式相同的字节序、对齐和压缩设置
- 所有字体元数据（字符映射、kerning、度量）保留在 C 文件中
- 提取模式和标准模式生成的字体在 LVGL 中行为完全相同

#### 文件命名规则

- C 文件：用户指定的输出文件名（如 `my_font.c`）
- 二进制文件：自动生成为 `{basename}_glyph_bitmap.bin`（如 `my_font_glyph_bitmap.bin`）
- 宏名称：自动生成为 `{BASENAME}_GLYPH_BITMAP_BIN`（如 `MY_FONT_GLYPH_BITMAP_BIN`）

---

## 组合使用两个功能

两个扩展功能可以同时使用：

**Linux/macOS:**
```sh
# 同时使用像素顺序控制和 bitmap 提取
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order MSB \
  --extract-glyph-bitmap \
  -o my_font.c
```

**Windows (CMD):**
```cmd
REM 同时使用像素顺序控制和 bitmap 提取
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F ^
  --size 16 --format lvgl --bpp 4 ^
  --pixel-order MSB ^
  --extract-glyph-bitmap ^
  -o my_font.c
```

**注意**：如果使用 LSB 像素顺序，必须添加 `--no-compress`：

**Linux/macOS:**
```sh
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  --extract-glyph-bitmap \
  -o my_font.c
```

**Windows (CMD):**
```cmd
lv_font_conv --font Roboto-Regular.ttf -r 0x20-0x7F ^
  --size 16 --format lvgl --bpp 4 ^
  --pixel-order LSB ^
  --no-compress ^
  --extract-glyph-bitmap ^
  -o my_font.c
```

---

## 故障排除

### 像素顺序相关问题

#### 问题：LSB 与压缩冲突

**错误信息**：
```
error: --pixel-order LSB requires --no-compress
```

**解决方案**：
添加 `--no-compress` 参数：
```sh
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --pixel-order LSB \
  --no-compress \
  -o font.c
```

#### 问题：显示效果异常

**可能原因**：
像素顺序与显示硬件不匹配

**解决方案**：
1. 查阅显示控制器数据手册，确认期望的像素顺序
2. 尝试切换 MSB/LSB 设置
3. 使用 `--format dump` 生成 PNG 图像验证像素排列

### Glyph Bitmap 提取相关问题

#### 问题：编译警告 - 未定义宏

**警告信息**：
```
warning: "Please define MY_FONT_GLYPH_BITMAP_BIN to the flash memory address"
```

**解决方案**：
在包含字体文件之前定义宏：
```c
#define MY_FONT_GLYPH_BITMAP_BIN 0x08100000
#include "my_font.c"
```

#### 问题：运行时显示乱码

**可能原因**：
1. 二进制文件未烧录到正确的 flash 地址
2. 宏定义的地址与实际烧录地址不匹配
3. 内存映射配置错误

**解决方案**：
1. 验证二进制文件已正确烧录到 flash
2. 确认宏定义的地址与烧录地址一致
3. 检查 MCU 的内存映射配置

#### 问题：格式不兼容错误

**错误信息**：
```
error: --extract-glyph-bitmap is only supported with --format lvgl
```

**解决方案**：
确保使用 `--format lvgl`：
```sh
lv_font_conv --font font.ttf -r 0x20-0x7F \
  --size 16 --format lvgl --bpp 4 \
  --extract-glyph-bitmap \
  -o my_font.c
```

---

## 性能考虑

### RAM 使用

- **标准模式**：所有字体数据（包括 bitmap）占用 RAM 或 ROM
- **提取模式**：仅元数据占用 RAM/ROM，bitmap 数据通过内存映射访问 flash

### Flash 使用

两种模式的 flash 使用量相同，但提取模式允许更灵活的内存布局。

### 访问速度

- 内存映射的 flash 访问速度通常比 RAM 慢
- 对于大多数嵌入式 GUI 应用，性能差异可忽略
- 如果需要最高性能，可以考虑将热点字体保留在 RAM 中

### 像素顺序性能

像素顺序处理在字体生成时完成，对运行时性能无影响。

---

## 技术细节

### 二进制文件格式

二进制文件是所有 glyph bitmap 数据的简单串联：

```
+------------------+
| Glyph 1 bitmap   |
+------------------+
| Glyph 2 bitmap   |
+------------------+
| ...              |
+------------------+
| Glyph N bitmap   |
+------------------+
```

每个 glyph 的偏移量存储在 C 文件的 `glyph_dsc` 数组中。

### 与 LVGL 的兼容性

这些扩展功能生成的字体结构与标准 LVGL 字体完全兼容：
- 使用相同的 `lv_font_fmt_txt_glyph_dsc_t` 结构
- 使用相同的 `lv_font_t` 接口
- 支持所有 LVGL 字体特性（kerning、子像素渲染等）

### 实现架构

#### 像素顺序控制

采用字节级后处理方式：
1. 原有像素打包逻辑完成后
2. 对生成的字节进行位重排序
3. 不影响其他功能（stride、padding 等）

#### Glyph Bitmap 提取

在字体生成过程中直接输出：
1. `LvGlyf.lv_compile()` 生成所有 glyph 的 Buffer 数据
2. 直接使用这些数据生成二进制文件
3. 保证字节序、对齐、压缩设置的完全一致性

---

## 参考资料

- [LVGL 官方文档](https://docs.lvgl.io/)
- [lv_font_conv 原始仓库](https://github.com/lvgl/lv_font_conv)
- [字体格式规范](doc/font_spec.md)

## 版本历史

- **v1.0**：
  - 添加像素顺序控制功能（`--pixel-order`）
  - 添加 Glyph Bitmap 提取功能（`--extract-glyph-bitmap`）
- 基于 lv_font_conv v1.5.3

## 许可证

本扩展功能遵循与原始 lv_font_conv 相同的许可证。
