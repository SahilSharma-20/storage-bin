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

            that._loadZXing(function () {
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
        _loadZXing: function (onSuccess, onError) {
            if (window.ZXing) { onSuccess(); return; }

            var script  = document.createElement("script");
            script.src  = "https://cdnjs.cloudflare.com/ajax/libs/zxing-js/0.21.3/zxing.min.js";
            script.onload  = function () { onSuccess(); };
            script.onerror = function () { onError(); };
            document.head.appendChild(script);
        },

        /* ── Camera Overlay UI ───────────────────────────────── */
        _startCameraOverlay: function (oInput, oStatus) {
            var that = this;

            // Build overlay DOM
            var overlay = document.createElement("div");
            overlay.id  = "sbinScanOverlay";
            overlay.innerHTML = [
                '<div class="sbinScanModal">',
                '  <div class="sbinScanHeader">',
                '    <span class="sbinScanTitle">📷 Scan Barcode / QR Code</span>',
                '    <button class="sbinScanClose" id="sbinScanCloseBtn">✕</button>',
                '  </div>',
                '  <div class="sbinScanBody">',
                '    <video id="sbinScanVideo" playsinline autoplay muted></video>',
                '    <div class="sbinScanFrame">',
                '      <div class="sbinScanCornerTL"></div>',
                '      <div class="sbinScanCornerTR"></div>',
                '      <div class="sbinScanCornerBL"></div>',
                '      <div class="sbinScanCornerBR"></div>',
                '      <div class="sbinScanLine"></div>',
                '    </div>',
                '    <p class="sbinScanHint">Hold the barcode/QR code within the frame</p>',
                '  </div>',
                '</div>'
            ].join("");

            document.body.appendChild(overlay);

            var videoEl  = document.getElementById("sbinScanVideo");
            var closeBtn = document.getElementById("sbinScanCloseBtn");
            var stream, codeReader;

            function cleanup() {
                if (codeReader) {
                    try { codeReader.reset(); } catch (e) {}
                }
                if (stream) {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                }
                var el = document.getElementById("sbinScanOverlay");
                if (el) { el.parentNode.removeChild(el); }
                oStatus.setVisible(false);
            }

            closeBtn.onclick = cleanup;

            oStatus.setText("Requesting camera access…");

            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
                .then(function (mediaStream) {
                    stream        = mediaStream;
                    videoEl.srcObject = stream;

                    oStatus.setText("Scanning…");

                    // Use ZXing Multi-format reader
                    try {
                        codeReader = new ZXing.BrowserMultiFormatReader();
                        codeReader.decodeFromVideoElement(videoEl, function (result, err) {
                            if (result) {
                                var sText = result.getText().trim();
                                cleanup();
                                oInput.setValue(sText);
                                oInput.setValueState("None");
                                oStatus.setText("✔  Scanned: " + sText);
                                oStatus.setVisible(true);
                                MessageToast.show("Batch ID scanned: " + sText, { duration: 2500 });
                            }
                        });
                    } catch (e) {
                        cleanup();
                        MessageBox.error("Scanner initialisation failed: " + e.message);
                    }
                })
                .catch(function (err) {
                    cleanup();
                    var msg = err.name === "NotAllowedError"
                        ? "Camera permission was denied.\nPlease allow camera access in your browser settings."
                        : "Could not access the camera: " + err.message;
                    MessageBox.error(msg, { title: "Camera Error" });
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
        }
    });
});