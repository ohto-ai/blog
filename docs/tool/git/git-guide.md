---
comments: true
hide:
  - toc
---
# Git Guide

<style>
.read_pro {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background-color: #000;
    z-index: 999;
}
.read_pro_inner {
    content: '';
    position: absolute;
    left: 0;
    height: 100%;
    background-color: #0089f2;
}
</style>
<div class="read_pro">
    <div class="read_pro_inner" id="read_pro_inner"></div>
</div>
[阅读原文](../git_guide/)  
> 进阶操作（rebase / reflog / bisect / worktree）见[Git 进阶](../git-advanced.md)。
<iframe id='inner-html' style='width:100%' src="../git_guide/" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"> </iframe>
<script>
    // expand content
    $(document).ready(function(){
        setInterval(()=>{
            $('#inner-html').css('height', $('#inner-html').prop('contentWindow').document.body.scrollHeight);
        }, 0);
    })
document.addEventListener('scroll', function(e) {
    var scrollTop = document.documentElement.scrollTop || document.body.scrollTop; // 已经读过被卷起来的文档部分
    var scrollHeight = document.documentElement.scrollHeight // 文档总高度
    var clientHeight = document.documentElement.clientHeight // 窗口可视高度
    document.getElementById('read_pro_inner').style.width = +(scrollTop/(scrollHeight-clientHeight)).toFixed(2)*100 + '%'
})
</script>