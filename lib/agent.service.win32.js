'use strict';

var nw = 'tellki-node-windows',
    path = require('path'),
    fs = require('fs');

try {
    require.resolve(nw);
    setup();
} catch (e) {
    console.error(nw + ' is not found, installing...');
    var npm = require("npm");
    npm.load({
        loaded: false
    }, function (err) {
        npm.commands.install(path.join(path.dirname(fs.realpathSync(__filename)), '../'), [nw], function (er, data) {
            if (er) {
                console.log(er);
                process.exit(-1);
            } else
                setup();
        });
        npm.on("log", function (message) {
            console.log(message);
        });
    });
}

function setup() {
    var service = require(nw).Service,
        invalid = true;

    var svc = new service({
        name: 'Tellki Agent',
        description: 'Tellki Agent for reading metrics and execute processes on remote clients',
        script: require('path').join(__dirname, 'agent.js'),
        env: {
            name: "ARGS",
            value: process.argv
        },
    });

    var id = function () {
        var idx = process.argv.indexOf('-id');
        svc.name += (idx > -1) ? '.' + process.argv[idx + 1] : '';
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
    }

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