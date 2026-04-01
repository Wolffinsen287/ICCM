<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=30');

const YOUTUBE_API_KEY = 'AIzaSyDVQIfdvxY-v86N1iCQ2c3dhCsOk-A5fLw';
const CHANNEL_HANDLE = 'iglesiacristianacongregaci5798';
const CHANNEL_ID = 'UCSPkWjU1D1CkEYNQo1WX8sA';
const CACHE_FILE = __DIR__ . '/youtube-feed.cache.json';
const CACHE_TTL = 300;
const MAX_RESULTS = 4;

$response = getYouTubeFeed();
echo json_encode($response, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
exit;

function getYouTubeFeed(): array
{
    $cached = loadCache();
    if ($cached !== null) {
        return $cached;
    }

    $items = fetchRecentVideos(CHANNEL_ID);
    $payload = [
        'channelUrl' => 'https://www.youtube.com/@' . CHANNEL_HANDLE,
        'items' => array_slice($items, 0, MAX_RESULTS),
    ];

    if (count($payload['items']) > 0) {
        saveCache($payload);
    }

    return $payload;
}

function loadCache(): ?array
{
    if (!is_readable(CACHE_FILE)) {
        return null;
    }

    $content = @file_get_contents(CACHE_FILE);
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

function saveCache(array $payload): void
{
    $data = [
        'expires' => time() + CACHE_TTL,
        'payload' => $payload,
    ];

    @file_put_contents(CACHE_FILE, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
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
        ],
    ]);

    return @file_get_contents($url, false, $context) ?: null;
}

function fetchRecentVideos(string $channelId): array
{
    $url = sprintf(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=%s&order=date&type=video&maxResults=%d&key=%s',
        rawurlencode($channelId),
        MAX_RESULTS,
        rawurlencode(YOUTUBE_API_KEY)
    );

    $json = fetchUrl($url);
    if ($json === null) {
        return [];
    }

    $data = json_decode($json, true);
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
        return [];
    }

    $items = [];
    foreach ($data['items'] as $entry) {
        if (!isset($entry['id']['videoId'], $entry['snippet'])) {
            continue;
        }

        $videoId = (string)$entry['id']['videoId'];
        $snippet = $entry['snippet'];
        $title = trim((string)($snippet['title'] ?? 'Video de YouTube'));
        $published = trim((string)($snippet['publishedAt'] ?? ''));
        $thumbnail = '';

        if (isset($snippet['thumbnails']['high']['url'])) {
            $thumbnail = $snippet['thumbnails']['high']['url'];
        } elseif (isset($snippet['thumbnails']['medium']['url'])) {
            $thumbnail = $snippet['thumbnails']['medium']['url'];
        } elseif (isset($snippet['thumbnails']['default']['url'])) {
            $thumbnail = $snippet['thumbnails']['default']['url'];
        }

        $items[] = [
            'id' => $videoId,
            'title' => $title,
            'link' => 'https://www.youtube.com/watch?v=' . $videoId,
            'pubDate' => $published,
            'thumbnail' => $thumbnail !== '' ? $thumbnail : 'https://i.ytimg.com/vi/' . $videoId . '/hqdefault.jpg',
        ];
    }

    return $items;
}
