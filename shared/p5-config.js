// p5 1.10.0 registers device sensors even when a sketch does not use them.
// Its init hook runs before listeners are attached to the window.
// Opt in on a sketch's <html> element with data-p5-device-sensors="true".
p5.prototype.registerMethod('init', function () {
  if (document.documentElement.dataset.p5DeviceSensors === 'true') {
    return;
  }

  delete this._events.deviceorientation;
  delete this._events.devicemotion;
});
