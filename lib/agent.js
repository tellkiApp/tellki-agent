'use strict';
var fs = require('fs'),
	path = require('path'),
	agentFile = path.join(path.dirname(fs.realpathSync(__filename)), 'agent.client.js'),
	agentDate = null,
	agentProcess = null,
    retryMax = 4, retry = 0, update = false,
    args = process.argv.splice(2, process.argv.length + 2),
	launch = function () {
	    var child = require('child_process').fork(agentFile, args, { env: process.env, execArgv: ['--expose-gc'] });
	    child.on('exit', function (code) {
	        if (code === 1) { //Uncaught Fatal Exception
	            console.log('>Restarting on Exception Failure<');
	            if (retry >= retryMax)
	                process.exit(code);
	            else {
	                retry++;
	                start();
	            }
	        } else
	            (!update) ?  process.exit(code) : update = true;
	    });
	    child.on('error', function (e) { console.log('Caught exception: ' + e); });
	    return child;
	},
    start = function () {
        fs.stat(agentFile, function (err, stats) { agentDate = stats.mtime.toJSON(); });
        agentProcess = launch();
    },
    checker = function () {
        function check(mtime, callBack) {
            fs.stat(agentFile, function (err, stats) {
                if (!err)
                    callBack(mtime === stats.mtime.toJSON());
            });
        };
        setInterval(function () {
            retry = 0;
            if (check(agentDate, function (dif) {
			    if (!dif) {
			    console.log('>Restarting on Update<');
			    agentProcess.kill('SIGKILL');
                agentProcess = null;
                update = true;
			    start();
            }
            }));
        }, 60000);
    }
/**************/
start();
checker();