# picomatch 安全回补

这个本地开发依赖以 npm 官方发布的 picomatch 4.0.7 为基线，保留 MIT 许可证和原有入口。Vite、tinyglobby 和 fdir 都解析到这份代码。

唯一的运行时代码改动在 `lib/parse.js`。单分支重复通配符在简单路径段内只编译一层通配符匹配。含分隔符、复杂语法或特殊匹配选项的分支使用原解析器的字面量保护。该保护独立于 `maxExtglobRecursion` 开关。具体范围见 [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)。

官方源包为 [picomatch-4.0.7.tgz](https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz)，SHA-512 完整性为 `sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==`。

上游发布修复版后，用官方版本替换本地依赖，移除这份回补及对应的测试和补充审计步骤，再跑完整项目检查和依赖审计。
