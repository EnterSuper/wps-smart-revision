# 类似工具与定位

检索日期：2026-11-02。以下是相关项目，不是穷尽性清单，也不代表项目之间存在合作关系。

| 项目 | 与本项目的关系 |
| --- | --- |
| [office-word-diff](https://github.com/yuch85/office-word-diff) | 最接近：通过 Office.js 将改写拆成 Microsoft Word 的细粒度原生修订。运行宿主和 API 与 WPS JS 加载项不同。 |
| [docx-mcp](https://github.com/SecurityRonin/docx-mcp) | 提供 DOCX 读写、修订和结构校验的 MCP 服务；使用方式与 WPS 内选区智能粘贴不同。 |
| [SmartPaste](https://github.com/hopenmind/SmartPaste) | Windows 剪贴板格式转换与粘贴工具，支持富文本等格式；项目描述未将原生字词对齐修订列为核心能力。 |

本项目专注于 **WPS 文字中，把一个改写段落对齐到选区，产生可接受、拒绝和撤销的原生文字及部分格式修订**。不需要 AI 服务，不生成整篇文档的历史存档。

本次检索未发现完全相同定位且已确认兼容 Mac 和 Windows WPS 的开源项目；这不是“市面上没有同类工具”的断言。上表仅作为选型参考，本项目未复制这些项目的实现。所用差异算法依赖为随附许可证的 jsdiff。
