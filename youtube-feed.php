<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

$handle = 'iglesiacristianacongregaci5798';
$cacheFile = __DIR__ . '/youtube-feed.cache.json';
$cacheTtl = 300;

$cached = loadCache($cacheFile, $cacheTtl);
if ($cached !== null) {
    echo json_encode($cached, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$items = [];
$channelId = resolveChannelId($handle);
if ($channelId !== '') {
    $items = fetchFeedItems("https://www.youtube.com/feeds/videos.xml?channel_id={$channelId}");
}

if (!$items) {
    $items = fetchFeedItems("https://www.youtube.com/feeds/videos.xml?user={$handle}");
}

$payload = [
    'channelUrl' => "https://www.youtube.com/@{$handle}",
    'items' => array_slice($items, 0, 4)
];

saveCache($cacheFile, $payload);
echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
exit;

function loadCache(string $path, int $ttl): ?array
{
    if (!is_readable($path)) {
        return null;
    }

    $content = @file_get_contents($path);
    if ($content === false) {
        return null;
    }

    $data = json_decode($content, true);
    if (!is_array($data) || !isset($data['expires']) || !isset($data['payload'])) {
        return null;
    }

    if ($data['expires'] < time()) {
        return null;
    }

    return $data['payload'];
}

function saveCache(string $path, array $payload): void
{
    $data = [
        'expires' => time() + 300,
        'payload' => $payload,
    ];

    @file_put_contents($path, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function fetchUrl(string $url): ?string
{
    if (function_exists('curl_version')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36');
        $response = curl_exec($ch);
        curl_close($ch);

        return is_string($response) ? $response : null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36\r\n",
            'timeout' => 15,
            'follow_location' => 1,
            'max_redirects' => 5,
        ]
    ]);

    return @file_get_contents($url, false, $context) ?: null;
}

function resolveChannelId(string $handle): string
{
    $html = fetchUrl("https://www.youtube.com/@{$handle}");
    $channelId = extractChannelIdFromText($html);
    if ($channelId !== '') {
        return $channelId;
    }

    $html = fetchUrl("https://www.youtube.com/@{$handle}?pbj=1");
    if ($html !== null) {
        $json = preg_replace('/^\)\]\}\'/m', '', $html);
        $data = json_decode($json, true);
        $channelId = extractChannelIdFromJson($data);
        if ($channelId !== '') {
            return $channelId;
        }
    }

    return '';
}

function extractChannelIdFromText(?string $text): string
{
    if (!is_string($text)) {
        return '';
    }

    $patterns = [
        '/"channelId"\s*:\s*"(UC[\w-]+)"/i',
        '/"browseId"\s*:\s*"(UC[\w-]+)"/i',
        '/\/channel\/(UC[\w-]+)/i',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $text, $matches)) {
            return $matches[1];
        }
    }

    return '';
}

function extractChannelIdFromJson($value): string
{
    if (is_array($value)) {
        foreach ($value as $key => $item) {
            if ($key === 'channelId' && is_string($item) && preg_match('/^UC[\w-]+$/', $item)) {
                return $item;
            }
            $result = extractChannelIdFromJson($item);
            if ($result !== '') {
                return $result;
            }
        }
    }

    return '';
}

function fetchFeedItems(string $feedUrl): array
{
    $xml = fetchUrl($feedUrl);
    if ($xml === null) {
        return [];
    }

    return parseFeedXml($xml);
}

function parseFeedXml(string $xml): array
{
    libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA);
    if ($doc === false) {
        return [];
    }

    $namespaces = $doc->getNamespaces(true);
    $items = [];

    foreach ($doc->entry as $entry) {
        $title = trim((string)$entry->title);
        $published = trim((string)$entry->published);
        $link = '';

        foreach ($entry->link as $linkEntry) {
            $attrs = $linkEntry->attributes();
            if (isset($attrs['rel']) && (string)$attrs['rel'] === 'alternate') {
                $link = (string)$attrs['href'];
                break;
            }
        }

        if ($link === '' && isset($entry->link[0])) {
            $linkAttrs = $entry->link[0]->attributes();
            $link = isset($linkAttrs['href']) ? (string)$linkAttrs['href'] : '';
        }

        $videoId = '';
        if (isset($namespaces['yt'])) {
            $yt = $entry->children($namespaces['yt']);
            if (isset($yt->videoId)) {
                $videoId = (string)$yt->videoId;
            }
        }

        if ($videoId === '' && isset($entry->videoId)) {
            $videoId = (string)$entry->videoId;
        }

        $thumbnail = '';
        if (isset($namespaces['media'])) {
            $media = $entry->children($namespaces['media']);
            if (isset($media->thumbnail)) {
                $thumbAttrs = $media->thumbnail->attributes();
                if (isset($thumbAttrs['url'])) {
                    $thumbnail = (string)$thumbAttrs['url'];
                }
            }
        }

        if ($thumbnail === '' && $videoId !== '') {
            $thumbnail = "https://i.ytimg.com/vi/{$videoId}/hqdefault.jpg";
        }

        if ($videoId !== '') {
            $items[] = [
                'id' => $videoId,
                'title' => $title,
                'link' => $link,
                'pubDate' => $published,
                'thumbnail' => $thumbnail,
            ];
        }
    }

    return $items;
}
