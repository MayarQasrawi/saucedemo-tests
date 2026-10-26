// Every payload tries to set window.__xss, so we can tell if any of them actually ran
export const XSS_PAYLOADS = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=1">',
  '"><svg onload="window.__xss=1">',
  "'; window.__xss=1; //",
  'javascript:window.__xss=1',
];
