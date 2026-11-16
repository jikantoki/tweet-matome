<?php
header('Content-Type: application/json; charset=utf-8');
set_time_limit(120);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
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
function httpGetJson(string $url): array
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
 * Xの公式oEmbed APIから埋め込みHTMLを取得する
 */
function fetchTweetOembed(string $username, string $tweetId): array
{
    $cleanTwitterUrl = "https://twitter.com/{$username}/status/{$tweetId}";
    $apiUrl = 'https://publish.twitter.com/oembed?url=' . urlencode($cleanTwitterUrl) . '&omit_script=true';
    return httpGetJson($apiUrl);
}

/**
 * Syndication APIからいいね数・リツイート数などの詳細メトリクスを取得する
 */
function fetchTweetMetrics(string $tweetId): array
{
    // X埋め込みウィジェット用の公開エンドポイント
    $token = substr(str_replace('.', '', (string)((int)$tweetId / 1e15 * M_PI)), 0, 10);
    $apiUrl = "https://cdn.syndication.twimg.com/tweet-result?id={$tweetId}&lang=ja&token={$token}";
    
    $res = httpGetJson($apiUrl);
    $data = $res['data'];

    if (!$data) {
        return [
            'like_count' => null,
            'retweet_count' => null,
            'reply_count' => null,
            'quote_count' => null,
            'text' => null,
        ];
    }

    return [
        'like_count' => $data['favorite_count'] ?? 0,
        'retweet_count' => $data['retweet_count'] ?? 0,
        'reply_count' => $data['conversation_count'] ?? 0,
        'quote_count' => $data['quote_count'] ?? 0,
        'text' => $data['text'] ?? null, // ついでにツイート本文のプレーンテキストも取得可能
    ];
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
    $oembedRes = fetchTweetOembed($tweet['username'], $tweet['id']);
    $oembed = $oembedRes['data'];
    $metrics = fetchTweetMetrics($tweet['id']);

    $cleanTwitterUrl = "https://twitter.com/{$tweet['username']}/status/{$tweet['id']}";
    $createdAt = ($tweet['timestamp'] > 1288834974)
        ? date('Y-m-d H:i:s', $tweet['timestamp'])
        : 'Unknown (Pre-Snowflake)';

    $fallbackHtml = <<<HTML
<blockquote class="twitter-tweet">
    <a href="{$cleanTwitterUrl}">{$createdAt} - @{$tweet['username']}</a>
</blockquote>
HTML;

    $results[] = [
        'id' => $tweet['id'],
        'url' => $tweet['url'],
        'created_at' => $createdAt,
        'timestamp' => $tweet['timestamp'],
        'author_name' => $oembed['author_name'] ?? "@{$tweet['username']}",
        'author_url' => $oembed['author_url'] ?? "https://x.com/{$tweet['username']}",
        'like_count' => $metrics['like_count'],
        'retweet_count' => $metrics['retweet_count'],
        'reply_count' => $metrics['reply_count'],
        'quote_count' => $metrics['quote_count'],
        'text' => $metrics['text'],
        'html' => $oembed['html'] ?? $fallbackHtml,
        'fetch_status' => $oembed ? 'ok' : $oembedRes['error'],
    ];

    usleep(200000);
}

echo json_encode([
    'success' => true,
    'results' => $results
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);