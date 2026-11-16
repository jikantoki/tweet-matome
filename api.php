<?php
header('Content-Type: application/json; charset=utf-8');
set_time_limit(120);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    $rawInput = file_get_contents('php://stdin');
}
$input = json_decode($rawInput, true);
$rawUrls = $input['urls'] ?? '';
$sortOrder = ($input['sort'] ?? 'asc') === 'desc' ? 'desc' : 'asc';

/**
 * URLからツイートIDとユーザー名を抽出する
 */
function parseTweetUrl(string $url): ?array
{
    if (preg_match('/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/', $url, $matches)) {
        return [
            'username' => $matches[1],
            'id' => $matches[2],
        ];
    }
    return null;
}

/**
 * Snowflake IDからUnixタイムスタンプ（秒）を計算する
 */
function getTimestampFromTweetId(string $tweetId): int
{
    if (strlen($tweetId) < 15) {
        return (int)$tweetId;
    }
    $twitterEpochMs = 1288834974657;
    $timestampMs = ((int)$tweetId >> 22) + $twitterEpochMs;
    return (int)floor($timestampMs / 1000);
}

/**
 * 共通のcURL GETリクエスト関数
 */
function httpGetJson(string $url, array $headers = []): array
{
    $ch = curl_init();
    $defaultHeaders = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => array_merge($defaultHeaders, $headers),
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($httpCode === 200 && $response !== false) {
        $decoded = json_decode($response, true);
        if (is_array($decoded)) {
            return ['data' => $decoded, 'error' => null];
        }
    }

    return [
        'data' => null,
        'error' => $curlError ?: "HTTP Status: {$httpCode}"
    ];
}

/**
 * FixTweet APIから詳細ツイート情報を取得する（いいね・リツイート数・メディア・アバター含む）
 */
function fetchTweetFxTwitter(string $username, string $tweetId): array
{
    $apiUrl = "https://api.fxtwitter.com/{$username}/status/{$tweetId}";
    return httpGetJson($apiUrl);
}

/**
 * Syndication APIからツイート情報を取得する
 */
function fetchTweetSyndication(string $tweetId): array
{
    $token = substr(str_replace('.', '', (string)((float)$tweetId / 1e15 * M_PI)), 0, 10);
    $apiUrl = "https://cdn.syndication.twimg.com/tweet-result?id={$tweetId}&lang=ja&token={$token}";
    return httpGetJson($apiUrl);
}

/**
 * Xの公式oEmbed APIから埋め込みHTMLを取得する
 */
function fetchTweetOembed(string $username, string $tweetId): array
{
    $cleanTwitterUrl = "https://twitter.com/{$username}/status/{$tweetId}";
    $apiUrl = 'https://publish.twitter.com/oembed?url=' . urlencode($cleanTwitterUrl) . '&omit_script=true';
    return httpGetJson($apiUrl);
}

/**
 * pic.twitter.com / pic.x.com から直接画像URLを解決するフォールバック
 */
function resolvePicImage(string $picUrl): ?string
{
    if (!preg_match('/^https?:\/\//i', $picUrl)) {
        $picUrl = 'https://' . $picUrl;
    }
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $picUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ]);
    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $html) {
        if (preg_match('/<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        if (preg_match('/<meta\s+name=["\']twitter:image["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    return null;
}

// URLの解析と重複排除
$lines = preg_split('/[\r\n\s]+/', trim($rawUrls), -1, PREG_SPLIT_NO_EMPTY);
$tweets = [];

foreach ($lines as $line) {
    $parsed = parseTweetUrl($line);
    if ($parsed) {
        $id = $parsed['id'];
        $tweets[$id] = [
            'id' => $id,
            'username' => $parsed['username'],
            'url' => "https://x.com/{$parsed['username']}/status/{$id}",
            'timestamp' => getTimestampFromTweetId($id),
        ];
    }
}

if (empty($tweets)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => '有効なTwitter（X）のステータスURLが見つかりませんでした。'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 時系列ソート
usort($tweets, function ($a, $b) use ($sortOrder) {
    return $sortOrder === 'desc'
        ? ($b['timestamp'] <=> $a['timestamp'])
        : ($a['timestamp'] <=> $b['timestamp']);
});

// データ取得ループ
$results = [];
foreach ($tweets as $tweet) {
    $tweetId = $tweet['id'];
    $username = $tweet['username'];

    // 1. FixTweet API から詳細情報を取得
    $fxRes = fetchTweetFxTwitter($username, $tweetId);
    $fxData = $fxRes['data']['tweet'] ?? null;

    // 2. 必要に応じて Syndication API をフォールバック
    $synData = null;
    if (!$fxData) {
        $synRes = fetchTweetSyndication($tweetId);
        $synData = $synRes['data'] ?? null;
    }

    // 3. Twitterプレビュータブ用の oEmbed 取得
    $oembedRes = fetchTweetOembed($username, $tweetId);
    $oembed = $oembedRes['data'] ?? null;

    // 投稿者情報
    $authorName = $fxData['author']['name'] 
        ?? $synData['user']['name'] 
        ?? $oembed['author_name'] 
        ?? "@{$username}";

    $authorUsername = $fxData['author']['screen_name']
        ?? $synData['user']['screen_name']
        ?? $username;

    $authorUrl = $fxData['author']['url']
        ?? $oembed['author_url']
        ?? "https://x.com/{$authorUsername}";

    $authorAvatar = $fxData['author']['avatar_url']
        ?? $synData['user']['profile_image_url_https']
        ?? null;
    if ($authorAvatar) {
        // 解像度を向上（_normal -> _bigger）
        $authorAvatar = str_replace('_normal.', '_bigger.', $authorAvatar);
    }

    // ツイート本文
    $text = $fxData['text'] ?? $synData['text'] ?? null;
    if ($text === null && !empty($oembed['html'])) {
        if (preg_match('/<blockquote[^>]*><p[^>]*>(.*?)<\/p>/is', $oembed['html'], $m)) {
            $text = strip_tags(str_replace('<br>', "\n", $m[1]));
        }
    }

    // いいね数・リツイート数
    $likeCount = $fxData['likes'] 
        ?? $synData['favorite_count'] 
        ?? null;
    $retweetCount = $fxData['retweets'] 
        ?? null;
    $replyCount = $fxData['replies'] 
        ?? $synData['conversation_count'] 
        ?? null;
    $quoteCount = $fxData['quotes'] 
        ?? null;

    // メディア（画像リスト）
    $photos = [];
    if (!empty($fxData['media']['photos'])) {
        foreach ($fxData['media']['photos'] as $p) {
            $photos[] = [
                'url' => $p['url'],
                'width' => $p['width'] ?? null,
                'height' => $p['height'] ?? null,
                'alt' => $p['altText'] ?? null,
            ];
        }
    } elseif (!empty($synData['photos'])) {
        foreach ($synData['photos'] as $p) {
            $photos[] = [
                'url' => $p['url'],
                'width' => $p['width'] ?? null,
                'height' => $p['height'] ?? null,
                'alt' => null,
            ];
        }
    } elseif (!empty($synData['mediaDetails'])) {
        foreach ($synData['mediaDetails'] as $m) {
            if (($m['type'] ?? '') === 'photo') {
                $photos[] = [
                    'url' => $m['media_url_https'] ?? $m['url'] ?? '',
                    'width' => $m['original_info']['width'] ?? null,
                    'height' => $m['original_info']['height'] ?? null,
                    'alt' => null,
                ];
            }
        }
    }

    // 通常URLエンティティ情報
    $urls = [];
    if (!empty($fxData['raw_text']['facets'])) {
        foreach ($fxData['raw_text']['facets'] as $facet) {
            if (($facet['type'] ?? '') === 'url') {
                $urls[] = [
                    'url' => $facet['original'] ?? '',
                    'expanded_url' => $facet['replacement'] ?? '',
                    'display_url' => $facet['display'] ?? '',
                ];
            }
        }
    } elseif (!empty($synData['entities']['urls'])) {
        foreach ($synData['entities']['urls'] as $u) {
            $urls[] = [
                'url' => $u['url'] ?? '',
                'expanded_url' => $u['expanded_url'] ?? '',
                'display_url' => $u['display_url'] ?? '',
            ];
        }
    }

    // photosが空で、pic.twitter.com または pic.x.com が本文に含まれている場合の画像取得
    if (empty($photos)) {
        $checkContent = ($text ?? '') . ' ' . ($oembed['html'] ?? '');
        if (preg_match_all('/(?:https?:\/\/)?(pic\.(?:twitter|x)\.com\/[a-zA-Z0-9]+)/i', $checkContent, $picMatches)) {
            $foundPicUrls = array_unique($picMatches[1]);
            foreach ($foundPicUrls as $picUrl) {
                $resolvedImg = resolvePicImage($picUrl);
                if ($resolvedImg) {
                    $photos[] = [
                        'url' => $resolvedImg,
                        'width' => null,
                        'height' => null,
                        'alt' => null,
                    ];
                }
            }
        }
    }

    $cleanTwitterUrl = "https://twitter.com/{$username}/status/{$tweetId}";
    $createdAt = ($tweet['timestamp'] > 1288834974)
        ? date('Y-m-d H:i:s', $tweet['timestamp'])
        : 'Unknown (Pre-Snowflake)';

    $fallbackHtml = <<<HTML
<blockquote class="twitter-tweet">
    <a href="{$cleanTwitterUrl}">{$createdAt} - @{$username}</a>
</blockquote>
HTML;

    $results[] = [
        'id' => $tweetId,
        'url' => $tweet['url'],
        'created_at' => $createdAt,
        'timestamp' => $tweet['timestamp'],
        'author_name' => $authorName,
        'author_username' => $authorUsername,
        'author_url' => $authorUrl,
        'author_avatar' => $authorAvatar,
        'text' => $text,
        'photos' => $photos,
        'urls' => $urls,
        'like_count' => $likeCount,
        'retweet_count' => $retweetCount,
        'reply_count' => $replyCount,
        'quote_count' => $quoteCount,
        'html' => $oembed['html'] ?? $fallbackHtml,
        'fetch_status' => ($fxData || $synData || $oembed) ? 'ok' : ($fxRes['error'] ?? 'fetch_failed'),
    ];

    usleep(150000);
}

echo json_encode([
    'success' => true,
    'results' => $results
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
