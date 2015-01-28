'use strict';
var fs = require('fs'),
	path = require('path'),
	agentFile = path.join(path.dirname(fs.realpathSync(__filename)), 'agent.client.js'),
	mtime = '',
	PID = null,
	args = [],
	func = {
		lauch: function () {
			var child = require('child_process').fork(agentFile, args, { env: process.env, execArgv: ['--expose-gc'] });
			child.on('exit', function (code) { if (code !== null) process.exit(code); });
			child.on('error', function (e) { process.stdout.write('Caught exception: ' + e); });
			return child;
		},
		start: function () {
			fs.stat(agentFile, function (err, stats) { mtime = stats.mtime.toJSON(); });
			PID = func.lauch();
		},
		checker: function () {
			function check(mtime, callBack) {
				fs.stat(agentFile, function (err, stats) {
				    if (!err) {
				        callBack(mtime === stats.mtime.toJSON());
				    }
				});
			};
			setInterval(function () {
				if (check(mtime, function (dif) {
					if (!dif) {
					console.log('>Restarting<');
					PID.kill('SIGKILL');
					func.start();
				}
				}));
			}, 60000);
		}
	};
args = process.argv.splice(2, process.argv.length + 2);
func.start();
func.checker();