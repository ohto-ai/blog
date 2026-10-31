/**
 * COS Album 初始化（兼容 Material instant navigation）
 *
 * 为什么不用页面内联脚本直接初始化：
 * instant navigation 重建脚本时，外部脚本（cos-album.js）异步加载、内联脚本
 * 同步执行且互不等待。原页面的 new CosAlbum 在 ajax 探测回调（异步）中调用，
 * 一旦探测（COS 国内 CDN，快）先于 cos-album.js（GitHub Pages，慢）返回，
 * 就会抛 "CosAlbum is not defined"，页面空白，只能刷新恢复。
 * 这里改为：显式动态加载 cos-album.js → 加载完成后再探测、初始化。
 * 同时用原生 XHR 替代 $.ajax，去掉对 jQuery 的依赖（少一个 CDN 故障点）。
 */
(function () {
  'use strict';

  var ALBUM_LIB = '/album/cos-album/public/js/cos-album.js?v=1.1.6';
  var ALBUM_MAIN = 'https://album.ohtoai.top';
  var ALBUM_FALLBACK = 'https://album-1255316209.cos.ap-shanghai.myqcloud.com';

  function probe(url) {
    return new Promise(function (resolve) {
      if (!window.navigator.onLine) return resolve(false);
      var xhr = new XMLHttpRequest();
      xhr.timeout = 2000;
      xhr.open('GET', url, true);
      xhr.onload = function () { resolve(xhr.status === 200); };
      xhr.onerror = function () { resolve(false); };
      xhr.ontimeout = function () { resolve(false); };
      try { xhr.send(); } catch (e) { resolve(false); }
    });
  }

  function initAlbum(xmlLink) {
    /* eslint-disable no-new */
    new CosAlbum({
      xmlLink: xmlLink,
      prependTo: '.album-content',
      viewNum: 8,
      copyUrl: '//album-1255316209.cos.ap-shanghai.myqcloud.com',
      album_regex: '.*'
    });
  }

  function boot() {
    var container = document.querySelector('.album-content');
    if (!container || container.dataset.albumReady) return;
    container.dataset.albumReady = '1';   // 防止重复初始化

    var start = function () {
      probe(ALBUM_MAIN)
        .then(function (ok) { initAlbum(ok ? ALBUM_MAIN : ALBUM_FALLBACK); })
        .catch(function () { initAlbum(ALBUM_FALLBACK); });
    };

    if (typeof CosAlbum !== 'undefined') {
      start();
    } else {
      var s = document.createElement('script');
      s.src = ALBUM_LIB;
      s.onload = start;
      s.onerror = function () {
        console.error('[album] failed to load ' + ALBUM_LIB);
      };
      document.head.appendChild(s);
    }
  }

  // document$ 是 Material instant loading 的页面切换事件流（含首次加载）
  if (typeof document$ !== 'undefined' && document$.subscribe) {
    document$.subscribe(boot);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})();
