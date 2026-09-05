# ck-pi-extension

Pi 插件 monorepo：一个 GitHub 仓库，多个彼此独立的 npm 包，用户只装自己需要的。

| 插件 | npm 包 | 说明 | 文档 |
| --- | --- | --- | --- |
| Pi Rail | `ck-pi-rail` | 无表情、自适应满宽状态栏 | [README](packages/pi-rail/README.md) |
| Pi Redkit | `ck-pi-redkit` | 授权交战条令注入（渗透/逆向） | [README](packages/pi-redkit/README.md) |

## 安装

按需单装，互不顺带：

```bash
pi install npm:ck-pi-rail     # 只要状态栏
pi install npm:ck-pi-redkit   # 只要条令注入
```

旧合集包 `ck-pi-extension` 已废弃（不再更新），新用户请装上面两个单包。
GitHub 源安装：`pi install git:github.com/1837620622/ck-pi-extension`（会同时拿到两个插件源码）。

冲突说明：`pi-rail` 不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui`
同时开，它们都会抢同一条页脚。

## 快速开始

```text
/statusline          状态栏设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）
/redkit status       查看条令注入状态
/redkit full         切换条令模式（full/pentest/reverse/off，即时生效）
```

## 更新日志

- `ck-pi-rail 0.1.0` / `ck-pi-redkit 0.1.0`：monorepo 拆分首发，各自独立版本与依赖
- 旧合集包 `ck-pi-extension 0.1.1`：自适应导轨、主题跟随、无表情、安全加固

## 作者

传康Kk（万能程序员）

- GitHub：[1837620622](https://github.com/1837620622)
- 邮箱：`1837620622@qq.com`
- 微信：`1837620622`

## License

MIT，见 [LICENSE](LICENSE)。
