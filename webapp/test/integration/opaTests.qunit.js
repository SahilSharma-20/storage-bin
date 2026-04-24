/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["sbin/zppstoragebin/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
