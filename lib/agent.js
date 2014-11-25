'use strict';
var fs = require('fs'),
	path = require('path'),
    agentFile = path.join(path.dirname(fs.realpathSync(__filename)), 'agent.client.js'),
	mtime = '',
    PID = null,
    func = {
        lauch: function (cmd) {
            return require('child_process').fork(agentFile, cmd.args, { env: process.env });
        },
        start: function (file) {
            var args = [];
            if (process.argv.length > 2) {
                for (var i = 2; i < process.argv.length - 1; i++) {
                    switch (process.argv[i]) {
                        case '-id':
                            args.splice(args.length, 2, '-id', process.argv[i + 1]);
                            break;
                        case '-k':
                            args.splice(args.length, 2, '-k', process.argv[i + 1]);
                            break;
                        case '-tags':
                            args.splice(args.length, 2, '-tags', process.argv[i + 1]);
                            break;
                    }
                }
            }
            fs.stat(file, function (err, stats) {
                mtime = stats.mtime.toJSON();
            });
            PID = func.lauch({ cmd: 'node', args: args });
        },
        checker: function () {
            function check(file, mtime, callBack) {
                fs.stat(file, function (err, stats) {
                    if (err) process.exit(-1);
                    callBack(mtime === stats.mtime.toJSON());
                });
            };
            setInterval(function () {
                if (check(agentFile, mtime, function (dif) {
                    if (!dif) {
                    console.log('>Restarting<');
                    PID.kill('SIGKILL');
                    func.start(agentFile);
                }
                }));
            }, 60000);
        }
    };

func.start(agentFile);
func.checker();
