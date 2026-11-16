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
  const openHtmlTabBtn = document.getElementById('openHtmlTabBtn')

  const htmlCode = document.getElementById('htmlCode')
  const jsonCode = document.getElementById('jsonCode')

  const tabBtns = document.querySelectorAll('.tab-btn')
  const tabContents = document.querySelectorAll('.tab-content')

  // デフォルトのアバター画像（HTML属性破壊を防ぐBase64形式のSVG Data URL）
  const DEFAULT_AVATAR =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzg4OTlhNiI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='

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

  // 別タブで開くボタン
  if (openHtmlTabBtn) {
    openHtmlTabBtn.addEventListener('click', () => {
      if (currentResults.length === 0) return
      const fullHtml = buildStandaloneHtml(currentResults)
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

    // 1. Twitterプレビュー描画（公式ウィジェット用）
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

    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load(twitterPreviewBox)
    }

    // 2. HTMLプレビュー描画（自前軽量プレビュー）
    updateHtmlPreview(results)

    // 3. HTMLソースコード生成
    htmlCode.value = buildStandaloneHtml(results)

    // 4. JSONデータ生成
    jsonCode.value = JSON.stringify(results, null, 2)
  }

  // HTMLプレビュー (iframe) の更新
  function updateHtmlPreview(results) {
    const standaloneHtml = buildStandaloneHtml(results)
    htmlPreviewIframe.srcdoc = standaloneHtml
  }

  // メタ情報テキストの整形（Twitterプレビュー用）
  function formatMetaText(item) {
    let text = `投稿日時: ${item.created_at || '不明'}`
    if (item.retweet_count !== null || item.like_count !== null) {
      const rt = item.retweet_count !== null ? item.retweet_count.toLocaleString() : '0'
      const like = item.like_count !== null ? item.like_count.toLocaleString() : '0'
      text += ` ｜ 🔁 ${rt} ❤️ ${like}`
    }
    return text
  }

  // HTMLエスケープ
  function escapeHtml(str) {
    if (!str && str !== 0) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // ツイート本文のリンク化・整形処理
  function formatTweetBody(item) {
    let rawText = item.text || ''
    if (!rawText) return ''

    // 画像が別途表示される場合、本文末尾の pic.twitter.com / pic.x.com / 画像用短縮URL は本文から削除
    if (item.photos && item.photos.length > 0) {
      // 末尾にある pic.twitter.com/xxx や pic.x.com/xxx を除去
      rawText = rawText.replace(/(?:https?:\/\/)?(?:pic\.(?:twitter|x)\.com\/[a-zA-Z0-9_-]+)\s*$/gi, '')
    }

    // 基本エスケープ
    let escaped = escapeHtml(rawText)

    // URLマップ（短縮URL -> 展開URL・表示URL）の適用
    if (item.urls && item.urls.length > 0) {
      item.urls.forEach((u) => {
        if (!u.url) return
        const escTco = escapeHtml(u.url)
        const escTarget = escapeHtml(u.expanded_url || u.url)
        const escDisplay = escapeHtml(u.display_url || u.expanded_url || u.url)
        const linkTag = `<a href="${escTarget}" target="_blank" rel="noopener noreferrer" class="tweet-link">${escDisplay}</a>`
        escaped = escaped.split(escTco).join(linkTag)
      })
    }

    // 未置換の pic.twitter.com / pic.x.com が本文に残っている場合（写真画像が取れなかった等のフォールバック）
    escaped = escaped.replace(/(?:https?:\/\/)?(pic\.(?:twitter|x)\.com\/[a-zA-Z0-9_-]+)/gi, (match, p1) => {
      const url = `https://${p1}`
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="tweet-link tweet-pic-link">${p1}</a>`
    })

    // 残りのURLをリンク化（http / https）
    escaped = escaped.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/gi, (match, prefix, url) => {
      return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer" class="tweet-link">${url}</a>`
    })

    // ハッシュタグのリンク化
    escaped = escaped.replace(/(^|\s)#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)/g, (match, prefix, tag) => {
      return `${prefix}<a href="https://x.com/hashtag/${encodeURIComponent(tag)}" target="_blank" rel="noopener noreferrer" class="tweet-hashtag">#${tag}</a>`
    })

    // メンションのリンク化
    escaped = escaped.replace(/(^|\s)@([a-zA-Z0-9_]+)/g, (match, prefix, user) => {
      return `${prefix}<a href="https://x.com/${user}" target="_blank" rel="noopener noreferrer" class="tweet-mention">@${user}</a>`
    })

    return escaped
  }

  // メディア（画像グリッド）のHTML生成
  function renderTweetMediaHtml(photos) {
    if (!photos || photos.length === 0) return ''

    const count = Math.min(photos.length, 4)
    const gridClass = `grid-${count}`

    const itemsHtml = photos.slice(0, 4).map((photo, idx) => {
      const photoUrl = escapeHtml(photo.url || photo)
      const altText = escapeHtml(photo.alt || `添付画像 ${idx + 1}`)
      return `            <a href="${photoUrl}" target="_blank" rel="noopener noreferrer" class="media-item" title="クリックして拡大表示">
                <img src="${photoUrl}" alt="${altText}" loading="lazy" />
            </a>`
    }).join('\n')

    return `        <div class="tweet-media-container">
            <div class="tweet-media-grid ${gridClass}">
${itemsHtml}
            </div>
        </div>`
  }

  // 自前ツイートカード単体のHTML生成
  function renderCustomTweetCard(item) {
    const authorName = escapeHtml(item.author_name || item.author_username || 'ユーザー')
    const authorHandle = escapeHtml(item.author_username ? `@${item.author_username}` : '')
    const authorUrl = escapeHtml(item.author_url || `https://x.com/${item.author_username || ''}`)
    const tweetUrl = escapeHtml(item.url || `https://x.com/${item.author_username || 'i'}/status/${item.id}`)
    const avatarUrl = escapeHtml(item.author_avatar || DEFAULT_AVATAR)
    const formattedBody = formatTweetBody(item)
    const mediaHtml = renderTweetMediaHtml(item.photos)
    const createdAt = escapeHtml(item.created_at || '')

    const rtCount = item.retweet_count !== null && item.retweet_count !== undefined
      ? item.retweet_count.toLocaleString()
      : '0'
    const likeCount = item.like_count !== null && item.like_count !== undefined
      ? item.like_count.toLocaleString()
      : '0'

    return `    <article class="tweet-card" data-tweet-id="${escapeHtml(item.id)}">
        <header class="tweet-header">
            <div class="tweet-author-wrapper">
                <a href="${authorUrl}" target="_blank" rel="noopener noreferrer" class="tweet-avatar-link">
                    <img src="${avatarUrl}" alt="${authorName}" class="tweet-avatar" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'" />
                </a>
                <div class="tweet-author-info">
                    <a href="${authorUrl}" target="_blank" rel="noopener noreferrer" class="tweet-author-name">${authorName}</a>
                    <span class="tweet-author-handle"><a href="${authorUrl}" target="_blank" rel="noopener noreferrer">${authorHandle}</a></span>
                </div>
            </div>
            <a href="${tweetUrl}" target="_blank" rel="noopener noreferrer" class="tweet-x-link" title="X (Twitter) で開く">
                <svg class="tweet-x-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
            </a>
        </header>
        <div class="tweet-body">${formattedBody}</div>
${mediaHtml ? mediaHtml + '\n' : ''}        <footer class="tweet-footer">
            <div class="tweet-date">
                <a href="${tweetUrl}" target="_blank" rel="noopener noreferrer">${createdAt}</a>
            </div>
            <div class="tweet-metrics">
                <span class="metric-badge retweet" title="リツイート数">
                    <svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.9 2 2 2H16v2H7.5C5.01 20 3 17.99 3 15.5V7.55L0.932 9.48 0 8.02 4.5 3.88zM19.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.9-2-2-2H8V4h8.5C18.99 4 21 6.01 21 8.5v7.95l2.068-1.93 1.364 1.46-4.932 4.14z"></path></svg>
                    <span class="metric-count">${rtCount}</span>
                </span>
                <span class="metric-badge like" title="いいね数">
                    <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                    <span class="metric-count">${likeCount}</span>
                </span>
            </div>
        </footer>
    </article>`
  }

  // 単体保存用・プレビュー用の自前HTMLを組み立て
  function buildStandaloneHtml(results) {
    const cardsHtml = results.map((item) => renderCustomTweetCard(item)).join('\n')

    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ツイートタイムラインまとめ</title>
    <style>
        :root {
            --bg: #f7f9f9;
            --card-bg: #ffffff;
            --border: #cfd9de;
            --text: #0f1419;
            --muted: #536471;
            --primary: #1d9bf0;
            --primary-hover: #1a8cd8;
            --rt-color: #00ba7c;
            --like-color: #f91880;
        }
        * {
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            max-width: 600px;
            margin: 24px auto;
            padding: 0 16px;
            line-height: 1.5;
        }
        h1 {
            font-size: 1.25rem;
            color: var(--text);
            border-bottom: 2px solid var(--primary);
            padding-bottom: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        h1 .count {
            font-size: 0.85rem;
            color: var(--muted);
            font-weight: normal;
        }
        .tweet-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .tweet-card:hover {
            border-color: #bcc6cc;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
        }
        .tweet-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .tweet-author-wrapper {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            overflow: hidden;
        }
        .tweet-avatar-link {
            flex-shrink: 0;
            display: block;
        }
        .tweet-avatar {
            width: 42px;
            height: 42px;
            border-radius: 9999px;
            object-fit: cover;
            background-color: #e1e8ed;
            display: block;
        }
        .tweet-author-info {
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
            line-height: 1.3;
        }
        .tweet-author-name {
            font-weight: 700;
            font-size: 0.95rem;
            color: var(--text);
            text-decoration: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .tweet-author-name:hover {
            text-decoration: underline;
        }
        .tweet-author-handle a {
            font-size: 0.85rem;
            color: var(--muted);
            text-decoration: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
        }
        .tweet-author-handle a:hover {
            text-decoration: underline;
        }
        .tweet-x-link {
            flex-shrink: 0;
            margin-left: 8px;
            color: var(--muted);
            display: flex;
            align-items: center;
            text-decoration: none;
            transition: color 0.15s ease;
        }
        .tweet-x-link:hover {
            color: var(--text);
        }
        .tweet-x-logo {
            width: 18px;
            height: 18px;
        }
        .tweet-body {
            font-size: 0.95rem;
            line-height: 1.55;
            color: var(--text);
            word-break: break-word;
            white-space: pre-wrap;
            margin-bottom: 12px;
        }
        .tweet-body a {
            color: var(--primary);
            text-decoration: none;
        }
        .tweet-body a:hover {
            text-decoration: underline;
        }
        /* 画像メディアコンテナ */
        .tweet-media-container {
            margin-top: 10px;
            margin-bottom: 12px;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border);
            background: #000000;
        }
        .tweet-media-grid {
            display: grid;
            gap: 2px;
            background: var(--border);
        }
        .tweet-media-grid.grid-1 {
            grid-template-columns: 1fr;
        }
        .tweet-media-grid.grid-2 {
            grid-template-columns: 1fr 1fr;
        }
        .tweet-media-grid.grid-3 {
            grid-template-columns: 1fr 1fr;
        }
        .tweet-media-grid.grid-3 .media-item:first-child {
            grid-row: span 2;
        }
        .tweet-media-grid.grid-4 {
            grid-template-columns: 1fr 1fr;
        }
        .media-item {
            position: relative;
            display: block;
            overflow: hidden;
            background-color: #f7f9f9;
        }
        .media-item img {
            width: 100%;
            height: 100%;
            max-height: 480px;
            object-fit: cover;
            display: block;
            transition: transform 0.2s ease;
        }
        .tweet-media-grid.grid-1 .media-item img {
            max-height: 520px;
            object-fit: contain;
            background-color: #050505;
        }
        .media-item:hover img {
            transform: scale(1.02);
        }
        .tweet-footer {
            border-top: 1px solid #eff3f4;
            padding-top: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 0.82rem;
            color: var(--muted);
        }
        .tweet-date a {
            color: var(--muted);
            text-decoration: none;
        }
        .tweet-date a:hover {
            text-decoration: underline;
        }
        .tweet-metrics {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .metric-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.85rem;
            color: var(--muted);
        }
        .metric-badge svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
            flex-shrink: 0;
        }
        .metric-badge.retweet {
            color: var(--muted);
        }
        .metric-badge.retweet:hover,
        .metric-badge.retweet svg {
            color: var(--rt-color);
        }
        .metric-badge.like {
            color: var(--muted);
        }
        .metric-badge.like:hover,
        .metric-badge.like svg {
            color: var(--like-color);
        }
        .metric-badge .metric-count {
            font-weight: 600;
        }
    </style>
</head>
<body>
    <h1>
        <span>ツイートタイムライン</span>
        <span class="count">${results.length}件</span>
    </h1>
${cardsHtml}
</body>
</html>`
  }
})
