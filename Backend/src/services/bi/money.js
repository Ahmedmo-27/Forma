/**
 * Analytics money is integer piasters (1 EGP = 100 piasters).
 * Source documents still store JavaScript numbers in pounds.
 * Conversion is half-up to the nearest piaster and happens only at snapshot time.
 */

function toPiasters(pounds) {
    const n = Number(pounds);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
}

function netPiasters(pricePaid, refundAmount) {
    return Math.max(0, toPiasters(pricePaid) - toPiasters(refundAmount));
}

function formatPiasters(piasters) {
    const n = Math.round(Number(piasters) || 0);
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    const pounds = Math.floor(abs / 100);
    const fils = String(abs % 100).padStart(2, "0");
    const grouped = pounds.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${sign}EGP ${grouped}.${fils}`;
}

module.exports = { toPiasters, netPiasters, formatPiasters };
