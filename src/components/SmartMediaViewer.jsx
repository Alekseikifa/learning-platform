import React, { useState, useEffect } from 'react';
import { sanitizeRichHtml, htmlToPlainText } from './RichTextEditor.jsx';

export function parseVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  // Extract src if an iframe HTML snippet was pasted
  let url = rawUrl.trim();
  const iframeSrcMatch = url.match(/src=["']([^"']+)["']/i);
  if (iframeSrcMatch) {
    url = iframeSrcMatch[1].trim();
  }

  // 1. YouTube (watch?v=, youtu.be/, shorts/, embed/)
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return {
      platform: 'YouTube',
      key: 'youtube',
      icon: '▶️',
      color: '#ef4444',
      embedUrl: 'https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0&autoplay=0',
      originalUrl: url
    };
  }

  // 2. RuTube
  const rutubeMatch = url.match(/rutube\.ru\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/i);
  if (rutubeMatch && rutubeMatch[1]) {
    return {
      platform: 'RuTube',
      key: 'rutube',
      icon: '🔴',
      color: '#f97316',
      embedUrl: 'https://rutube.ru/play/embed/' + rutubeMatch[1] + '/',
      originalUrl: url
    };
  }

  // 3. Одноклассники (OK.ru)
  const okMatch = url.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/i);
  if (okMatch && okMatch[1]) {
    return {
      platform: 'Одноклассники',
      key: 'ok',
      icon: '🟠',
      color: '#f59e0b',
      embedUrl: 'https://ok.ru/videoembed/' + okMatch[1],
      originalUrl: url
    };
  }

  // 4. ВКонтакте / VK Видео
  // 4a. Прямой URL встраивания video_ext.php (vk.com или vkvideo.ru)
  if (url.includes('video_ext.php')) {
    let embedSrc = url.startsWith('//') ? 'https:' + url : url;
    if (!embedSrc.startsWith('http')) embedSrc = 'https://' + embedSrc;
    // Приводим к надежному домену vk.com/video_ext.php и добавляем hd=2
    embedSrc = embedSrc.replace(/vkvideo\.ru\/video_ext\.php/, 'vk.com/video_ext.php');
    if (!embedSrc.includes('hd=')) {
      embedSrc += (embedSrc.includes('?') ? '&' : '?') + 'hd=2';
    }
    return {
      platform: 'VK Видео',
      key: 'vk',
      icon: '🔷',
      color: '#2563eb',
      embedUrl: embedSrc,
      originalUrl: url
    };
  }

  // 4b. Ссылка на видео ВКонтакте / VK Видео
  const vkMatch = url.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);
  if (vkMatch && vkMatch[1] && vkMatch[2]) {
    // Извлекаем параметры доступа: list, hash, access_key, чтобы видео по закрытой ссылке или с хэшем воспроизводились
    let extraParams = '';
    try {
      const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
      const params = parsedUrl.searchParams;
      const allowed = ['list', 'hash', 'access_key'];
      const parts = [];
      for (const p of allowed) {
        if (params.has(p)) {
          parts.push(`${p}=${encodeURIComponent(params.get(p))}`);
        }
      }
      if (parts.length > 0) extraParams = '&' + parts.join('&');
    } catch (e) {
      const listM = url.match(/[?&]list=([^&#]+)/);
      if (listM) extraParams += `&list=${encodeURIComponent(listM[1])}`;
      const hashM = url.match(/[?&]hash=([^&#]+)/);
      if (hashM) extraParams += `&hash=${encodeURIComponent(hashM[1])}`;
      const keyM = url.match(/[?&]access_key=([^&#]+)/);
      if (keyM) extraParams += `&access_key=${encodeURIComponent(keyM[1])}`;
    }

    return {
      platform: 'VK Видео',
      key: 'vk',
      icon: '🔷',
      color: '#2563eb',
      embedUrl: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}${extraParams}&hd=2`,
      originalUrl: url
    };
  }

  // 5. Прямые видеофайлы (.mp4, .webm, .ogg)
  const isVideoExt = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
  const isUploadFile = url.startsWith('/uploads/') || url.startsWith('/api/files/');
  const isUploadVideo = isUploadFile && !/\.(pdf|doc|docx|zip|rar|jpg|png|webp|mp3|wav|ogg)$/i.test(url);
  if (isVideoExt || isUploadVideo) {
    return {
      platform: 'Видеофайл',
      key: 'file',
      icon: '🎬',
      color: '#10b981',
      isDirectFile: true,
      originalUrl: url
    };
  }

  return null;
}

export function getPlatformBadge(platform) {
  switch (platform?.toLowerCase()) {
    case 'vk':
    case 'vkontakte':
    case 'вконтакте':
      return { label: 'VK Видео', icon: '🔷', color: '#2563eb', bg: '#eff6ff' };
    case 'youtube':
    case 'ютуб':
      return { label: 'YouTube', icon: '▶️', color: '#dc2626', bg: '#fef2f2' };
    case 'rutube':
    case 'рутуб':
      return { label: 'RuTube', icon: '🔴', color: '#ea580c', bg: '#fff7ed' };
    case 'ok':
    case 'одноклассники':
      return { label: 'OK.ru', icon: '🟠', color: '#d97706', bg: '#fffbeb' };
    case 'file':
    case 'файл':
      return { label: 'Видеофайл', icon: '🎬', color: '#059669', bg: '#ecfdf5' };
    default:
      return { label: platform || 'Видео', icon: '🎥', color: '#475569', bg: '#f8fafc' };
  }
}

export default function SmartMediaViewer({
  url,
  sources = [],
  title,
  description,
  audio_url,
  synopsis,
  attachments = [],
}) {
  // Collect all distinct video sources
  const allVideoSources = React.useMemo(() => {
    const list = [];
    const seenUrls = new Set();

    // 1. If primary url is a video or provided
    if (url && typeof url === 'string' && url.trim()) {
      const parsed = parseVideoUrl(url);
      const isVideo = parsed !== null;
      list.push({
        url: url.trim(),
        platform: parsed ? parsed.platform : 'Основной источник',
        label: parsed ? parsed.platform : 'Основное видео',
        parsed,
        isVideo,
      });
      seenUrls.add(url.trim());
    }

    // 2. Append additional sources from sources array
    if (Array.isArray(sources)) {
      for (const s of sources) {
        if (!s || !s.url) continue;
        const sUrl = s.url.trim();
        if (seenUrls.has(sUrl)) continue;
        seenUrls.add(sUrl);

        const parsed = parseVideoUrl(sUrl);
        const pBadge = getPlatformBadge(s.platform || parsed?.key);
        list.push({
          url: sUrl,
          platform: s.platform || parsed?.platform || pBadge.label,
          label: s.label || parsed?.platform || pBadge.label,
          parsed,
          isVideo: parsed !== null || (s.platform && s.platform !== 'other'),
        });
      }
    }

    return list;
  }, [url, sources]);

  // Keep track of active video source with preference memory
  const [activeSourceIndex, setActiveSourceIndex] = useState(() => {
    try {
      const preferred = localStorage.getItem('student_preferred_video_platform');
      if (preferred && Array.isArray(allVideoSources) && allVideoSources.length > 0) {
        const foundIdx = allVideoSources.findIndex(s => {
          const key = (s.parsed?.key || s.platform || '').toLowerCase();
          return key.includes(preferred.toLowerCase());
        });
        if (foundIdx >= 0) return foundIdx;
      }
    } catch {}
    return 0;
  });

  // Adjust index when sources change or honor preferred platform
  useEffect(() => {
    try {
      const preferred = localStorage.getItem('student_preferred_video_platform');
      if (preferred && Array.isArray(allVideoSources) && allVideoSources.length > 0) {
        const foundIdx = allVideoSources.findIndex(s => {
          const key = (s.parsed?.key || s.platform || '').toLowerCase();
          return key.includes(preferred.toLowerCase());
        });
        if (foundIdx >= 0) {
          setActiveSourceIndex(foundIdx);
          return;
        }
      }
    } catch {}
    if (activeSourceIndex >= allVideoSources.length) {
      setActiveSourceIndex(0);
    }
  }, [allVideoSources]);

  const handleSelectSource = (idx) => {
    setActiveSourceIndex(idx);
    try {
      const src = allVideoSources[idx];
      const key = src?.parsed?.key || src?.platform;
      if (key) {
        localStorage.setItem('student_preferred_video_platform', key);
      }
    } catch {}
  };

  const activeSource = allVideoSources[activeSourceIndex] || allVideoSources[0];
  const videoInfo = activeSource?.parsed || (activeSource ? parseVideoUrl(activeSource.url) : null);

  const [copiedSynopsis, setCopiedSynopsis] = useState(false);
  const handleCopySynopsis = async () => {
    if (!synopsis) return;
    try {
      const isHtml = /<[a-z][\s\S]*>/i.test(synopsis);
      const htmlContent = isHtml ? synopsis : `<p>${synopsis.replace(/\n/g, '<br/>')}</p>`;
      const plainContent = isHtml ? htmlToPlainText(synopsis) : synopsis;

      if (typeof window !== 'undefined' && navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([plainContent], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainContent);
      }
      setCopiedSynopsis(true);
      setTimeout(() => setCopiedSynopsis(false), 2000);
    } catch (e) {
      navigator.clipboard?.writeText(synopsis);
      setCopiedSynopsis(true);
      setTimeout(() => setCopiedSynopsis(false), 2000);
    }
  };

  const hasMultipleSources = allVideoSources.length > 1;

  return (
    <div className="smart-lesson-viewer" style={{ width: '100%', margin: '12px 0' }}>
      {/* 1. Multi-source Switcher Bar */}
      {hasMultipleSources && (
        <div style={{
          marginBottom: 10,
          padding: '10px 14px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: 10,
          border: '1px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy, #1e293b)' }}>
              📺 Источник видео (выберите, откуда удобнее смотреть):
            </span>
            <span className="small muted" style={{ fontSize: 11 }}>
              💡 Если YouTube не работает, выберите ВКонтакте или RuTube
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allVideoSources.map((src, idx) => {
              const isActive = idx === activeSourceIndex;
              const badge = getPlatformBadge(src.platform || src.parsed?.key);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSource(idx)}
                  className="btn small"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: isActive ? (badge.color || '#2563eb') : '#ffffff',
                    color: isActive ? '#ffffff' : '#1e293b',
                    border: isActive ? `2px solid ${badge.color || '#2563eb'}` : '1px solid #cbd5e1',
                    boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{badge.icon}</span>
                  <span>{src.label || badge.label}</span>
                  {isActive && <span style={{ fontSize: 11, opacity: 0.9 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Video Player Frame */}
      {activeSource && (
        <div style={{ margin: '6px 0', width: '100%' }}>
          {videoInfo ? (
            <div>
              {videoInfo.isDirectFile ? (
                <video
                  controls
                  src={videoInfo.originalUrl}
                  style={{ width: '100%', maxHeight: 440, borderRadius: 8, background: '#000', display: 'block' }}
                />
              ) : (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#0f172a', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  <iframe
                    key={activeSource.url}
                    src={videoInfo.embedUrl}
                    title={title || activeSource.label || videoInfo.platform}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; screen-wake-lock; web-share"
                    referrerPolicy="no-referrer-when-downgrade"
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
                  <span style={{ fontWeight: 600 }}>{activeSource.label || videoInfo.platform}</span>
                  {hasMultipleSources && (
                    <span className="small muted">
                      (источник {activeSourceIndex + 1} из {allVideoSources.length})
                    </span>
                  )}
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
                    padding: '5px 12px',
                    borderRadius: 6
                  }}
                >
                  ↗ Открыть оригинал видео
                </a>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '14px 16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🔗</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>{title || 'Внешний ресурс'}</div>
                  {description && <div className="muted small" style={{ marginTop: 4 }}>{description}</div>}
                  <div className="muted small" style={{ marginTop: 4, wordBreak: 'break-all' }}>{activeSource.url}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <a
                  href={activeSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn primary small"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  ↗ Перейти по ссылке
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Audio Player Block */}
      {audio_url && (
        <div style={{
          marginTop: 14,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
          border: '1px solid #e9d5ff',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🎧</span>
              <b style={{ color: '#6b21a8', fontSize: 14 }}>Аудиоверсия / Подкаст урока</b>
            </div>
            <a
              href={audio_url}
              download
              target="_blank"
              rel="noreferrer"
              className="btn small ghost"
              style={{ fontSize: 11, padding: '3px 8px', color: '#7e22ce', borderColor: '#d8b4fe' }}
            >
              ⬇️ Скачать аудиофайл
            </a>
          </div>
          <audio controls src={audio_url} style={{ width: '100%', height: 40, borderRadius: 6 }} />
        </div>
      )}

      {/* 4. Text Synopsis Block (Конспект и тезисы) */}
      {synopsis && (
        <div style={{
          marginTop: 14,
          padding: '14px 16px',
          background: '#ffffff',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📝</span>
              <b style={{ fontSize: 14, color: 'var(--navy, #1e293b)' }}>Конспект и тезисы урока</b>
            </div>
            <button
              type="button"
              className="btn ghost small"
              onClick={handleCopySynopsis}
              style={{ fontSize: 12, padding: '3px 10px' }}
            >
              {copiedSynopsis ? '✓ Скопировано' : '📋 Копировать текст'}
            </button>
          </div>
          {(() => {
            const isHtml = /<[a-z][\s\S]*>/i.test(synopsis);
            const containerStyle = {
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.65,
              color: '#1e293b',
              background: '#fafafa',
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #f1f5f9',
              maxHeight: 520,
              overflowY: 'auto'
            };
            if (isHtml) {
              return (
                <div
                  className="rich-synopsis"
                  style={containerStyle}
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(synopsis) }}
                />
              );
            }
            return (
              <div style={{ ...containerStyle, whiteSpace: 'pre-wrap' }}>
                {synopsis}
              </div>
            );
          })()}
        </div>
      )}

      {/* 5. Attached Documents & Files */}
      {Array.isArray(attachments) && attachments.length > 0 && (
        <div style={{
          marginTop: 14,
          padding: '14px 16px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>📎</span>
            <b style={{ fontSize: 14, color: 'var(--navy, #1e293b)' }}>
              Прикреплённые документы и материалы к уроку ({attachments.length}):
            </b>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attachments.map((att, attIdx) => {
              if (!att || !att.url) return null;
              const isPdf = att.url.toLowerCase().includes('.pdf') || (att.title || '').toLowerCase().includes('pdf');
              const isDoc = att.url.toLowerCase().includes('.doc') || (att.title || '').toLowerCase().includes('doc');
              const isAudio = att.url.toLowerCase().match(/\.(mp3|wav|ogg)$/i);
              const icon = isPdf ? '📄' : isDoc ? '📝' : isAudio ? '🎧' : '📎';

              return (
                <div
                  key={attIdx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                        {att.title || att.file_name || `Документ ${attIdx + 1}`}
                      </div>
                      {att.file_size ? (
                        <div className="small muted" style={{ fontSize: 11 }}>
                          Размер: {(att.file_size / (1024 * 1024)).toFixed(2)} МБ
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn small ghost"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        textDecoration: 'none',
                        padding: '4px 10px',
                      }}
                    >
                      ↗ Открыть
                    </a>
                    <a
                      href={att.url}
                      download
                      className="btn small primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        textDecoration: 'none',
                        padding: '4px 10px',
                      }}
                    >
                      ⬇️ Скачать
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
