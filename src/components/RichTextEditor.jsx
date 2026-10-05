import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Sanitize and clean HTML pasted from Word, Google Docs, Telegram, web pages.
 * Preserves safe structural markup (b, i, u, s, h3, h4, p, ul, ol, li, blockquote, a, br)
 * and strips proprietary inline styles, classes, XML, and scripts.
 */
export function sanitizeRichHtml(html) {
  if (!html) return '';

  // Parse HTML into a temporary DOM document
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove dangerous tags
  const dangerous = doc.querySelectorAll('script, style, link, meta, title, object, embed, iframe, form, input, button');
  dangerous.forEach(el => el.remove());

  // Allowed tags
  const allowedTags = new Set([
    'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE',
    'A', 'BR', 'HR', 'SPAN'
  ]);

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toUpperCase();

      // Normalize headings: H1/H2 -> H3, H5/H6 -> H4
      if (tag === 'H1' || tag === 'H2') {
        const h3 = doc.createElement('h3');
        while (node.firstChild) h3.appendChild(node.firstChild);
        node.parentNode?.replaceChild(h3, node);
        cleanNode(h3);
        return;
      }
      if (tag === 'H5' || tag === 'H6') {
        const h4 = doc.createElement('h4');
        while (node.firstChild) h4.appendChild(node.firstChild);
        node.parentNode?.replaceChild(h4, node);
        cleanNode(h4);
        return;
      }

      // If tag is not allowed, unwrap its contents
      if (!allowedTags.has(tag)) {
        const parent = node.parentNode;
        if (parent) {
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        }
        return;
      }

      // Strip dirty Word/Mso/Class/Style attributes
      const attrs = Array.from(node.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel')) {
          if (name === 'href') {
            // Keep safe links only
            const val = attr.value.trim();
            if (!val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('/') && !val.startsWith('#') && !val.startsWith('mailto:')) {
              node.removeAttribute('href');
            }
          }
          continue;
        }
        // Remove all other inline styles, classes, ms-word noise
        node.removeAttribute(attr.name);
      }

      // Recursively clean children
      const children = Array.from(node.childNodes);
      for (const child of children) {
        cleanNode(child);
      }
    }
  }

  Array.from(doc.body.childNodes).forEach(cleanNode);

  return doc.body.innerHTML.trim();
}

/**
 * Converts plain text to HTML preserving paragraphs and newlines
 */
export function plainTextToHtml(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Split by double newline for paragraphs, single newline for <br>
  const paragraphs = escaped.split(/\n\s*\n/);
  return paragraphs
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/**
 * Converts rich HTML to clean plain text for clipboard fallback
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Replace block elements with linebreaks
  const blocks = temp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote');
  blocks.forEach(b => {
    b.prepend(document.createTextNode('\n'));
    if (b.tagName === 'LI') b.prepend(document.createTextNode('• '));
    if (b.tagName === 'BLOCKQUOTE') b.prepend(document.createTextNode('« '));
  });

  const text = temp.textContent || temp.innerText || '';
  return text.trim().replace(/\n{3,}/g, '\n\n');
}

export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Введите тезисы лекции, план урока, ключевые места Писания или вставьте готовый конспект...',
  minHeight = 280,
  maxHeight = 520,
}) {
  const editorRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    h3: false,
    h4: false,
    ul: false,
    ol: false,
    quote: false,
  });
  const [stats, setStats] = useState({ chars: 0, words: 0 });
  const [copied, setCopied] = useState(false);

  // Sync value from props only when editor is not focused or content drastically differs
  useEffect(() => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    const targetHtml = value || '';

    // If incoming value is plain text without HTML tags, convert for display
    const isHtml = /<[a-z][\s\S]*>/i.test(targetHtml);
    const normalizedHtml = isHtml ? targetHtml : plainTextToHtml(targetHtml);

    if (currentHtml !== normalizedHtml && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = normalizedHtml;
      updateStats(editorRef.current);
    }
  }, [value]);

  const updateStats = (el) => {
    if (!el) return;
    const text = el.textContent || '';
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setStats({ chars, words });
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    updateStats(editorRef.current);
    checkFormatStates();
    if (onChange) {
      // If editor is completely empty, pass empty string
      const text = editorRef.current.textContent || '';
      if (!text.trim() && !editorRef.current.querySelector('img, hr')) {
        onChange('');
      } else {
        onChange(html);
      }
    }
  };

  // Inspect selection state to highlight toolbar buttons
  const checkFormatStates = useCallback(() => {
    if (typeof document === 'undefined') return;
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
        h3: document.queryCommandValue('formatBlock')?.toLowerCase() === 'h3',
        h4: document.queryCommandValue('formatBlock')?.toLowerCase() === 'h4',
        quote: document.queryCommandValue('formatBlock')?.toLowerCase() === 'blockquote',
      });
    } catch (e) {
      // Ignore queryCommandState errors
    }
  }, []);

  const runCommand = (cmd, arg = null) => {
    editorRef.current?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch (e) {
      console.warn('execCommand failed:', cmd, e);
    }
    handleInput();
  };

  const handleHeading = (tag) => {
    editorRef.current?.focus();
    const current = document.queryCommandValue('formatBlock')?.toLowerCase();
    if (current === tag.toLowerCase()) {
      runCommand('formatBlock', '<p>');
    } else {
      runCommand('formatBlock', `<${tag}>`);
    }
  };

  const handleBlockquote = () => {
    editorRef.current?.focus();
    const current = document.queryCommandValue('formatBlock')?.toLowerCase();
    if (current === 'blockquote') {
      runCommand('formatBlock', '<p>');
    } else {
      runCommand('formatBlock', '<blockquote>');
    }
  };

  const handleInsertScripture = () => {
    editorRef.current?.focus();
    const snippet = `<blockquote><strong>«Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного...»</strong> (Ин. 3:16)</blockquote><p><br></p>`;
    try {
      document.execCommand('insertHTML', false, snippet);
    } catch (e) {
      runCommand('insertText', '«Цитата Писания...» (Книга гл:ст)');
    }
    handleInput();
  };

  const handleLink = () => {
    editorRef.current?.focus();
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const url = prompt('Введите ссылку (URL):', 'https://');
    if (!url || url === 'https://') return;

    if (!selectedText) {
      document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    } else {
      runCommand('createLink', url);
    }
  };

  const handleClearFormat = () => {
    runCommand('removeFormat');
    runCommand('formatBlock', '<p>');
  };

  const handleClearAll = () => {
    if (!editorRef.current) return;
    if (window.confirm('Очистить весь текст конспекта?')) {
      editorRef.current.innerHTML = '';
      handleInput();
    }
  };

  const handleCopy = async () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const plain = htmlToPlainText(html);

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  // Smart Paste Handler: sanitize incoming rich text (Word, Google Docs, etc.)
  const handlePaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const html = clipboardData.getData('text/html');
    const text = clipboardData.getData('text/plain');

    if (html && html.trim()) {
      const sanitized = sanitizeRichHtml(html);
      try {
        document.execCommand('insertHTML', false, sanitized);
      } catch (err) {
        document.execCommand('insertText', false, text);
      }
    } else if (text) {
      const paragraphs = text.split(/\r?\n\r?\n/);
      if (paragraphs.length > 1) {
        const htmlParagraphs = paragraphs
          .map(p => `<p>${p.replace(/\r?\n/g, '<br/>')}</p>`)
          .join('');
        try {
          document.execCommand('insertHTML', false, htmlParagraphs);
        } catch (err) {
          document.execCommand('insertText', false, text);
        }
      } else {
        // Single paragraph, preserve line breaks
        const formatted = text.replace(/\r?\n/g, '<br/>');
        try {
          document.execCommand('insertHTML', false, formatted);
        } catch (err) {
          document.execCommand('insertText', false, text);
        }
      }
    }
    handleInput();
  };

  return (
    <div style={{
      border: '1px solid #BBF7D0',
      borderRadius: 10,
      background: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      {/* Visual Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
        padding: '8px 10px',
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0',
        userSelect: 'none',
      }}>
        {/* Formatting Buttons */}
        <button
          type="button"
          onClick={() => runCommand('bold')}
          title="Жирный текст (Ctrl+B)"
          style={{
            minWidth: 30,
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.bold ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.bold ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.bold ? '#1D4ED8' : '#1E293B',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Ж
        </button>

        <button
          type="button"
          onClick={() => runCommand('italic')}
          title="Курсив (Ctrl+I)"
          style={{
            minWidth: 30,
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.italic ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.italic ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.italic ? '#1D4ED8' : '#1E293B',
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          К
        </button>

        <button
          type="button"
          onClick={() => runCommand('underline')}
          title="Подчёркнутый (Ctrl+U)"
          style={{
            minWidth: 30,
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.underline ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.underline ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.underline ? '#1D4ED8' : '#1E293B',
            textDecoration: 'underline',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Ч
        </button>

        <button
          type="button"
          onClick={() => runCommand('strikeThrough')}
          title="Зачёркнутый"
          style={{
            minWidth: 30,
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.strike ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.strike ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.strike ? '#1D4ED8' : '#1E293B',
            textDecoration: 'line-through',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          З
        </button>

        <span style={{ width: 1, height: 20, background: '#CBD5E1', margin: '0 3px' }} />

        {/* Headings */}
        <button
          type="button"
          onClick={() => handleHeading('h3')}
          title="Крупный заголовок темы"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.h3 ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.h3 ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.h3 ? '#1D4ED8' : '#1E293B',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Заголовок H3
        </button>

        <button
          type="button"
          onClick={() => handleHeading('h4')}
          title="Подзаголовок пункта плана"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.h4 ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.h4 ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.h4 ? '#1D4ED8' : '#1E293B',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Пункт H4
        </button>

        <span style={{ width: 1, height: 20, background: '#CBD5E1', margin: '0 3px' }} />

        {/* Lists */}
        <button
          type="button"
          onClick={() => runCommand('insertUnorderedList')}
          title="Маркированный список"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.ul ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.ul ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.ul ? '#1D4ED8' : '#1E293B',
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>•</span> Список
        </button>

        <button
          type="button"
          onClick={() => runCommand('insertOrderedList')}
          title="Нумерованный список"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.ol ? '1px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFormats.ol ? '#EFF6FF' : '#FFFFFF',
            color: activeFormats.ol ? '#1D4ED8' : '#1E293B',
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 11 }}>1.</span> Нумерация
        </button>

        <button
          type="button"
          onClick={handleBlockquote}
          title="Блок цитаты / Место Писания"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: activeFormats.quote ? '1px solid #D97706' : '1px solid #CBD5E1',
            background: activeFormats.quote ? '#FFFBEB' : '#FFFFFF',
            color: activeFormats.quote ? '#B45309' : '#1E293B',
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 14 }}>❝</span> Цитата
        </button>

        <span style={{ width: 1, height: 20, background: '#CBD5E1', margin: '0 3px' }} />

        {/* Link & Helpers */}
        <button
          type="button"
          onClick={handleLink}
          title="Вставить ссылку"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#1E293B',
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          🔗 Ссылка
        </button>

        <button
          type="button"
          onClick={handleInsertScripture}
          title="Вставить шаблон для ключевого места Писания"
          style={{
            height: 28,
            padding: '2px 8px',
            borderRadius: 6,
            border: '1px solid #F59E0B',
            background: '#FEF3C7',
            color: '#92400E',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          📖 + Место Писания
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={handleClearFormat}
            title="Очистить стили выделенного текста"
            style={{
              height: 28,
              padding: '2px 8px',
              borderRadius: 6,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#64748B',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            🧹 Сброс стиля
          </button>
        </div>
      </div>

      {/* Editable Content Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyUp={checkFormatStates}
        onMouseUp={checkFormatStates}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{
          minHeight,
          maxHeight,
          overflowY: 'auto',
          padding: '14px 16px',
          outline: 'none',
          fontSize: 14,
          lineHeight: 1.65,
          color: '#0F172A',
          background: '#FFFFFF',
          fontFamily: 'inherit',
          position: 'relative',
        }}
        className="rich-text-editor-content"
      />

      {/* Editor Footer / Info Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: '#F8FAFC',
        borderTop: '1px solid #F1F5F9',
        fontSize: 12,
        color: '#64748B',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Слов: <b>{stats.words}</b></span>
          <span>Символов: <b>{stats.chars}</b></span>
          <span style={{ color: '#15803D', fontSize: 11 }}>
            ✓ Поддерживается вставка из Word / Docs с сохранением списков и форматирования
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleCopy}
            title="Скопировать весь конспект в буфер обмена с форматированием"
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 6,
              padding: '3px 9px',
              fontSize: 12,
              color: '#1E293B',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {copied ? '✓ Скопировано!' : '📋 Копировать'}
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            title="Очистить текст"
            style={{
              background: '#FFFFFF',
              border: '1px solid #FCA5A5',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 12,
              color: '#DC2626',
              cursor: 'pointer',
            }}
          >
            ✕ Очистить
          </button>
        </div>
      </div>
    </div>
  );
}
