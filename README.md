# Fragments Convert POC

这是一个独立的 Node.js POC 项目，用于验证：

```text
IFC -> @thatopen/fragments
```

它不依赖 `xeokit`、`xeokit-convert`、`XKT`，用于单独评估 Fragments 转换时间和输出体积。

## 安装依赖

```bat
cd /d E:\xeokit-bim-viewer\fragments-convert-poc
npm install
```

## 小模型测试

```bat
npm run convert -- ..\app\data\projects\RevitSamples\models\Building-Architecture\source.ifc output\Building-Architecture.frag
```

## 108MB 大模型测试

```bat
npm run convert:8g -- ..\app\data\projects\RevitSamples\models\20210219Architecture\source.ifc output\20210219Architecture.frag
```

如果 8GB 不够，可以用：

```bat
npm run convert:16g -- ..\app\data\projects\RevitSamples\models\20210219Architecture\source.ifc output\20210219Architecture.frag
```

## 对比完整读入内存模式

默认使用 `readCallback` 流式读取 IFC。若要测试一次性读入内存：

```bat
npm run convert:8g -- ..\app\data\projects\RevitSamples\models\20210219Architecture\source.ifc output\20210219Architecture.bytes.frag --bytes
```

## 完整属性转换测试

默认转换更快、文件更小，但属性和关系可能不完整。要验证完整 BIM 属性，可以使用：

```bat
npm run convert:full -- ..\app\data\projects\RevitSamples\models\Building-Architecture\source.ifc output\Building-Architecture.full.frag
```

大模型建议使用：

```bat
npm run convert:full:8g -- ..\app\data\projects\RevitSamples\models\20210219Architecture\source.ifc output\20210219Architecture.full.frag
```

`convert:full` 会启用：

```js
importer.addAllAttributes()
importer.addAllRelations()
```

这能用于验证 T003 属性完整度，但可能增加转换时间和 `.frag` 文件体积。

## T003 / T004 验证

当前已提供专门验证脚本：

```bat
npm run validate:t003-t004 -- ..\app\data\projects\RevitSamples\models\Building-Architecture\source.ifc
```

大模型建议使用：

```bat
npm run validate:t003-t004:8g -- ..\app\data\projects\RevitSamples\models\20210219Architecture\source.ifc -- --sample-size=500
```

验证内容：

```text
T003：默认转换 vs 完整属性转换，比较 Name / Description / ObjectType / PredefinedType / PSet / Relation 等属性完整度。
T004：同一个 IFC 用相同参数重复转换两次，比较 GlobalId、localId、空间树签名是否一致。
```

输出位置：

```text
output\validation\<模型名>-<时间戳>\t003-t004-report.md
output\validation\<模型名>-<时间戳>\t003-t004-report.json
```

如果也想验证完整属性模式重复转换后的 ID 稳定性，可以加：

```bat
npm run validate:t003-t004:8g -- ..\app\data\projects\RevitSamples\models\20210219Architecture\source.ifc -- --sample-size=500 --full-stability
```

## 重点看日志

```text
Fragments conversion done
seconds
outputSizeMB
compressionRatio
memory
```

如果转换失败或卡住，把最后几行日志贴出来继续分析。

## 启动 Fragments 前端查看页

```bat
cd /d E:\xeokit-bim-viewer\fragments-convert-poc
npm run serve
```

访问：

```text
http://127.0.0.1:5175/viewer/index.html
```

移动端独立页面：

```text
http://127.0.0.1:5175/viewer/mobile.html
```

## 局域网手机访问移动端页面

如果需要在同一个局域网下用手机访问，使用：

```bat
cd /d E:\xeokit-bim-viewer\fragments-convert-poc
npm run serve:lan
```

启动后终端会打印类似地址：

```text
LAN mobile URLs:
  http://192.168.1.23:5175/viewer/mobile.html
```

手机和电脑需要连接同一个 Wi-Fi，然后在手机浏览器打开打印出来的 `http://<电脑局域网IP>:5175/viewer/mobile.html`。

如果手机无法访问，优先检查：

```text
1. Windows 防火墙是否允许 Node.js 访问专用网络。
2. 手机和电脑是否在同一个局域网。
3. 路由器是否开启了 AP 隔离 / 访客网络隔离。
4. 端口 5175 是否被其它程序占用。
```

移动端页面和 PC 页面分离，入口文件为：

```text
viewer/mobile.html
viewer/mobile.css
viewer/mobile-main.js
```

页面支持两种加载方式：

```text
1. 选择本地 .frag 文件
2. 输入项目内 .frag 路径，例如 output/Building-Architecture.frag
```

如果前面已经生成：

```text
output\Building-Architecture.frag
```

页面默认路径可以直接改为：

```text
../output/Building-Architecture.frag
```
