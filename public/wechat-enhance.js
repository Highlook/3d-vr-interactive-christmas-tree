/* 分享增强层：微信内提示 + 手机端手势按钮（复用原页面已有的键盘事件，不改动任何渲染逻辑） */
(function () {
  if (window.__xmShareEnhance) return;
  window.__xmShareEnhance = true;

  var ua = navigator.userAgent || "";
  var isWeChat = /MicroMessenger/i.test(ua);
  var isIOS = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  var isTouch = isIOS || /Android|HarmonyOS|Mobile/i.test(ua) || (navigator.maxTouchPoints || 0) > 1;

  function press(key) {
    try {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: key, bubbles: true, cancelable: true })
      );
    } catch (e) {
      /* 老内核忽略即可 */
    }
  }

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function toast(text, ms) {
    var t = el('<div class="xm-toast"></div>');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 320);
    }, ms || 2200);
  }

  /* ------------------ 微信内提示 ------------------ */
  function wechatTip() {
    var pill = el(
      '<button class="xm-wx-pill" type="button">微信内可能用不了摄像头 · <b>点这里换浏览器</b><span class="xm-arrow">›</span></button>'
    );
    pill.addEventListener("click", function () {
      var steps = isIOS
        ? '<li>点右上角 <b>···</b> 按钮</li><li>选择 <b>在 Safari 中打开</b></li><li>在 Safari 里允许摄像头，手势识别即生效</li>'
        : '<li>点右上角 <b>···</b> 按钮</li><li>选择 <b>在浏览器打开</b></li><li>在浏览器里允许摄像头，手势识别即生效</li>';
      var mask = el(
        '<div class="xm-sheet-mask"><div class="xm-sheet">' +
          '<div class="xm-eyebrow">A LITTLE WONDER · 微信分享版</div>' +
          "<h3>换到系统浏览器，解锁全部功能</h3>" +
          "微信内置浏览器不保证摄像头与 3D 渲染权限。用系统浏览器打开同一个链接，手势识别、数字粒子、" +
          "「圣诞快乐 / 天天开心」文字和拖动旋转都能正常使用。" +
          "<ol>" + steps + "</ol>" +
          '<div class="xm-actions">' +
          '<button class="xm-btn primary" type="button" data-copy>复制链接</button>' +
          '<button class="xm-btn" type="button" data-close>就在微信里看</button>' +
          "</div></div></div>"
      );
      document.body.appendChild(mask);
      mask.querySelector("[data-close]").addEventListener("click", function () { mask.remove(); });
      mask.querySelector("[data-copy]").addEventListener("click", function () {
        copyUrl(function (ok) {
          toast(ok ? "链接已复制，去浏览器粘贴打开" : "复制失败，请长按页面地址手动复制", 2600);
        });
      });
      mask.addEventListener("click", function (e) { if (e.target === mask) mask.remove(); });
    });
    document.body.appendChild(pill);
    setTimeout(function () {
      if (pill.parentNode) {
        pill.style.transition = "opacity .4s, transform .4s";
        pill.style.opacity = "0";
        pill.style.transform = "translateX(-50%) translateY(-8px)";
        setTimeout(function () { pill.remove(); }, 420);
      }
    }, 11000);
  }

  function copyUrl(cb) {
    var url = location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { cb(true); }, function () { legacy(); });
        return;
      }
    } catch (e) {}
    legacy();
    function legacy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, url.length);
        var ok = document.execCommand("copy");
        ta.remove();
        cb(!!ok);
      } catch (e) {
        cb(false);
      }
    }
  }

  /* ------------------ 手机手势面板 ------------------ */
  var pad = null;
  var toggle = null;

  function buildPad() {
    if (pad) return pad;
    pad = el(
      '<div class="xm-pad" role="group" aria-label="手势快捷按钮">' +
        '<div class="xm-pad-head"><span>用手势按钮体验 · CAMERA OFF</span>' +
        '<button class="xm-pad-close" type="button" aria-label="收起">×</button></div>' +
        '<div class="xm-chips">' +
        '<button class="xm-chip" type="button" data-k="1">数字 1<small>ONE</small></button>' +
        '<button class="xm-chip" type="button" data-k="2">数字 2<small>TWO</small></button>' +
        '<button class="xm-chip" type="button" data-k="3">数字 3<small>THREE</small></button>' +
        '<button class="xm-chip" type="button" data-k="o">OK<small>三指替代</small></button>' +
        '<button class="xm-chip" type="button" data-k="f">握拳<small>聚成树</small></button>' +
        '<button class="xm-chip" type="button" data-k=" ">五指<small>天天开心</small></button>' +
        '<button class="xm-chip wide" type="button" data-k="t">圣诞快乐<small>MERRY CHRISTMAS</small></button>' +
        '<button class="xm-chip wide" type="button" data-k="r">星尘重聚<small>BACK TO TREE</small></button>' +
        "</div></div>"
      );
    pad.querySelector(".xm-pad-close").addEventListener("click", closePad);
    pad.addEventListener("click", function (e) {
      var b = e.target.closest("[data-k]");
      if (!b) return;
      press(b.getAttribute("data-k"));
      toast(b.textContent.replace(/[A-Za-z].*$/, "").trim() + " 已触发");
    });
    document.body.appendChild(pad);
    return pad;
  }

  function openPad() {
    buildPad();
    pad.style.display = "flex";
    if (toggle) toggle.style.opacity = "0.35";
  }

  function closePad() {
    if (pad) pad.style.display = "none";
    if (toggle) toggle.style.opacity = "1";
  }

  function buildToggle() {
    toggle = el(
      '<button class="xm-toggle" type="button" aria-label="打开手势按钮">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">' +
        '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V5.2a1.5 1.5 0 0 1 3 0V11M14 11V6.2a1.5 1.5 0 0 1 3 0v6.3M17 12.5V9.6a1.5 1.5 0 0 1 3 0V15c0 3.6-2.4 6.4-6 6.4S8 19 8 15v-1.2L6.4 11.6a1.5 1.5 0 0 1 2.5-1.6L10 12"/>' +
        "</svg></button>"
    );
    toggle.addEventListener("click", function () {
      if (pad && pad.style.display === "flex") closePad();
      else openPad();
    });
    document.body.appendChild(toggle);
  }

  function cameraLive() {
    return !!document.querySelector(".status .led.connected");
  }

  /* ------------------ 手势模型加载进度 ------------------ */
  var loadPill = null;

  function speedText(bps) {
    if (!bps) return "";
    if (bps >= 1048576) return " · " + (bps / 1048576).toFixed(1) + " MB/s";
    return " · " + Math.max(1, Math.round(bps / 1024)) + " KB/s";
  }

  function assetProgress() {
    window.addEventListener("xm-asset-progress", function (event) {
      var d = event.detail;
      if (!d) return;
      if (d.done) {
        if (loadPill) { loadPill.remove(); loadPill = null; }
        if (d.failed) toast("手势模型下载失败 · 可先用手势按钮 / 键盘体验", 3200);
        return;
      }
      var pct = Math.max(1, Math.min(99, Math.round(d.percent || 0)));
      if (!loadPill) {
        loadPill = el(
          '<div class="xm-load">' +
            '<div class="xm-load-title">首次加载手势识别模型 · 之后会本地缓存</div>' +
            '<div class="xm-load-bar"><i></i></div>' +
            '<div class="xm-load-meta"><span></span></div>' +
            "</div>"
        );
        document.body.appendChild(loadPill);
      }
      loadPill.querySelector("i").style.width = pct + "%";
      loadPill.querySelector("span").textContent =
        pct + "% · " +
        (d.loadedBytes / 1048576).toFixed(1) + "/" + (d.totalBytes / 1048576).toFixed(1) + " MB" +
        speedText(d.bytesPerSecond);
    });
  }

  function init() {
    if (isWeChat) wechatTip();
    if (isTouch) {
      assetProgress();
      buildToggle();
      // 摄像头 8 秒内没连上（微信内一般如此），自动展开手势面板一次
      var tries = 0;
      var timer = setInterval(function () {
        if (cameraLive()) { clearInterval(timer); return; }
        if (++tries >= 8) {
          clearInterval(timer);
          var done = false;
          try { done = sessionStorage.getItem("xm-pad-auto") === "1"; } catch (e) {}
          if (!done) {
            openPad();
            try { sessionStorage.setItem("xm-pad-auto", "1"); } catch (e) {}
          }
        }
      }, 1000);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(init, 300);
  } else {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 300); });
  }
})();
