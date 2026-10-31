// 页脚年份自动更新（兼容 Material instant navigation）
// mkdocs.yml 的 copyright 里不要写 <script>document.write(...)：
// instant navigation 切页时内联脚本会重新执行，而页面加载完成后
// document.write 会清空整个文档，表现为点击标题后页面只剩一个年份。
(function () {
  function updateYear() {
    var el = document.getElementById('ohtoai-copyright-year');
    if (el) {
      el.textContent = new Date().getFullYear();
    }
  }

  // document$ 是 Material instant loading 提供的页面切换事件流，
  // 每次导航（含首次加载）都会触发订阅回调
  if (typeof document$ !== 'undefined' && document$.subscribe) {
    document$.subscribe(updateYear);
  } else {
    // 无 instant loading 时的兜底
    updateYear();
  }
})();
