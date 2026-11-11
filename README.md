# 罗马意大利语 App

装在手机上用的意大利语学习 App（网页 App，也叫 PWA）：

- 罗马发音词典 15 册，共 2923 个词
- 考试写作范文 80 篇（A1 到 B2）

可以安装到手机桌面，离线使用。发音用的是手机自带的语音。

## 文件

| 位置 | 内容 |
|---|---|
| `docs/` | App 本身。发布到 GitHub Pages 的就是这个文件夹 |
| `docs/data/vocab.json` | 词典数据，每行一个词条：意大利语、中文、英文、例句、例句中文、例句英文、场景、变位（动词才有） |
| `docs/data/essays.json` | 范文数据 |
| `tools/build.js` | 检查数据，生成离线文件清单 `docs/sw.js` 和版本号 `docs/js/version.js` |
| `tools/icons.js` | 生成 `docs/icons/` 里的图标 |
| `tools/extract.js` | 一次性脚本：从旧的词典网页里提取数据（已经运行过，不需要再运行） |

## 修改内容以后

1. 修改 `docs/data` 里的数据，或者 `docs` 里的代码。
2. 运行 `node tools/build.js`。数据有问题时它会列出来，并且不生成新版本。
3. 在电脑上预览：运行 `python -m http.server 8765 --bind 127.0.0.1 --directory docs`，然后打开 http://127.0.0.1:8765/
4. 提交并推送以后，手机上的 App 下次联网打开时，顶部会提示“有新版本”。
