'use strict';
var fs = require('fs'),
    agentFile = 'agent.client.js', mtime = '', PID = null,
    func = {
        lauch: function (cmd) {
            var child = require('child_process').spawn(cmd.cmd, cmd.args, { env: process.env });
            child.stdout.on('data', function (buffer) {
                process.stdout.write(buffer.toString('utf-8'));
            });
            child.stderr.on('data', function (data) {
                process.stdout.write(data.toString());
            });
            child.on('exit', function (code) {
                if (code !== null) {
                    process.stdout.write('Process exited with code: ' + code);
                    process.exit(code);
                }
            });
            child.on('error', function (e) {
                process.stdout.write('Caught exception: ' + e);
            });
            return child;
        },
        start: function (file) {
            var args = ['--expose-gc', agentFile];
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