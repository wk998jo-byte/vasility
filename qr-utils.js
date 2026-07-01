/**
 * Local QR generation — no CDN required (uses scripts/vendor/qrcode-generator.js).
 */
(function () {
  function getGenerator() {
    if (typeof qrcode === 'function') return qrcode;
    if (typeof window.qrcode === 'function') return window.qrcode;
    return null;
  }

  function toDataURL(text, targetSize) {
    return Promise.resolve(toDataURLSync(text, targetSize));
  }

  function toDataURLSync(text, targetSize) {
    targetSize = targetSize || 400;
    var gen = getGenerator();
    if (!gen) {
      throw new Error('QR library not loaded');
    }
    var qr = gen(0, 'M');
    qr.addData(String(text));
    qr.make();
    var modules = qr.getModuleCount();
    var margin = 4;
    var cellSize = Math.max(2, Math.floor((targetSize - margin * 2) / modules));
    return qr.createDataURL(cellSize, margin);
  }

  window.sscQR = { toDataURL: toDataURL, toDataURLSync: toDataURLSync };
})();
