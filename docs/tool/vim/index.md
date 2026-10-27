---
comments: true
---
# Vim 速查

> 模式是 Vim 的一切：**记住当前处于什么模式，就永远不会迷路**。先跑一遍 `vimtutor`（终端里直接敲），再回来看这份速查效率最高。

## 模式切换

```text
          i/a/o（进入插入）
  ┌──────────────────►┐
Normal（默认）          Insert
  │  ◄─────── Esc ─────────┘
  │
  ├─ v / V / Ctrl-v ──► Visual（字符 / 行 / 块选）
  ├─ : ──────────────► 命令行（:w :q :s ...）
  └─ / ? ────────────► 搜索
```

任何时刻按 `Esc` 回到 Normal。迷路了就多按几下 `Esc`。

## 移动

| 按键 | 作用 | 按键 | 作用 |
| :--- | :--- | :--- | :--- |
| `h j k l` | 左 下 上 右 | `w` / `b` / `e` | 下一词头 / 上一词头 / 词尾 |
| `0` / `^` / `$` | 行首 / 首个非空 / 行尾 | `gg` / `G` / `数字G` | 文件头 / 文件尾 / 第 n 行 |
| `f<char>` / `t<char>` | 行内找字符（停在/停在它前面） | `;` `,` | 重复 / 反向重复 |
| `%` | 跳到匹配的括号 | `Ctrl-d` / `Ctrl-u` | 半屏翻页 |
| `*` / `#` | 向下 / 向上搜当前词 | `{` `}` | 上 / 下一段落 |
| `gd` / `gD` | 跳到局部 / 全局定义 | `Ctrl-o` / `Ctrl-i` | 跳转回退 / 前进 |

**数字 × 动作 = 重复**：`3w` 往前三个词、`5j` 下移五行、`d2w` 删两个词。

## 编辑：动词 + 名词

Normal 模式命令的语感是 `操作符 + 范围`：

| 操作符 | 含义 | 常用组合 | 效果 |
| :--- | :--- | :--- | :--- |
| `d` | 删除 | `dd` / `dw` / `d$` / `diw` | 删行 / 删词 / 删到行尾 / 删整个词 |
| `c` | 删除并进入插入 | `cc` / `ciw` / `ci"` | 改行 / 改词 / 改引号内内容 |
| `y` | 复制（yank） | `yy` / `yw` / `yiw` | 复制行 / 词 |
| `p` / `P` | 粘贴到后 / 前 | | `xp` 交换两个字符 |
| `x` | 删字符 | `r<char>` | 替换单个字符 |
| `u` / `Ctrl-r` | 撤销 / 重做 | | |
| `.` | **重复上一条修改** | | Vim 的灵魂，能少打一半字 |
| `>>` / `<<` | 缩进 / 反缩进 | | 配 Visual 模式批量缩进 |

`i`（光标前） `a`（光标后） `I`（行首） `A`（行尾） `o`（下方新行） `O`（上方新行） 进插入模式。

`ci"` / `ci(` / `ci{` / `ci[` 这类 **text object** 是效率分水岭：光标在字符串任意位置，`ci"` 直接改整个引号内内容，`di(` 删整个括号内。

## 搜索与替换

```vim
/pattern        向下搜索（? 向上）；n / N 下一个 / 上一个
:noh            清除搜索高亮
*               搜光标下的词（配 n 跳转）

:s/old/new/     当前行替换第一处
:s/old/new/g    当前行全部替换
:%s/old/new/g   全文替换
:%s/old/new/gc  全文替换，逐处确认（y/n/a/q）

:'<,'>s/old/new/g   只替换选区（Visual 选中后按 : 自动出现 '<,'>）

:g/pattern/d    删除所有匹配行；:g!/pattern/d 留匹配行
```

## 窗口、标签页、buffer

```vim
:vs 文件        左右分屏打开；:sp 上下分屏
Ctrl-w h/j/k/l  在窗口间移动；Ctrl-w w 循环
Ctrl-w =        均分窗口大小
:only           关闭其他窗口

:tabnew 文件    新标签页；gt / gT 切换标签
:ls             列出 buffer；:b 数字/名字 跳转
:e 文件         打开文件；:Ex 文件树浏览
```

## marks 与宏

```vim
ma              标记 a；`a 跳到标记处，'a 跳到标记行行首
`.              上次修改的位置；`` 上次跳转前的位置

qa              开始录制宏到寄存器 a ... q 结束
@a              回放；5@a 回放 5 次；@@ 重复上一次回放
                批量改 N 行：先在第一行录好，:normal! @a 应用到选中行
```

## .vimrc 最小配置

```vim
" 基础体验
set nocompatible
syntax on
set number                  " 行号
set relativenumber          " 相对行号（5j 这种动作一目了然）
set hlsearch incsearch      " 高亮搜索 + 边输边搜
set ignorecase smartcase    " 小写忽略大小写，含大写则精确
set showcmd ruler

" 缩进
set tabstop=4 shiftwidth=4
set expandtab               " Tab 展开为空格（Go 等项目除外）
set autoindent smartindent

" 其他
set backspace=indent,eol,start
set scrolloff=5             " 光标上下留 5 行视野
set mouse=a                 " 允许鼠标
set encoding=utf-8

" 恢复光标位置
autocmd BufReadPost * if line("'\"") > 1 && line("'\"") <= line("$") | execute 'normal! g`"' | endif
```

插件生态（想深入再折腾）：[vim-plug](https://github.com/junegunn/vim-plug) 管理器 + fzf（模糊搜索文件）、NERDTree / netrw（文件树）、coc.nvim 或原生 LSP（补全跳转）、vim-commentary（注释）。模组的现代发行版可看 Neovim + lazy.nvim。

## 练习建议

1. `vimtutor` 完整过一遍（30 分钟，中文版：`vimtutor zh`）；
2. 强迫自己**一周内用 Vim 写完所有代码**（VS Code 里装 Vim 插件也算）；
3. 每次发现手在重复劳动，去查"有没有更好的动作"——`ciw`、`f;`、`.`、宏就是一步一步攒出来的；
4. 日常速查回这页就够了；深入读 `:help user-manual` 或《Practical Vim》。
