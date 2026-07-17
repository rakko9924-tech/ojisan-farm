/* services.js — ネイティブ連携（AdMob広告 + StoreKit課金）。
   Web(非ネイティブ)では何もしない。game.js より前に読み込む。
   ⚠️ AdMob実IDを入れたら ADS_READY を true にする（テストID/未設定のまま公開しない）。*/
(function () {
  'use strict';
  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

  // ── AdMob 実ID（siosen323 / pub-1975437480047330）──────────────
  var AD = {
    interstitial: 'ca-app-pub-1975437480047330/2924976962',
    rewarded:     'ca-app-pub-1975437480047330/8472817113',
  };
  var ADS_READY = true;    // 実ユニットID設定済み
  var AD_TESTING = false;  // 本番は必ず false

  // 非バンドルJSでは Plugins.AdMob を優先（registerPlugin は undefined のことがある）
  function getAdMob() {
    if (!Cap) return null;
    var P = (Cap.Plugins && Cap.Plugins.AdMob) || null;
    if (P) return P;
    if (typeof Cap.registerPlugin === 'function') { try { return Cap.registerPlugin('AdMob'); } catch (e) {} }
    return null;
  }
  var AdMob = isNative ? getAdMob() : null;
  var interReady = false, rewardReady = false, attDone = false;

  function initAds() {
    if (!isNative || !AdMob || !ADS_READY) return;
    setTimeout(function () {
      Promise.resolve()
        .then(function () { return AdMob.initialize({ initializeForTesting: AD_TESTING }); })
        .then(prepInter).catch(function () {})
        .then(prepReward).catch(function () {});
    }, 800);
  }
  function prepInter() { if (!AdMob) return; return AdMob.prepareInterstitial({ adId: AD.interstitial, isTesting: AD_TESTING }).then(function () { interReady = true; }).catch(function () {}); }
  function prepReward() { if (!AdMob) return; return AdMob.prepareRewardVideoAd({ adId: AD.rewarded, isTesting: AD_TESTING }).then(function () { rewardReady = true; }).catch(function () {}); }

  // ATT は必ず「初回ユーザータップ」起点で（起動直後に呼ぶと無言で denied になる）
  function requestATT() {
    if (attDone || !AdMob) return; attDone = true;
    try { if (AdMob.requestTrackingAuthorization) AdMob.requestTrackingAuthorization(); } catch (e) {}
  }

  // リワード広告: cb(true=報酬付与 / false=未視聴)。未準備・Web時は fail-open で true。
  function rewarded(cb) {
    if (!isNative || !AdMob || !ADS_READY || !rewardReady) { cb && cb(true); return; }
    var got = false, done = false;
    var l1 = AdMob.addListener('onRewardedVideoAdReward', function () { got = true; });
    var l2 = AdMob.addListener('onRewardedVideoAdDismissed', function () { finish(); });
    function finish() { if (done) return; done = true; try { l1 && l1.remove && l1.remove(); l2 && l2.remove && l2.remove(); } catch (e) {} cb && cb(got); rewardReady = false; prepReward(); }
    AdMob.showRewardVideoAd().catch(function () { finish(); });
    setTimeout(function () { if (!done) finish(); }, 60000);
  }

  // インタースティシャル: 次フレーム描画後に表示（WKWebView固まり対策）
  function interstitial(cb) {
    if (!isNative || !AdMob || !ADS_READY || Ads.removed || !interReady) { cb && cb(); return; }
    var done = false;
    function fin() { if (done) return; done = true; try { l && l.remove && l.remove(); } catch (e) {} cb && cb(); interReady = false; prepInter(); }
    var l = AdMob.addListener('onInterstitialAdDismissed', fin);
    requestAnimationFrame(function () { requestAnimationFrame(function () { AdMob.showInterstitial().catch(fin); }); });
    setTimeout(fin, 8000);
  }

  // ── 広告削除の状態（真偽は StoreKit）─────────────────────────
  var Ads = {
    removed: false,
    setRemoved: function (v) { Ads.removed = !!v; if (v && window.Native && typeof Native.onAdsRemoved === 'function') Native.onAdsRemoved(); },
  };

  // ── IAP（cordova-plugin-purchase / CdvPurchase）──────────────
  var Purchases = {
    PRODUCT: 'com.raito.ojisanfarm.removeads',
    price: '¥500', _store: null, _pending: null,
    init: function () {
      if (!isNative) return; var self = this;
      function setup() {
        var CP = window.CdvPurchase; if (!CP || self._store) return;
        var store = self._store = CP.store; var PT = CP.ProductType, PL = CP.Platform;
        store.register([{ id: self.PRODUCT, type: PT.NON_CONSUMABLE, platform: PL.APPLE_APPSTORE }]);
        store.when()
          .productUpdated(function (p) { if (p.id === self.PRODUCT) { if (p.pricing && p.pricing.price) self.price = p.pricing.price; if (p.owned) Ads.setRemoved(true); } })
          .approved(function (t) { t.verify(); })
          .verified(function (r) { r.finish(); })
          .finished(function (t) { (t.products || []).forEach(function (p) { if (p.id === self.PRODUCT) { Ads.setRemoved(true); if (self._pending) { self._pending.resolve(true); self._pending = null; } } }); });
        store.error(function (e) { if (self._pending) { self._pending.reject(e); self._pending = null; } });
        store.initialize([PL.APPLE_APPSTORE]);
      }
      document.addEventListener('deviceready', setup, false);
      if (document.readyState !== 'loading') setTimeout(setup, 0); else document.addEventListener('DOMContentLoaded', setup);
    },
    buy: function () {
      var self = this;
      if (!isNative || !self._store) return Promise.resolve('web');
      return new Promise(function (res, rej) {
        self._pending = { resolve: res, reject: rej };
        try { var off = self._store.get(self.PRODUCT).getOffer(); self._store.order(off); }
        catch (e) { self._pending = null; rej(e); }
      });
    },
    restore: function () { if (!isNative || !this._store) return Promise.resolve(); return this._store.restorePurchases(); },
  };

  window.Native = {
    isNative: isNative,
    initAds: initAds, requestATT: requestATT,
    rewarded: rewarded, interstitial: interstitial,
    ads: Ads, purchases: Purchases,
    onAdsRemoved: null,
  };
  Purchases.init();
})();
