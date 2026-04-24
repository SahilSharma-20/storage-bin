sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sbin.zppstoragebin.controller.Home", {

        onInit: function () {
            // Pre-load BarcodeScanner library quietly
            sap.ui.require(["sap/ndc/BarcodeScanner"], function () {}, function () {
                // Not available in desktop browser — fallback handled in onScan
            });
        },

        /* ── Barcode / QR Scan ─────────────────────────────── */
        onScan: function () {
            var that    = this;
            var oInput  = this.byId("batchInput");
            var oStatus = this.byId("scanStatusText");

            // Try SAP native BarcodeScanner first (works on mobile Fiori Client)
            sap.ui.require(["sap/ndc/BarcodeScanner"], function (BarcodeScanner) {

                oStatus.setText("Opening camera…");
                oStatus.setVisible(true);

                BarcodeScanner.scan(
                    function (oResult) {
                        if (oResult && oResult.text) {
                            var sScanned = oResult.text.trim();
                            oInput.setValue(sScanned);
                            oInput.setValueState("None");
                            oStatus.setText("✔  Scanned: " + sScanned);
                            MessageToast.show("Batch ID scanned: " + sScanned, { duration: 2500 });
                        } else {
                            oStatus.setText("Scan cancelled.");
                        }
                    },
                    function (oError) {
                        oStatus.setVisible(false);
                        // SAP scanner failed → fall back to browser camera
                        that._openBrowserScanner();
                    },
                    {
                        prompt: "Point camera at Batch ID barcode or QR code"
                    }
                );

            }, function () {
                // sap/ndc/BarcodeScanner not available → use browser fallback
                that._openBrowserScanner();
            });
        },

        /* ── Browser Camera Fallback (desktop / dev) ────────── */
        _openBrowserScanner: function () {
            var that    = this;
            var oInput  = this.byId("batchInput");
            var oStatus = this.byId("scanStatusText");

            // Check for camera API availability
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                oStatus.setText("");
                oStatus.setVisible(false);
                MessageBox.information(
                    "Camera scanning is not supported in this browser.\n" +
                    "Please enter the Batch ID manually.",
                    { title: "Scanner Unavailable" }
                );
                return;
            }

            // Load ZXing barcode library from CDN dynamically
            oStatus.setText("Loading scanner…");
            oStatus.setVisible(true);

            that._loadQuagga(function () {
                that._startCameraOverlay(oInput, oStatus);
            }, function () {
                oStatus.setVisible(false);
                MessageBox.error(
                    "Could not load the scanning library.\nPlease check your network connection.",
                    { title: "Scanner Error" }
                );
            });
        },

        /* ── Load ZXing via CDN ──────────────────────────────── */
        // _loadZXing: function (onSuccess, onError) {
        //     if (window.ZXing) { onSuccess(); return; }

        //     var script  = document.createElement("script");
        //     script.src  = "https://cdnjs.cloudflare.com/ajax/libs/zxing-js/0.21.3/zxing.min.js";
        //     script.onload  = function () { onSuccess(); };
        //     script.onerror = function () { onError(); };
        //     document.head.appendChild(script);
        // },

        _loadQuagga: function (onSuccess, onError) {
    if (window.Quagga) { onSuccess(); return; }

    var script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js";
    script.onload = function () { onSuccess(); };
    script.onerror = function () { onError(); };

    document.head.appendChild(script);
},
        /* ── Camera Overlay UI ───────────────────────────────── */
        _startCameraOverlay: function (oInput, oStatus) {
    var that = this;

    var overlay = document.createElement("div");
    overlay.id = "sbinScanOverlay";
    overlay.innerHTML = [
        '<div class="sbinScanModal">',
        '  <div class="sbinScanHeader">',
        '    <span class="sbinScanTitle">📷 Scan Barcode / QR Code</span>',
        '    <button class="sbinScanClose" id="sbinScanCloseBtn">✕</button>',
        '  </div>',
        '  <div class="sbinScanBody">',
        '    <div id="sbinQuaggaContainer" style="width:100%; height:300px;"></div>',
        '    <div class="sbinScanFrame">',
        '      <div class="sbinScanCornerTL"></div>',
        '      <div class="sbinScanCornerTR"></div>',
        '      <div class="sbinScanCornerBL"></div>',
        '      <div class="sbinScanCornerBR"></div>',
        '      <div class="sbinScanLine"></div>',
        '    </div>',
        '    <p class="sbinScanHint">Hold the barcode within the frame</p>',
        '  </div>',
        '</div>'
    ].join("");

    document.body.appendChild(overlay);

    var closeBtn = document.getElementById("sbinScanCloseBtn");

    function cleanup() {
        try {
            if (window.Quagga) {
                Quagga.stop();
                Quagga.offDetected();
            }
        } catch (e) {}

        var el = document.getElementById("sbinScanOverlay");
        if (el) el.remove();

        oStatus.setVisible(false);
    }

    closeBtn.onclick = cleanup;

    oStatus.setText("Starting camera…");
    oStatus.setVisible(true);

    Quagga.init({
    inputStream: {
        type: "LiveStream",
        target: document.querySelector("#sbinQuaggaContainer"),
        constraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    },
    locator: {
        patchSize: "medium",   // 🔥 critical
        halfSample: true
    },
    numOfWorkers: navigator.hardwareConcurrency || 4, // 🔥 performance
    frequency: 10, // 🔥 scan attempts per second
    decoder: {
        readers: [
            "code_128_reader",   // most important
            "ean_reader",
            "ean_8_reader",
            "code_39_reader"
        ]
    },
    locate: false   // 🔥 VERY IMPORTANT (turn OFF)
}, function (err) {
        if (err) {
            cleanup();
            sap.m.MessageBox.error("Scanner init failed: " + err.message);
            return;
        }

        Quagga.start();
        oStatus.setText("Scanning…");
    });

    Quagga.onDetected(function (result) {
        var code = result.codeResult.code;

        if (code) {
            cleanup();

            oInput.setValue(code);
            oInput.setValueState("None");

            oStatus.setText("✔  Scanned: " + code);
            oStatus.setVisible(true);

            sap.m.MessageToast.show("Batch ID scanned: " + code, {
                duration: 2500
            });
        }
    });
},

        /* ── Submit ──────────────────────────────────────────── */
        onSubmit: function () {
            var oInput = this.byId("batchInput");
            var sBatch = (oInput.getValue() || "").trim();

            if (!sBatch) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Please enter a Batch ID.");
                MessageToast.show("Batch ID is required.");
                return;
            }

            oInput.setValueState("None");
            this.getOwnerComponent().getRouter().navTo("RouteLayout", {
                batchId: encodeURIComponent(sBatch)
            });
        },
      onOCRScan: function () {
    var oInput = this.byId("batchInput");
    var oStatus = this.byId("scanStatusText");

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.capture = "environment";

    fileInput.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) return;

        oStatus.setText("Processing image...");
        oStatus.setVisible(true);

        // Load Tesseract (only once)
        if (!window.Tesseract) {
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
            script.onload = runOCR;
            document.head.appendChild(script);
        } else {
            runOCR();
        }

        function runOCR() {
            Tesseract.recognize(
                file,
                "eng",
                {
                    logger: m => console.log(m)
                }
            ).then(({ data: { text } }) => {

                console.log("OCR RAW:", text);

                // 🔥 SIMPLE CLEANING (this is key)
                var cleaned = text
                    .replace(/\s+/g, "")
                    .replace(/[^A-Z0-9\-]/gi, "");

                console.log("CLEANED:", cleaned);

                // 🔥 RELAXED match (like earlier working version)
                var match = cleaned.match(/\d{5,}[A-Z0-9\-]*/);

                if (match) {
                    var result = match[0];

                    oInput.setValue(result);
                    oInput.setValueState("None");

                    oStatus.setText("✔ OCR: " + result);
                } else {
                    oStatus.setText("Try clearer image");
                }

            }).catch(err => {
                console.error(err);
                oStatus.setText("OCR failed");
            });
        }
    };

    fileInput.click();
}
    });
});