// Escape user-derived text before interpolating it into outbound email HTML.
// Prevents HTML/content injection (e.g. an email local-part used as a display
// name carrying markup) from being rendered in recipients' inboxes.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
