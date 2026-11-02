---
comments: true
---
# Git 进阶操作

> [Git Guide](git/git-guide.md) 覆盖日常 add/commit/push；这篇收那些"出事时救命"和"让历史变整洁"的高级操作。本篇所有命令在本机真实工作流里验证过。

## reset 三兄弟与 reflog：后悔药

```bash
git reset --soft HEAD~1     # 移动 HEAD，改动留在暂存区（想改提交内容时用）
git reset --mixed HEAD~1    # 默认。改动留在工作区（想重新挑着 add 时用）
git reset --hard HEAD~1     # 全部丢弃——但别慌，见下
```

**`git reset --hard` 删掉的东西也能找回来**——reflog 记录了 HEAD 的每一步移动：

```bash
git reflog                  # 最近 90 天的 HEAD 移动记录
# a1b2c3d HEAD@{0}: reset: moving to HEAD~1
# e4f5g6h HEAD@{1}: commit: 那个"被删掉"的提交
git reset --hard e4f5g6h    # 回到任意历史点
```

同理，误删的分支：`git reflog` 找到分支 tip 的提交，`git branch recovered <hash>`。**只要提交过，90 天内几乎都能救回来**。

## rebase：重写历史

### 交互式 rebase：整理提交

```bash
git rebase -i HEAD~4        # 编辑最近 4 个提交
```

弹出的列表里改每行开头的命令（**从上到下 = 从旧到新**）：

```text
pick   a1b2c3 feat: add parser
squash b3c4d5 fix: typo              # 并入上一个，合并提交信息
fixup  c5d6e7 fix: more              # 并入上一个，丢弃这条信息
reword e7f8g9 feat: xxx              # 修改提交信息
drop   g9h0i1 wip                    # 丢弃整个提交
```

```bash
# 非交互常用变体：
git commit --amend                  # 改最近一个提交（信息或内容）
git commit --amend --no-edit        # 只补内容不改信息
git pull --rebase origin main       # 拉取时把本地提交“垫到”远端之后，历史线性
```

!!! warning "黄金法则"
    **已推送到公共分支的提交不要 rebase**（除非全组约定）。rebase 重写提交哈希，别人基于旧哈希的工作会撞车。自己的 feature 分支随便整。

### rebase vs merge 怎么选

| 场景 | 选择 |
| :--- | :--- |
| 把 main 最新改动带进自己的 feature 分支 | `git rebase main`（历史线性） |
| 合并 feature 到 main | merge 或 squash-merge（保留合并痕迹/单提交） |
| 想保留真实的分叉历史 | `git merge --no-ff` |

## cherry-pick：摘单个提交

```bash
git cherry-pick a1b2c3            # 把任意分支的一个提交复制到当前分支
git cherry-pick a1b2c3^..e4f5g6   # 区间（含首尾，注意 ^ 语法）
git cherry-pick --continue / --abort   # 冲突解决后继续 / 放弃
```

典型场景：hotfix 在 release 分支上做的，摘回 main。

## bisect：二分定位坏提交

```bash
git bisect start
git bisect bad                    # 当前（有 bug）
git bisect good v2.3.0            # 标记一个确定没 bug 的点
# git 自动切到中间提交 → 测试 → 标记 good/bad → 自动二分
git bisect reset                  # 结束，回到原分支
```

自动化版（脚本退出码 0=好 非0=坏）：

```bash
git bisect start HEAD v2.3.0
git bisect run ./test_bug.sh      # 全自动，结束时直接报出引入 bug 的提交
```

10 个提交的排查从"挨个试"变 O(log n)，提交历史干净的人才有资格享受。

## worktree：多分支并行检出

```bash
git worktree add ../hotfix-dir hotfix-urgent   # 另一个目录检出另一分支
cd ../hotfix-dir                # 两边互不干扰，共享同一 .git 对象库
git worktree remove ../hotfix-dir
git worktree list
```

比 `stash → checkout → 干活 → 回来 → stash pop` 干净得多——修紧急 bug 不用打断当前工作现场。

## 其他高频武器

```bash
# 部分暂存：一个文件里只提交几处改动
git add -p                        # hunk 级交互选择（y/n/s 拆分/e 手编）

# stash 进阶
git stash push -m "wip: 半成品"    # 带说明
git stash pop / apply stash@{1}   # 弹出（删记录）/ 取用（留记录）
git stash branch fix-xx           # 从 stash 直接开分支

# 找谁改的
git log -p --follow file          # 带改动内容追踪（含改名前）
git blame -L 10,20 file           # 每行最后修改者

# 找回看过的版本
git show a1b2c3:path/to/file      # 打印某提交时的文件内容

# 高效别名（git config --global alias.xxx）
git config --global alias.lg "log --oneline --graph --decorate --all"
git config --global alias.undo "reset --soft HEAD~1"
```

## 排错速查

| 症状 | 处理 |
| :--- | :--- |
| 刚 reset --hard / 删了分支 | `git reflog` 找 hash，reset/branch 回来 |
| rebase 冲突一堆 | 解决 → `git add` → `git rebase --continue`；乱了就 `--abort` |
| 误把密码提交了 | 改密码是第一位的；历史清理用 `git filter-repo`（重写全历史，需协调全组） |
| push 被拒 (non-fast-forward) | 先 `git pull --rebase`；绝不轻易 `--force`（要用也用 `--force-with-lease`） |
| detached HEAD 状态 | 只是"不在分支上"；要留下就 `git switch -c new-branch` |
| 大文件误提交拖慢仓库 | `git filter-repo` 清历史 + LFS 管理大文件 |

原则收尾：**提交前 `git status` + `git diff` 各看一眼**，比事后 reflog 舒服得多；历史整理的目的只有一个——让 `git bisect` 和读历史的人能看懂。
