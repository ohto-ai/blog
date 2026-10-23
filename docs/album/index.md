---
hide:
  - navigation
  - toc
  - footer
comments: true
---
<link rel="stylesheet" type="text/css" href="cos-album/public/css/cos-album.css?v=1.1.6">
# COS Album
<!-- <style>
/* https://github.com/lonekorean/gist-syntax-themes */
@import url('https://cdn.jsdelivr.net/gh/lonekorean/gist-syntax-themes@b737b139/stylesheets/tomorrow-night.css');
</style> -->
  <div class="album-content">
  </div>

  <script type="text/javascript" src="cos-album/public/js/cos-album.js?v=1.1.6"></script>
  <script>
    function test_connect(url, on_success, on_fail)
    {
        if (window.navigator.onLine) {
            $.ajax({
                url: url,
                type: "GET",
                timeout: 1000,
                dataType: "xml",
            }).complete(function (XMLHttpRequest) {
                console.log(XMLHttpRequest);
                if (XMLHttpRequest.status == 200) {
                    on_success();
                } else {
                    on_fail();
                }
            });
        } 
        else {
            on_fail();
        }
    } 
    test_connect("https://album.ohtoai.top",
      () => {
          new CosAlbum({
              'xmlLink': 'https://album.ohtoai.top',
              'prependTo': '.album-content',
              'viewNum': 8,
              // 'copyUrl': '//album.ohtoai.top',
              'copyUrl': '//album-1255316209.cos.ap-shanghai.myqcloud.com',
              "album_regex": '.*'
          });
      },
      () => {
          new CosAlbum({
              'xmlLink': 'https://album-1255316209.cos.ap-shanghai.myqcloud.com',
              'prependTo': '.album-content',
              'viewNum': 8,
              // 'copyUrl': '//album.ohtoai.top',
              'copyUrl': '//album-1255316209.cos.ap-shanghai.myqcloud.com',
              "album_regex": '.*'
          })
      });

  </script>
    
  </body>
</html>