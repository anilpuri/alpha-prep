/**
 * MathRenderer — renders HTML that may contain LaTeX math notation.
 *
 * Uses KaTeX's auto-render (CDN) inside a WebView to typeset any
 * \( ... \) inline math and \[ ... \] display math found in the HTML.
 * Falls back to the raw content on CDN failure.
 *
 * Only use this for questions/options where is_math === true (or wherever
 * the raw HTML contains LaTeX). For plain text/HTML, use stripHtml + <Text>.
 */
import React, { useState, useCallback } from "react";
import { View } from "react-native";
import WebView from "react-native-webview";

const KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist";

function buildPage(body: string, textColor: string, fontSize: number, bg: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <link rel="stylesheet" href="${KATEX}/katex.min.css">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{background:${bg};overflow:hidden}
    body{
      font-size:${fontSize}px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      line-height:1.6;color:${textColor};
      word-wrap:break-word;overflow-x:hidden;
    }
    #w{display:inline-block;width:100%}
    p{margin:2px 0}
    strong,b{font-weight:700}
    em,i{font-style:italic}
    u{text-decoration:underline}
    .katex{font-size:1em}
    .katex-display{margin:6px 0;overflow-x:auto}
    table{border-collapse:collapse;width:100%;margin:4px 0}
    td,th{padding:3px 6px;border:1px solid ${textColor}40;text-align:left}
    th{font-weight:700}
  </style>
</head>
<body><div id="w">${body}</div>
<script defer src="${KATEX}/katex.min.js"></script>
<script defer src="${KATEX}/contrib/auto-render.min.js"></script>
<script>
function sendHeight() {
  var el = document.getElementById('w');
  if (!el) return;
  var h = Math.ceil(el.getBoundingClientRect().height);
  if (h > 0 && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(h));
}
document.addEventListener('DOMContentLoaded', function() {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(document.getElementById('w'), {
      delimiters: [
        {left: '\\\\(', right: '\\\\)', display: false},
        {left: '\\\\[', right: '\\\\]', display: true},
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false,
      errorColor: '#cc0000'
    });
  }
  sendHeight();
});
window.addEventListener('load', sendHeight);
setTimeout(sendHeight, 400);
</script>
</body>
</html>`;
}

interface Props {
  /** Raw HTML string (may contain LaTeX \( ... \) and \[ ... \] blocks) */
  html: string;
  textColor?: string;
  fontSize?: number;
  backgroundColor?: string;
  /** Extra style applied to the outer container View */
  containerStyle?: object;
}

export function MathRenderer({
  html,
  textColor = "#111111",
  fontSize = 15,
  backgroundColor = "transparent",
  containerStyle,
}: Props) {
  const [height, setHeight] = useState(50);

  const onMessage = useCallback((e: any) => {
    const h = parseInt(e.nativeEvent.data, 10);
    if (h > 0 && h < 4000) setHeight(h + 4);
  }, []);

  const page = buildPage(html, textColor, fontSize, backgroundColor);

  return (
    <View style={[{ width: "100%", height }, containerStyle]}>
      <WebView
        source={{ html: page, baseUrl: "" }}
        style={{ flex: 1, backgroundColor: "transparent" }}
        scrollEnabled={false}
        onMessage={onMessage}
        originWhitelist={["*"]}
        mixedContentMode="always"
        javaScriptEnabled
        domStorageEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
