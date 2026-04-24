sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Item",
    "sbin/zppstoragebin/model/BinData"
], function (Controller, MessageBox, MessageToast, Item, BinData) {
    "use strict";

    /* ── Color palette ─────────────────────────────────────── */
    var COLOR_MAP = {
        "Gray":          "#9E9E9E",
        "Yellow":        "#FFEE58",
        "Light Pink":    "#F48FB1",
        "Magenta":       "#CE93D8",
        "Orange":        "#FFA726",
        "Tan":           "#D2B48C",
        "Light Cyan":    "#80DEEA",
        "Beige":         "#F5F5DC",
        "Red":           "#EF5350",
        "Purple":        "#AB47BC",
        "Olive":         "#8D9B0C",
        "Sky Blue":      "#64B5F6",
        "Green":         "#66BB6A",
        "RedOrange":     "#FF5722",
        "Light Yellow":  "#FFF59D",
        "Deep Sky Blue": "#29B6F6",
        "Dark Blue":     "#283593",
        "Dark Gray":     "#546E7A"
    };

    var DARK_TEXT_COLORS = {
        "Gray": true, "Purple": true, "Olive": true, "Dark Blue": true,
        "Dark Gray": true, "Red": true, "RedOrange": true, "Magenta": true
    };

    /* ── Grid geometry ─────────────────────────────────────── */
    var BIN_W  = 63;   // px width of one bin box
    var BIN_H  = 26;   // px height of one bin box
    var X_STEP = 66;   // px per X-coordinate unit-of-15
    var Y_STEP = 29;   // px per Y-coordinate unit-of-3
    var MAX_Y  = 96;

    /* ── Controller ────────────────────────────────────────── */
    return Controller.extend("sbin.zppstoragebin.controller.Layout", {

        _allBins:         [],
        _filteredBins:    [],
        _suggestedBinId:  null,
        _zoomLevel:       1.0,
        _batchId:         "",
        _filtersReady:    false,
        _clickHandlerSet: false,

        /* ── Lifecycle ──────────────────────────────────────── */
        onInit: function () {
            this._allBins = BinData;

            this.getOwnerComponent()
                .getRouter()
                .getRoute("RouteLayout")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            this._batchId = decodeURIComponent(
                oEvent.getParameter("arguments").batchId || ""
            );

            // Update page title
            this.byId("layoutPage").setTitle("Layout — " + this._batchId);

            // Reset state
            this._zoomLevel = 1.0;
            this.byId("zoomLevel").setText("100%");
            this.byId("filterStorageType").setSelectedKey("");
            this.byId("filterColor").setSelectedKey("");
            this.byId("filterSection").setSelectedKey("");

            // Suggest a bin
            this._computeSuggestion();

            // Populate filter dropdowns once
            if (!this._filtersReady) {
                this._populateFilters();
                this._buildLegend();
                this._filtersReady = true;
            }

            // Full render
            this._filteredBins = this._allBins.slice();
            this._renderLayout();
        },

        /* ── Suggestion logic ───────────────────────────────── */
        _computeSuggestion: function () {
            // Prefer FG (finished goods) bins in AC → CD → DE → EF order
            var candidates = this._allBins.filter(function (b) {
                return b.section === "FG";
            });
            if (!candidates.length) {
                candidates = this._allBins.filter(function (b) {
                    return b.color !== "Gray";
                });
            }

            // Deterministic pick based on batchId string
            var idx = 0;
            if (this._batchId && candidates.length) {
                var hash = 0;
                for (var i = 0; i < this._batchId.length; i++) {
                    hash = (hash * 31 + this._batchId.charCodeAt(i)) >>> 0;
                }
                idx = hash % candidates.length;
            }

            this._suggestedBinId = candidates.length
                ? candidates[idx].binId
                : "AC58F";

            this.byId("suggestionText").setText(
                "Suggested: Drop to \u2192 " + this._suggestedBinId +
                "   (Highlighted below — you can still select any bin)"
            );
        },

        /* ── Filter dropdown population ─────────────────────── */
        _populateFilters: function () {
            var colorSet   = {};
            var sectionSet = {};
            this._allBins.forEach(function (b) {
                colorSet[b.color]     = true;
                sectionSet[b.section] = true;
            });

            var oColorSel   = this.byId("filterColor");
            var oSectionSel = this.byId("filterSection");

            oColorSel.removeAllItems();
            oColorSel.addItem(new Item({ key: "", text: "All Colours" }));
            Object.keys(colorSet).sort().forEach(function (c) {
                oColorSel.addItem(new Item({ key: c, text: c }));
            });

            oSectionSel.removeAllItems();
            oSectionSel.addItem(new Item({ key: "", text: "All Sections" }));
            Object.keys(sectionSet).sort().forEach(function (s) {
                oSectionSel.addItem(new Item({ key: s, text: s }));
            });
        },

        /* ── Color legend ───────────────────────────────────── */
        _buildLegend: function () {
            var oLegend  = this.byId("legendBar");
            var seen     = {};
            var oHtml    = "";
            this._allBins.forEach(function (b) {
                if (!seen[b.color]) {
                    seen[b.color] = true;
                    var bg  = COLOR_MAP[b.color] || "#9E9E9E";
                    var txt = DARK_TEXT_COLORS[b.color] ? "#FFF" : "#212121";
                    oHtml  += "<span class='sbinLegendItem' style='background:" + bg +
                              ";color:" + txt + "'>" + b.color + "</span>";
                }
            });

            // Inject legend via sap.ui.core.HTML
            var sap = window.sap;
            if (sap && sap.ui && sap.ui.core && sap.ui.core.HTML) {
                var oLegendHtml = new sap.ui.core.HTML({
                    content: "<div class='sbinLegendWrap'>" + oHtml + "</div>",
                    sanitizeContent: false
                });
                oLegend.addItem(oLegendHtml);
            }
        },

        /* ── Main render ────────────────────────────────────── */
        _renderLayout: function () {
            var bins        = this._filteredBins;
            var suggestedId = this._suggestedBinId;
            var allBins     = this._allBins;

            // Build a quick lookup of filtered bin IDs
            var filteredMap = {};
            bins.forEach(function (b) { filteredMap[b.binId] = true; });

            // Canvas size
            var canvasW = (495 / 15) * X_STEP + BIN_W + 40;
            var canvasH = (MAX_Y / 3) * Y_STEP + BIN_H + 40;

            var parts = [
                '<div id="sbinBinGrid" style="position:relative;width:',
                canvasW, 'px;height:', canvasH, 'px;">'
            ];

            // Storage-type row separators
            var bands = [
                { label: "AC", yStart: 81, yEnd: 96, bg: "rgba(21,101,192,0.06)" },
                { label: "CD", yStart: 55, yEnd: 70, bg: "rgba(46,125,50,0.06)"  },
                { label: "DE", yStart: 29, yEnd: 44, bg: "rgba(230,81,0,0.06)"   },
                { label: "EF", yStart: 0,  yEnd: 18, bg: "rgba(136,14,79,0.06)"  }
            ];

            bands.forEach(function (band) {
                var top  = Math.round(((MAX_Y - band.yEnd) / 3) * Y_STEP);
                var h    = Math.round(((band.yEnd - band.yStart) / 3) * Y_STEP) + BIN_H + 6;
                parts.push(
                    '<div style="position:absolute;left:0;top:', top, 'px;',
                    'width:', canvasW, 'px;height:', h, 'px;',
                    'background:', band.bg, ';pointer-events:none;"></div>',
                    '<div class="sbinRowLabel" style="position:absolute;left:4px;top:',
                    top + 4, 'px;">', band.label, '</div>'
                );
            });

            // Render all 850 bins
            allBins.forEach(function (bin) {
                var px          = Math.round((bin.x / 15) * X_STEP);
                var py          = Math.round(((MAX_Y - bin.y) / 3) * Y_STEP);
                var isFiltered  = filteredMap[bin.binId] === true;
                var isSuggested = bin.binId === suggestedId;
                var bgColor     = COLOR_MAP[bin.color] || "#9E9E9E";
                var textColor   = DARK_TEXT_COLORS[bin.color] ? "#FFF" : "#212121";
                var opacity     = isFiltered ? "1" : "0.12";
                var cls         = "sbinBinCell";
                if (isSuggested) { cls += " sbinBinSuggested"; }
                if (!isFiltered) { cls += " sbinBinDimmed";    }

                parts.push(
                    '<div class="', cls, '"',
                    ' data-binid="', bin.binId, '"',
                    ' data-filtered="', isFiltered ? "1" : "0", '"',
                    ' style="',
                    'left:', px, 'px;',
                    'top:', py, 'px;',
                    'width:', BIN_W, 'px;',
                    'height:', BIN_H, 'px;',
                    'background-color:', bgColor, ';',
                    'color:', textColor, ';',
                    'opacity:', opacity, ';',
                    '">',
                    '<span class="sbinBinId">', bin.binId, '</span>',
                    '<span class="sbinBinType">', bin.storageType, '</span>',
                    '</div>'
                );
            });

            parts.push('</div>');

            this.byId("binLayout").setContent(parts.join(""));
            this._attachClickHandler();
            setTimeout(function () {
                if (this._suggestedBinId) {
                    var el = document.querySelector('[data-binid="' + this._suggestedBinId + '"]');
                    if (el) {
                        el.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                            inline: "center"
                        });
                    }
                }
            }.bind(this), 200);
        },

        /* ── Click handler via event delegation ─────────────── */
        _attachClickHandler: function () {
            var that = this;
            setTimeout(function () {
                var oGrid = document.getElementById("sbinBinGrid");
                if (!oGrid) { return; }

                oGrid.onclick = function (e) {
                    var el = e.target;
                    // Walk up to find a bin cell
                    while (el && el !== oGrid) {
                        if (el.classList && el.classList.contains("sbinBinCell")) {
                            if (el.getAttribute("data-filtered") === "1") {
                                that._onBinClick(el.getAttribute("data-binid"));
                            }
                            return;
                        }
                        el = el.parentElement;
                    }
                };
            }, 150);
        },

        _onBinClick: function (sBinId) {
            var isSuggested = sBinId === this._suggestedBinId;
            var sMsg = isSuggested
                ? "Do you want to place material in bin " + sBinId + "?\n(This is the recommended bin)"
                : "Do you want to place material in bin " + sBinId + "?";

            MessageBox.confirm(sMsg, {
                title: "Confirm Bin Assignment",
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        MessageToast.show(
                            "✔  Successfully assigned material to bin " + sBinId,
                            { duration: 3000 }
                        );
                    }
                }
            });
        },

        /* ── Filter handler ─────────────────────────────────── */
        onFilter: function () {
            var sType    = this.byId("filterStorageType").getSelectedKey();
            var sColor   = this.byId("filterColor").getSelectedKey();
            var sSection = this.byId("filterSection").getSelectedKey();

            this._filteredBins = this._allBins.filter(function (b) {
                return (!sType    || b.storageType === sType)
                    && (!sColor   || b.color        === sColor)
                    && (!sSection || b.section      === sSection);
            });

            this._renderLayout();
        },

        /* ── Zoom handlers ──────────────────────────────────── */
        onZoomIn: function () {
            this._zoomLevel = Math.min(+(this._zoomLevel + 0.15).toFixed(2), 2.5);
            this._applyZoom();
        },
        onZoomOut: function () {
            this._zoomLevel = Math.max(+(this._zoomLevel - 0.15).toFixed(2), 0.25);
            this._applyZoom();
        },
        onZoomReset: function () {
            this._zoomLevel = 1.0;
            this._applyZoom();
        },
        _applyZoom: function () {
            var grid = document.getElementById("sbinBinGrid");
            if (grid) {
                grid.style.transform       = "scale(" + this._zoomLevel + ")";
                grid.style.transformOrigin = "top left";
            }
            this.byId("zoomLevel").setText(Math.round(this._zoomLevel * 100) + "%");
        },
        

        /* ── Navigation ─────────────────────────────────────── */
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteHome");
        }
    });
});