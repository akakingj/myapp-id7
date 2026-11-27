'use strict';
/**
 * demo/runsock.js - where a tool's socket under /run/ is in the MGU demo: the car's tools listen on /run/<tool>/<name>.sock;
 * here the demo's stand-in listens on a named pipe (Windows) or a short socket file in the temp folder, one per demo
 * (its process id: DEMO_PID), and demo/preload.js turns an app's connect to the /run/ path into a connect to it.
 */
const os = require('os');
const path = require('path');
module.exports = function runSocket(p, pid) {
    const name = String(p).replace(/^\/run\//, '').replace(/[^A-Za-z0-9._-]+/g, '-');
    return process.platform === 'win32' ? '\\\\.\\pipe\\mgu-demo-' + pid + '-' + name : path.join(os.tmpdir(), 'mgu-demo-' + pid + '-' + name);
};
