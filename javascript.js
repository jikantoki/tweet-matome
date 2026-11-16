document.addEventListener('DOMContentLoaded', () => {
  // DOM要素の取得
  const generatorForm = document.getElementById('generatorForm')
  const urlsInput = document.getElementById('urls')
  const sortSelect = document.getElementById('sort')
  const submitBtn = document.getElementById('submitBtn')
  const errorBox = document.getElementById('errorBox')

  const emptyState = document.getElementById('emptyState')
  const resultContainer = document.getElementById('resultContainer')
  const tweetCount = document.getElementById('tweetCount')

  const twitterPreviewBox = document.getElementById('twitterPreviewBox')
  const htmlPreviewIframe = document.getElementById('htmlPreviewIframe')
  const htmlPreviewWidgetToggle = document.getElementById('htmlPreviewWidgetToggle')
  const openHtmlTabBtn = document.getElementById('openHtmlTabBtn')

  const htmlCode = document.getElementById('htmlCode')
  const jsonCode = document.getElementById('jsonCode')

  const tabBtns = document.querySelectorAll('.tab-btn')
  const tabContents = document.querySelectorAll('.tab-content')

  // 現在の生成結果データ
  let currentResults = []

  // エラー表示ヘルパー
  function showError(message) {
    errorBox.textContent = message
    errorBox.classList.remove('hidden')
  }

  function clearError() {
    errorBox.textContent = ''
    errorBox.classList.add('hidden')
  }

  // フォーム送信イベント
  generatorForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearError()

    const rawUrls = urlsInput.value.trim()
    if (!rawUrls) {
      showError('ツイートのURLを入力してください。')
      urlsInput.focus()
      return
    }

    const sortOrder = sortSelect.value
    const originalBtnText = submitBtn.textContent

    try {
      submitBtn.disabled = true
      submitBtn.textContent = '生成中...'

      const response = await fetch('api.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          urls: rawUrls,
          sort: sortOrder,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'ツイートデータの取得に失敗しました。')
      }

      if (!data.results || data.results.length === 0) {
        throw new Error('有効なツイートデータが見つかりませんでした。')
      }

      renderResults(data.results)
    } catch (err) {
      console.error(err)
      showError(err.message || '通信エラーが発生しました。もう一度お試しください。')
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = originalBtnText
    }
  })

  // タブ切り替え処理
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab')

      tabBtns.forEach((b) => b.classList.remove('active'))
      tabContents.forEach((c) => c.classList.remove('active'))

      btn.classList.add('active')
      const targetContent = document.getElementById(`tab-${targetTab}`)
      if (targetContent) {
        targetContent.classList.add('active')
      }

      // Twitterプレビューが開かれた際にWidgetsを再ロード
      if (targetTab === 'twitter-preview') {
        if (window.twttr && window.twttr.widgets) {
          window.twttr.widgets.load(twitterPreviewBox)
        }
      }
    })
  })

  // HTMLプレビューのウィジェットトグル切り替え
  if (htmlPreviewWidgetToggle) {
    htmlPreviewWidgetToggle.addEventListener('change', () => {
      if (currentResults.length > 0) {
        updateHtmlPreview(currentResults)
      }
    })
  }

  // 別タブで開くボタン
  if (openHtmlTabBtn) {
    openHtmlTabBtn.addEventListener('click', () => {
      if (currentResults.length === 0) return
      const withWidgets = htmlPreviewWidgetToggle ? htmlPreviewWidgetToggle.checked : true
      const fullHtml = buildStandaloneHtml(currentResults, withWidgets)
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, '_blank')
    })
  }

  // コピーボタン処理
  document.querySelectorAll('button[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy')
      const targetEl = document.getElementById(targetId)
      if (!targetEl) return

      try {
        await navigator.clipboard.writeText(targetEl.value)
        const origText = btn.textContent
        btn.textContent = 'コピーしました！'
        setTimeout(() => {
          btn.textContent = origText
        }, 1500)
      } catch (err) {
        // フォールバック
        targetEl.select()
        document.execCommand('copy')
        const origText = btn.textContent
        btn.textContent = 'コピーしました！'
        setTimeout(() => {
          btn.textContent = origText
        }, 1500)
      }
    })
  })

  // ダウンロードボタン処理
  document.querySelectorAll('button[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-download')
      const targetEl = document.getElementById(targetId)
      if (!targetEl) return

      const filename = btn.getAttribute('data-filename') || 'download.txt'
      const mime = btn.getAttribute('data-mime') || 'text/plain'

      const blob = new Blob([targetEl.value], { type: `${mime};charset=utf-8` })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    })
  })

  // 取得結果のレンダリング
  function renderResults(results) {
    currentResults = results
    emptyState.classList.add('hidden')
    resultContainer.classList.remove('hidden')
    tweetCount.textContent = results.length

    // 1. Twitterプレビュー描画
    twitterPreviewBox.innerHTML = ''
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
      twitterPreviewBox.appendChild(wrapper)
    })

    // X公式ウィジェットの再描画
    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load(twitterPreviewBox)
    }

    // 2. HTMLプレビュー描画
    updateHtmlPreview(results)

    // 3. HTMLソースコード生成
    htmlCode.value = buildStandaloneHtml(results, true)

    // 4. JSONデータ生成
    jsonCode.value = JSON.stringify(results, null, 2)
  }

  // HTMLプレビュー (iframe) の更新
  function updateHtmlPreview(results) {
    const withWidgets = htmlPreviewWidgetToggle ? htmlPreviewWidgetToggle.checked : true
    const standaloneHtml = buildStandaloneHtml(results, withWidgets)
    htmlPreviewIframe.srcdoc = standaloneHtml
  }

  // メタ情報テキストの整形
  function formatMetaText(item) {
    let text = `投稿日時: ${item.created_at}`
    if (item.retweet_count !== null && item.like_count !== null) {
      text += ` ｜ 🔁 ${item.retweet_count.toLocaleString()} ❤️ ${item.like_count.toLocaleString()}`
    }
    return text
  }

  // HTMLエスケープ
  function escapeHtml(str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // 単体保存用・プレビュー用HTMLの組み立て
  function buildStandaloneHtml(results, includeWidgetScript = true) {
    const itemsHtml = results
      .map((item) => {
        const escapedMeta = escapeHtml(formatMetaText(item))
        return `    <div class="tweet-item">\n        <div class="tweet-meta">${escapedMeta}</div>\n        ${item.html}\n    </div>`
      })
      .join('\n')

    const widgetScriptTag = includeWidgetScript
      ? '    <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"><\/script>'
      : ''

    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ツイートまとめ（時系列）</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f7f9f9;
            color: #0f1419;
            max-width: 600px;
            margin: 30px auto;
            padding: 0 16px;
            line-height: 1.5;
        }
        h1 {
            font-size: 1.3rem;
            color: #0f1419;
            border-bottom: 2px solid #1d9bf0;
            padding-bottom: 8px;
            margin-bottom: 24px;
        }
        .tweet-item {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e1e8ed;
        }
        .tweet-meta {
            font-size: 0.82em;
            color: #536471;
            margin-bottom: 8px;
        }
        blockquote.twitter-tweet {
            margin: 8px 0;
            padding: 12px 16px;
            background: #ffffff;
            border-left: 4px solid #1d9bf0;
            border-radius: 6px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        blockquote.twitter-tweet p {
            margin: 0 0 8px 0;
            font-size: 0.95rem;
            white-space: pre-wrap;
            word-break: break-word;
        }
        blockquote.twitter-tweet a {
            color: #1d9bf0;
            text-decoration: none;
        }
        blockquote.twitter-tweet a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <h1>ツイートタイムライン</h1>
${itemsHtml}
${widgetScriptTag}
</body>
</html>`
  }
})
