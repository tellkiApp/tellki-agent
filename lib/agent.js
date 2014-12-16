'use strict';
var fs = require('fs'),
	path = require('path'),
	agentFile = path.join(path.dirname(fs.realpathSync(__filename)), 'agent.client.js'),
	mtime = '',
	PID = null,
	func = {
		lauch: function (cmd) {
			var child = require('child_process').fork(agentFile, cmd.args, { env: process.env, execArgv : ['--expose-gc'] });
			child.on('exit', function (code) { if (code !== null) process.exit(code); });
			child.on('error', function (e) { process.stdout.write('Caught exception: ' + e); });
			return child;
		},
		start: function (file) {
			fs.stat(file, function (err, stats) { mtime = stats.mtime.toJSON(); });
			PID = func.lauch({ cmd: 'node', args: process.argv });
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