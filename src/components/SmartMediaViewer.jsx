import React from 'react';

export function parseVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();

  // 1. YouTube (watch?v=, youtu.be/, shorts/, embed/)
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return {
      platform: 'YouTube',
      icon: '▶️',
      embedUrl: 'https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0&autoplay=0',
      originalUrl: url
    };
  }

  // 2. RuTube
  const rutubeMatch = url.match(/rutube\.ru\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/i);
  if (rutubeMatch && rutubeMatch[1]) {
    return {
      platform: 'RuTube',
      icon: '🔴',
      embedUrl: 'https://rutube.ru/play/embed/' + rutubeMatch[1] + '/',
      originalUrl: url
    };
  }

  // 3. Одноклассники (OK.ru)
  const okMatch = url.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/i);
  if (okMatch && okMatch[1]) {
    return {
      platform: 'Одноклассники',
      icon: '🟠',
      embedUrl: 'https://ok.ru/videoembed/' + okMatch[1],
      originalUrl: url
    };
  }

  // 4. ВКонтакте / VK Видео
  if (url.includes('vk.com/video_ext.php')) {
    return {
      platform: 'VK Видео',
      icon: '🔷',
      embedUrl: url,
      originalUrl: url
    };
  }
  const vkMatch = url.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);
  if (vkMatch && vkMatch[1] && vkMatch[2]) {
    return {
      platform: 'VK Видео',
      icon: '🔷',
      embedUrl: 'https://vk.com/video_ext.php?oid=' + vkMatch[1] + '&id=' + vkMatch[2],
      originalUrl: url
    };
  }

  // 5. Прямые видеофайлы (.mp4, .webm, .ogg)
  const isVideoExt = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
  const isUploadFile = url.startsWith('/uploads/') || url.startsWith('/api/files/');
  const isUploadVideo = isUploadFile && !/\.(pdf|doc|docx|zip|rar|jpg|png|webp)$/i.test(url);
  if (isVideoExt || isUploadVideo) {
    return {
      platform: 'Видеофайл',
      icon: '🎬',
      isDirectFile: true,
      originalUrl: url
    };
  }

  return null;
}

export default function SmartMediaViewer({ url, title, description }) {
  if (!url) return null;

  const videoInfo = parseVideoUrl(url);

  if (videoInfo) {
    return (
      <div style={{ margin: '10px 0', width: '100%' }}>
        {videoInfo.isDirectFile ? (
          <video
            controls
            src={videoInfo.originalUrl}
            style={{ width: '100%', maxHeight: 420, borderRadius: 8, background: '#000', display: 'block' }}
          />
        ) : (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#0f172a', borderRadius: 8, overflow: 'hidden' }}>
            <iframe
              src={videoInfo.embedUrl}
              title={title || videoInfo.platform}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
          padding: '8px 12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#475569' }}>
            <span>{videoInfo.icon}</span>
            <span style={{ fontWeight: 500 }}>{videoInfo.platform}</span>
          </div>
          <a
            href={videoInfo.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn small"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#1e293b',
              fontWeight: 500,
              padding: '6px 14px',
              borderRadius: 6
            }}
          >
            ↗ Открыть оригинал видео
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '14px 16px',
      margin: '10px 0',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🔗</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>{title || 'Внешний ресурс'}</div>
          {description && <div className="muted small" style={{ marginTop: 4 }}>{description}</div>}
          <div className="muted small" style={{ marginTop: 4, wordBreak: 'break-all' }}>{url}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn primary small"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          ↗ Перейти по ссылке
        </a>
      </div>
    </div>
  );
}
