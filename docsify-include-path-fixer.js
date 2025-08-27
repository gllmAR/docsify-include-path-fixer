/*!
 * docsify-include-path-fixer
 * Rewrites relative URLs inside remote :include blocks to absolute URLs.
 * Usage:
 *   <script src="docsify-include-path-fixer.js"></script>
 *   <script>
 *     window.$docsify = { ...,
 *       plugins: (window.$docsify.plugins || []).concat(window.DocsifyIncludePathFixer())
 *     }
 *   </script>
 */
(function (root, factory) {
  // UMD-ish: global only (Docsify runs in browsers), but keep it tidy.
  root.DocsifyIncludePathFixer = factory();
})(this, function () {
  "use strict";

  // --- helpers --------------------------------------------------------------
  function makeId() {
    return "ipf_" + Math.random().toString(36).slice(2, 10);
  }

  // Consider absolute if starts with scheme:, //, /, #, data:, mailto:, tel:
  function isRelative(u) {
    return !/^(?:[a-z]+:|\/\/|\/|#)/i.test(u || "");
  }

  function ensureTrailingSlash(u) {
    return u.endsWith("/") ? u : (u + "/");
  }

  function baseDirOf(urlStr) {
    try {
      var u = new URL(urlStr, location.href);
      return ensureTrailingSlash(u.href.replace(/[^/]*$/, ""));
    } catch (e) {
      return null;
    }
  }

  function rewriteSrcset(el, base) {
    var srcset = el.getAttribute("srcset");
    if (!srcset) return;
    var out = srcset.split(",").map(function (part) {
      var seg = part.trim();
      if (!seg) return "";
      var m = seg.match(/^(\S+)(\s+.*)?$/); // URL + optional descriptors
      if (!m) return seg;
      var url = m[1], desc = m[2] || "";
      // If a value contains multiple absolute URLs concatenated (e.g.
      // "https://proxy...https://raw.githubusercontent.com/.."), prefer the
      // last absolute URL as the real resource. This preserves any
      // data-origin-like value that may be present in the original.
      try { url = extractLastAbsoluteUrl(url); } catch (_) {}
      if (isRelative(url)) {
        try { url = new URL(url, base).href; } catch (_) {}
      }
      return (url + desc).trim();
    }).filter(Boolean).join(", ");
    el.setAttribute("srcset", out);
  }

  // If an attribute value accidentally contains multiple absolute URLs
  // concatenated together, return the last absolute URL found. Falls
  // back to the original value if nothing found.
  function extractLastAbsoluteUrl(val) {
    if (!val || typeof val !== "string") return val;
    // If two absolute URLs are concatenated without a separator (e.g.
    // "https://proxy...https://raw.githubusercontent.com/…"), a simple
    // global regex match will often capture the entire concatenated string
    // as a single match. Instead, find the last occurrence of an
    // "http(s)://" substring and return from there.
    var lastHttp = val.lastIndexOf("http://");
    var lastHttps = val.lastIndexOf("https://");
    var last = Math.max(lastHttp, lastHttps);
    if (last === -1) {
      // fallback to regex match if no explicit marker found
      var matches = val.match(/https?:\/\/[^\s"']+/ig);
      if (matches && matches.length) return matches[matches.length - 1];
      return val;
    }
    var rest = val.slice(last);
    var m = rest.match(/^(https?:\/\/[^\s"']+)/i);
    if (m) return m[1];
    return rest;
  }

  function rewriteAttributesWithin(root, base) {
    if (!root || !base) return;
    var selector = [
      "img[src]", "img[srcset]",
      "a[href]",
      "source[src]", "source[srcset]",
      "track[src]",
      "video[src]", "audio[src]",
      "iframe[src]",
      "object[data]", "embed[src]",
      "link[href]" // harmless if present in content
    ].join(",");

    root.querySelectorAll(selector).forEach(function (el) {
      if (el.hasAttribute("src")) {
        var s = el.getAttribute("src");
        // preserve original value in data-origin if not already present
  try { if (!el.hasAttribute("data-ipf-origin")) el.setAttribute("data-ipf-origin", s); } catch (_) {}
        // extract last absolute URL if values were concatenated
        try { s = extractLastAbsoluteUrl(s); } catch (_) {}
        if (isRelative(s)) { try { el.setAttribute("src", new URL(s, base).href); } catch(_){} }
        else { try { el.setAttribute("src", s); } catch(_){} }
      }
      if (el.hasAttribute("data")) {
        var d = el.getAttribute("data");
  try { if (!el.hasAttribute("data-ipf-origin")) el.setAttribute("data-ipf-origin", d); } catch (_) {}
        try { d = extractLastAbsoluteUrl(d); } catch (_) {}
        if (isRelative(d)) { try { el.setAttribute("data", new URL(d, base).href); } catch(_){} }
        else { try { el.setAttribute("data", d); } catch(_){} }
      }
      if (el.hasAttribute("href")) {
        var h = el.getAttribute("href");
  try { if (!el.hasAttribute("data-ipf-origin")) el.setAttribute("data-ipf-origin", h); } catch (_) {}
        try { h = extractLastAbsoluteUrl(h); } catch (_) {}
        if (isRelative(h)) { try { el.setAttribute("href", new URL(h, base).href); } catch(_){} }
        else { try { el.setAttribute("href", h); } catch(_){} }
      }
      if (el.hasAttribute("srcset")) {
        rewriteSrcset(el, base);
      }
    });
  }

  function wrapBetweenMarkers(begin, end, base) {
    var parent = begin.parentNode;
    var wrapper = document.createElement("div");
    wrapper.setAttribute("data-ipf-base", base);
    wrapper.setAttribute("data-ipf-processed", "0");

    // Insert wrapper right after begin
    parent.insertBefore(wrapper, begin.nextSibling);

    // Move nodes between begin and end into wrapper
    var node = wrapper.nextSibling;
    while (node && node !== end) {
      var next = node.nextSibling;
      wrapper.appendChild(node);
      node = next;
    }

    // Remove markers
    parent.removeChild(begin);
    parent.removeChild(end);

    return wrapper;
  }

  function processAllBlocks(container) {
    // Find BEGIN markers first
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT, null, false);
    var begins = [];
    var n;
    while ((n = walker.nextNode())) {
      var t = (n.nodeValue || "").trim();
      if (t.startsWith("IPF:BEGIN")) begins.push(n);
    }

    begins.forEach(function (begin) {
      var txt = (begin.nodeValue || "").trim();
      var idMatch = txt.match(/id=([^\s]+)/);
      var baseMatch = txt.match(/base=([^\s]+)/);
      if (!idMatch || !baseMatch) return;

      var id = idMatch[1];
      var base = decodeURIComponent(baseMatch[1]);

      // find matching END
      var end = begin;
      while ((end = end.nextSibling)) {
        if (end.nodeType === Node.COMMENT_NODE && (end.nodeValue || "").trim() === ("IPF:END id=" + id)) {
          break;
        }
      }
      if (!end) return;

      var wrapper = wrapBetweenMarkers(begin, end, base);
      if (wrapper.getAttribute("data-ipf-processed") !== "1") {
        rewriteAttributesWithin(wrapper, base);
        wrapper.setAttribute("data-ipf-processed", "1");
      }
    });
  }

  // Finds [label](URL ':include ...') occurrences so we can remember the base
  var INCLUDE_RE = /\[([^\]]+?)\]\(\s*([^\s)]+)\s*(["']?:include\b[^)]*)\)/g;

  function factory(userOptions) {
    userOptions = userOptions || {};
    var scopeSelector = userOptions.scopeSelector || ".markdown-section";

    return function (hook, vm) {
      // Before Docsify renders a page: insert comment markers around each :include
      hook.beforeEach(function (mdText) {
        return mdText.replace(INCLUDE_RE, function (_m, label, url, attrs) {
          var base = baseDirOf(url);
          if (!base) return _m; // leave untouched if URL unparsable
          var id = makeId();
          return [
            "<!--IPF:BEGIN id=" + id + " base=" + encodeURIComponent(base) + "-->",
            "[" + label + "](" + url + " " + (attrs || "") + ")",
            "<!--IPF:END id=" + id + "-->"
          ].join("\n");
        });
      });

      // After Docsify renders (includes are now inlined): rewrite relative URLs inside each block
      hook.doneEach(function () {
        var root = document.querySelector(scopeSelector) || document.body;
        processAllBlocks(root);
      });
    };
  }

  return factory;
});

// Auto-register the plugin when a Docsify config appears so consumers can
// simply include this script with a single <script src="..."></script>
// and don't need to manually concat the plugin into window.$docsify.plugins.
(function () {
  if (typeof window === "undefined") return;
  var MAX_ATTEMPTS = 60; // ~3 seconds at 50ms interval
  var INTERVAL = 50;
  var attempts = 0;

  function tryRegister() {
    attempts++;
    try {
      if (window._docsify_ipf_registered) return; // already done
      if (window.$docsify) {
        // Ensure plugins is an array and append our plugin factory result.
        window.$docsify.plugins = (window.$docsify.plugins || []).concat(window.DocsifyIncludePathFixer());
        window._docsify_ipf_registered = true;
        return;
      }
    } catch (e) {
      // ignore and retry
    }

    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tryRegister, INTERVAL);
    }
  }

  tryRegister();
})();
