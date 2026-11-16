// 取得結果のレンダリング
function renderResults(results) {
  emptyState.classList.add('hidden')
  resultContainer.classList.remove('hidden')
  tweetCount.textContent = results.length

  // 1. プレビュー描画
  previewBox.innerHTML = ''
  results.forEach((item) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'tweet-item'

    const meta = document.createElement('div')
    meta.className = 'tweet-meta'
    meta.textContent = formatMetaText(item)

    const content = document.createElement('div')
    content.innerHTML = item.html

    wrapper.appendChild(meta)
    wrapper.appendChild(content)
    previewBox.appendChild(wrapper)
  })

  // X公式ウィジェットの再描画
  if (window.twttr && window.twttr.widgets) {
    window.twttr.widgets.load(previewBox)
  }

  // 2. HTMLソースコード生成
  htmlCode.value = buildStandaloneHtml(results)

  // 3. JSONデータ生成
  jsonCode.value = JSON.stringify(results, null, 2)
}

// メタ情報テキストの整形
function formatMetaText(item) {
  let text = `投稿日時: ${item.created_at}`
  if (item.retweet_count !== null && item.like_count !== null) {
    text += ` ｜ 🔁 ${item.retweet_count.toLocaleString()} ❤️ ${item.like_count.toLocaleString()}`
  }
  return text
}

// 単体保存用HTMLの組み立て
function buildStandaloneHtml(results) {
  const itemsHtml = results
    .map((item) => {
      const escapedMeta = escapeHtml(formatMetaText(item))
      return `    <div class="tweet-item">\n        <div class="tweet-meta">${escapedMeta}</div>\n        ${item.html}\n    </div>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ツイートまとめ（時系列）</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #f5f8fa;
            color: #14171a;
            max-width: 600px;
            margin: 40px auto;
            padding: 0 20px;
        }
        .tweet-item {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e1e8ed;
        }
        .tweet-meta {
            font-size: 0.85em;
            color: #657786;
            margin-bottom: 8px;
        }
    </style>
</head>
<body>
    <h1>ツイートタイムライン</h1>
${itemsHtml}
    <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"><\/script>
</body>
</html>`
}
