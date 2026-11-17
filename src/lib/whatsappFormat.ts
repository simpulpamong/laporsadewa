import { esc } from './html';

/** Render the small, supported WhatsApp markdown subset as safe HTML. */
export function formatWhatsAppHtml(text: string): string {
  const blocks = text.split('```');
  return blocks.map((block, index) => {
    if (index % 2 === 1) return `<pre class="whatsapp-code"><code>${esc(block)}</code></pre>`;
    let html = esc(block);
    // Support both WhatsApp's *bold* and the commonly pasted **bold** form.
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<strong>$2</strong>');
    html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    html = html.replace(/~([^~\n]+)~/g, '<del>$1</del>');
    return html;
  }).join('').replace(/\n/g, '<br>');
}
