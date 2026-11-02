# WPS 智能修订

把改写后的段落粘回 WPS，只给改动的字词留下修订。

用 AI 润色文章，或把别处改好的段落贴回原稿时，普通粘贴容易留下一整段删除、一整段新增。智能修订会先对齐新旧文字，保留没变的部分，让审稿人直接看到改了哪里。

[下载安装包](https://github.com/EnterSuper/wps-smart-revision/releases/tag/v1.3.0) · [快捷键教程](docs/SHORTCUTS.md) · [反馈问题](https://github.com/EnterSuper/wps-smart-revision/issues)

![同一段文字的原文、改写和字词修订对照](docs/media/revision-example.png)

*效果示意：使用插件的实际对齐算法生成。WPS 中的修订颜色和显示方式跟随你的审阅设置。*

## 怎么用

**复制新段落 → 选中原文 → 智能粘贴。**

![复制改写、选中原文、智能粘贴的三步操作示意](docs/media/smart-paste.gif)

在 WPS 顶部的“智能修订”中，选 **含格式智能粘贴**。从 WPS 复制的加粗、斜体、高亮等常用格式也会带过来；想沿用原稿格式，就选 **仅文字粘贴**。

生成的是 WPS 原生修订，可以照常接受、拒绝。`⌘Z` / `Ctrl+Z` 撤销整次粘贴，`⌘S` / `Ctrl+S` 保存文档。

## 安装

从 [发布页](https://github.com/EnterSuper/wps-smart-revision/releases/tag/v1.3.0) 下载对应系统的 ZIP，完整解压。安装前保存文档并退出 WPS，安装后重新打开。

| 系统 | 安装方法 |
| --- | --- |
| **macOS** | 运行 `安装或更新.command`，需要 Python 3。快捷键程序已包含 Intel 和 Apple Silicon 两种架构。 |
| **Windows 11** | 运行 `install-windows.cmd`，然后点击 **智能修订 → Windows 自检**。包内有中文部署教程，无需安装 Python 或 Node.js。 |

Mac 已完成 WPS 实测；Windows 安装与编译检查已通过，WPS 操作尚待实机验证。当前版本为 v1.3.0 预发布。

## 用快捷键粘贴

| 操作 | Mac | Windows |
| --- | --- | --- |
| 含格式智能粘贴 | Control + Option + Command + V | Ctrl + Alt + Shift + V |
| 仅文字粘贴 | Control + Option + Shift + Command + V | Ctrl + Alt + Shift + B |

先在工具栏点击 **开启快捷键**。Mac 还需打开解压目录中的 `shortcuts/SmartRevisionKeys.app`；Windows 由按钮启动托盘程序。

快捷键只在 WPS 前台启用。菜单中可以切换备用组合、暂停或退出，普通粘贴照常使用。详见 [快捷键教程](docs/SHORTCUTS.md)。

## 适合什么场景

论文润色、报告修改、审稿返修：一次选中一段普通正文，把改写后的内容贴回去。中文按字、英文按词对齐；文字和常用格式的变化都可以在 WPS 中审阅。

表格、公式、脚注等复杂结构暂不处理，具体格式见 [支持范围](docs/COMPATIBILITY.md)。AI 回复中的 `**加粗**` 是 Markdown 文本，复制时需要实际富文本格式才能带入加粗。

整个过程在本机完成，不需要 AI 账号或 API Key，正文不会上传，也不会额外生成文档历史。

## 开发与贡献

```sh
npm ci
npm test
```

目前有 103 项离线测试和 9 项安装事务测试，GitHub Actions 检查 Mac 和 Windows 构建。[测试记录](docs/TESTING.md) 中列出了 WPS 实测情况。

欢迎提交问题和改进。复现问题时请用简短的示例段落，见 [贡献指南](CONTRIBUTING.md)。如果你在寻找 Word 或其他粘贴工具，可以看看 [相关项目](docs/RELATED_TOOLS.md)。

## License

[MIT](LICENSE)。差异计算使用 jsdiff，附有其 [MIT 许可证](vendor/LICENSE-jsdiff)。
