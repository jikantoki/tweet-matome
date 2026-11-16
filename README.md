# X (Twitter) 時系列まとめジェネレーター

![アイコン](./icon.jpg)

X (Twitter) のツイートURLを貼り付けるだけで、ツイートIDから正確な投稿日時を割り出して時系列順に並び替え、まとめHTMLやJSONデータを生成するWebツールです。

Webブラウザ上のUIだけでなく、バックエンドの `api.php` に直接JSONリクエストを送信して各種プログラミング言語やバッチ処理から呼び出せる **APIモード** にも対応しています。

---

## 🌟 特徴

- **正確な時系列ソート**: XのツイートID（Snowflake ID）を解析し、投稿タイムスタンプ（秒・ミリ秒）を逆算。APIの制限を受けずにミリ秒単位で正確な時系列（昇順／降順）に並び替えます。
- **リッチな埋め込みとメトリクス取得**:
  - X公式の `oEmbed` API により、オフィシャルな埋め込み用ブロック引用タグ (`<blockquote>`) を生成。
  - 公開Syndication APIにより、いいね数・リツイート数・返信数・引用数および本文プレーンテキストを取得。
- **多彩な出力形式**:
  - **Twitterプレビュー**: 公式ウィジェットを読み込み、実際のツイート表示を確認。
  - **HTMLプレビュー**: 生成される単体HTMLのプレビュー（TwitterウィジェットON/OFF切り替え可能、別タブ展開対応）。
  - **HTMLソース**: コピー＆ダウンロード（`.html`）対応。ブログや静的サイトにそのまま貼り付け可能。
  - **JSONデータ**: コピー＆ダウンロード（`.json`）対応。他システムとの連携が容易。
- **APIモード対応**: `api.php` へ直接POSTリクエストを送ることで、Python・Node.js・シェルスクリプトなど外部からヘッドレスでツイート情報を取得可能。
- **Docker対応**: Docker / Docker Compose ですぐにコンテナを起動できます。

---

## 📁 プロジェクト構成

```
.
├── Dockerfile          # PHP 8.3 Apache コンテナビルド定義
├── compose.yaml        # Docker Compose サービス定義（ポート: 16868）
├── .dockerignore       # Dockerビルド除外設定
├── .gitignore          # Git管理除外設定
├── api.php             # バックエンドAPI（ツイートURL解析・時系列ソート・外部API連携）
├── index.html          # Web UI（操作画面）
├── javascript.js       # フロントエンドロジック（UI制御・API連携・プレビュー生成）
├── style.css           # UIスタイリング
├── icon.jpg            # ファビコン・アプリアイコン
└── README.md           # 本ドキュメント
```

---

## 🚀 クイックスタート

### 方法1: Docker Compose を使用する場合（推奨）

リポジトリルートで以下のコマンドを実行します。

```bash
docker compose up -d --build
```

起動後、ブラウザで [http://localhost:16868](http://localhost:16868) にアクセスします。

コンテナの停止:

```bash
docker compose down
```

### 方法2: ローカルの PHP 組み込みサーバーを使用する場合

PHP 8.1 以上（curl, json 拡張が有効な環境）が必要です。

```bash
php -S localhost:8000
```

起動後、ブラウザで [http://localhost:8000](http://localhost:8000) にアクセスします。

---

## 🔌 APIモードの使い方（`api.php`）

`api.php` にHTTP POSTリクエストでJSONペイロードを送信することで、Web UIを介さずにツイートの解析結果やメタデータをJSON形式で取得できます。

### エンドポイント仕様

- **URL**: `/api.php` (例: `http://localhost:16868/api.php`)
- **HTTPメソッド**: `POST`
- **リクエストヘッダー**: `Content-Type: application/json; charset=utf-8`

### リクエストパラメータ（JSON Body）

| フィールド | 型     |   必須   | 説明                                                                                                                                       | デフォルト値 |
| :--------- | :----- | :------: | :----------------------------------------------------------------------------------------------------------------------------------------- | :----------- |
| `urls`     | string | **必須** | ツイートのURL文字列。<br>改行（`\n`）または半角/全角スペース区切りで複数のURLを含めることができます。`twitter.com`、`x.com` の両方に対応。 | なし         |
| `sort`     | string |   任意   | ソート順序。<br>- `"asc"`: 古い順（時系列昇順）<br>- `"desc"`: 新しい順（時系列降順）                                                      | `"asc"`      |

#### リクエストボディ例

```json
{
  "urls": "https://x.com/jack/status/20\nhttps://twitter.com/elonmusk/status/1585841080431321088",
  "sort": "asc"
}
```

---

### レスポンス仕様

#### 成功時 (`HTTP 200 OK`)

```json
{
  "success": true,
  "results": [
    {
      "id": "20",
      "url": "https://x.com/jack/status/20",
      "created_at": "2006-03-21 20:50:14",
      "timestamp": 1142974214,
      "author_name": "jack",
      "author_url": "https://x.com/jack",
      "like_count": 204567,
      "retweet_count": 134211,
      "reply_count": 9812,
      "quote_count": 15430,
      "text": "just setting up my twttr",
      "html": "<blockquote class=\"twitter-tweet\"><p lang=\"en\" dir=\"ltr\">just setting up my twttr</p>&mdash; jack (@jack) <a href=\"https://twitter.com/jack/status/20?ref_src=twsrc%5Etfw\">March 21, 2006</a></blockquote>\n",
      "fetch_status": "ok"
    }
  ]
}
```

##### `results` 配列内の各オブジェクト項目

| フィールド      | 型             | 説明                                                             |
| :-------------- | :------------- | :--------------------------------------------------------------- |
| `id`            | string         | ツイートのID（Snowflake ID）                                     |
| `url`           | string         | 正規化されたツイートURL (`https://x.com/{username}/status/{id}`) |
| `created_at`    | string         | 投稿日時 (`Y-m-d H:i:s` 形式)                                    |
| `timestamp`     | int            | 投稿日時のUnixタイムスタンプ（秒）                               |
| `author_name`   | string         | 投稿者の表示名（取得失敗時は `@ユーザー名`）                     |
| `author_url`    | string         | 投稿者のプロフィールURL                                          |
| `like_count`    | int \| null    | いいね（お気に入り）数                                           |
| `retweet_count` | int \| null    | リツイート数                                                     |
| `reply_count`   | int \| null    | 返信（リプライ）数                                               |
| `quote_count`   | int \| null    | 引用ツイート数                                                   |
| `text`          | string \| null | ツイート本文のプレーンテキスト                                   |
| `html`          | string         | 埋め込み用HTML (`blockquote.twitter-tweet` タグ)                 |
| `fetch_status`  | string         | oEmbedの取得結果。成功時は `"ok"`、失敗時はエラーメッセージ      |

#### エラー時

- **HTTP 400 Bad Request** (有効なツイートURLが含まれていない場合)

  ```json
  {
    "success": false,
    "error": "有効なTwitter（X）のステータスURLが見つかりませんでした。"
  }
  ```

- **HTTP 405 Method Not Allowed** (POST以外のメソッドでアクセスした場合)
  ```json
  {
    "success": false,
    "error": "Method Not Allowed"
  }
  ```

---

### API呼び出しのコード例

#### 1. cURL (コマンドライン)

```bash
curl -X POST "http://localhost:16868/api.php" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": "https://x.com/jack/status/20\nhttps://twitter.com/elonmusk/status/1585841080431321088",
    "sort": "asc"
  }'
```

#### 2. Python (requests)

```python
import json
import requests

url = "http://localhost:16868/api.php"

payload = {
    "urls": """
    https://x.com/jack/status/20
    https://twitter.com/elonmusk/status/1585841080431321088
    """,
    "sort": "asc"
}

response = requests.post(
    url,
    headers={"Content-Type": "application/json; charset=utf-8"},
    data=json.dumps(payload)
)

data = response.json()
if data.get("success"):
    for tweet in data["results"]:
        print(f"[{tweet['created_at']}] {tweet['author_name']}: {tweet['text']}")
        print(f"Likes: {tweet['like_count']}, RTs: {tweet['retweet_count']}\n")
else:
    print(f"Error: {data.get('error')}")
```

#### 3. JavaScript / Node.js (fetch)

```javascript
async function fetchTweets() {
  const res = await fetch('http://localhost:16868/api.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: 'https://x.com/jack/status/20\nhttps://twitter.com/elonmusk/status/1585841080431321088',
      sort: 'desc', // 新しい順
    }),
  })

  const data = await res.json()
  if (data.success) {
    console.log(data.results)
  } else {
    console.error(data.error)
  }
}

fetchTweets()
```

#### 4. PHP (file_get_contents / cURL)

```php
<?php
$payload = json_encode([
    'urls' => "https://x.com/jack/status/20\nhttps://twitter.com/elonmusk/status/1585841080431321088",
    'sort' => 'asc'
]);

$options = [
    'http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/json\r\n",
        'content' => $payload,
        'ignore_errors' => true,
    ],
];

$context  = stream_context_create($options);
$response = file_get_contents('http://localhost:16868/api.php', false, $context);
$result = json_decode($response, true);

print_r($result);
```

---

## ⚙️ 内部処理と技術仕様

1. **Snowflake ID解析による投稿日時算出**
   - 2010年11月以降に導入されたTwitter Snowflake形式のIDから、上位ビットのミリ秒タイムスタンプ（Twitter Epoch: `1288834974657`）を逆算します。
   - Snowflake導入前の初期ツイート（IDが小さいもの）についても一定のフォールバックを行っています。
2. **レートリミット対策**
   - 連続アクセスによるX外部APIからのレート制限を回避するため、各ツイート情報の取得間に `usleep(200000)`（0.2秒）のウェイトを設けています。
3. **URL重複排除**
   - 入力された複数のURLに同一のツイートIDが含まれている場合は自動的に重複を排除して1件分のみ処理します。

---

## 📄 ライセンス & クレジット

- **Author**: エノキ電気 ([https://enoki.xyz](https://enoki.xyz))
- **Repository**: [https://github.com/jikantoki/tweet-matome](https://github.com/jikantoki/tweet-matome)
- 本ツールが利用している外部API・ウィジェットはX (Twitter) 社の規約に準拠してご利用ください。
