'use strict';

var nw = 'node-windows', nl = 'node-linux',
    nwv = nw + '@0.1.7', nlv = nl + '@0.1.2';

var $n = (process.platform === 'win32' ? nw : nl),
    $nv = (process.platform === 'win32' ? nwv : nlv);

var path = require('path'), fs = require('fs');

try {
    require.resolve($n);
    install();
} catch (e) {
    console.error($nv + ' is not found, installing...');
    var npm = require("npm");
    npm.load({
        loaded: false
    }, function (err) {
        npm.commands.install(path.join(path.dirname(fs.realpathSync(__filename)), '../'), [$nv], function (er, data) {
            if (er) {
                console.log(er);
                process.exit(-1);
            } else
                install();
        });
        npm.on("log", function (message) {
            console.log(message);
        });
    });
}

function install() {
    var lib = require($n),
        service = lib.Service,
        invalid = true;

    // Create a new service object
    var svc = new service({
        name: 'Tellki-Agent',
        description: 'Tellki Agent for reading metrics and execute processes on remote clients',
        script: require('path').join(__dirname, 'agent.js'),
        env: {
            name: "ARGS",
            value: process.argv
        },
        maxRetries: 0,
        maxRestarts: 1
    });

    var id = function () {
        var idx = process.argv.indexOf('-id');
        svc.name += (idx > -1) ? '-' + process.argv[idx + 1] : '';
    }

    if (process.argv.length > 2) {
        id();
        for (var i = 2; i < process.argv.length; i++) {
            switch (process.argv[i]) {
                case '-start':
                    svc.start();
                    svc.on('start', function () {
                        console.log(svc.name + ' started!');
                    });
                    invalid = false;
                    break;
                case '-stop':
                    svc.stop();
                    svc.on('stop', function () {
                        console.log(svc.name + ' stopped!');
                    });
                    invalid = false;
                    break;
                case '-install':
                    svc.install();
                    svc.on('alreadyinstalled', function () {
                        console.log('This service is already installed.');
                    });
                    svc.on('start', function () {
                        console.log(svc.name + ' started!');
                        //Register for autostart
                        if (process.platform === 'linux') {
                            autostart('tellkiagent');
                        }
                    });
                    svc.on('install', function () {
                        svc.start();
                    });
                    invalid = false;
                    break;
                case '-uninstall':
                    svc.uninstall();
                    svc.on('uninstall', function () {
                        console.log(!svc.exists ? 'Uninstall complete.' : 'Uninstall failed.');
                    });
                    invalid = false;
                    break;
            }
        }
    } else
        invalid = true;

    if (invalid) {
        console.log('Invalid parameters!');
        console.log('Options:');
        console.log('[-start] [-id]');
        console.log('[-stop] [-id]');
        console.log('[-install (parameters)]');
        console.log('[-uninstall] [-id]');
        process.exit(-1);
    }
}

function autostart(svc) {
    var options = {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 200 * 1024,
        killSignal: 'SIGTERM',
        env: process.env
    };
    var exec = require('child_process').exec;
    var child = exec('update-rc.d ' + svc + ' defaults', options);
    var resp = "";

    child.stdout.on('data', function (buffer) {
        resp += buffer.toString();
    });
    child.on('close', function (code) {
        if (code !== 0) {
            console.log('Process exited with code: ' + code);
        } else {

        }
    });
    child.on('error', function (e) {
        console.log('Caught exception: ' + e);
    });
}