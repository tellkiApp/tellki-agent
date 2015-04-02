'use strict';
var fs = require('fs'),
	path = require('path'),
	agentFile = path.join(path.dirname(fs.realpathSync(__filename)), 'agent.client.js'),
	agentDate = null,
	agentProcess = null,
    retryMax = 7, retry = 0, update = false,
    args = process.argv.splice(2, process.argv.length + 2),
    id = '',
	launch = function () {
	    var child = require('child_process').fork(agentFile, args, { env: process.env, execArgv: ['--expose-gc'] });
	    child.on('exit', function (code) {
	        if (code === 1 || code === 8) { //Uncaught Fatal Exception
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
        writePID(id, agentProcess.pid);
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
                agentProcess.kill('SIGINT');
                agentProcess = null;
                update = true;
			    start();
            }
            }));
        }, 60000);
    },
    writePID = function (id, childPID) {
        var pid = process.pid + ' ' + childPID;
        fs.writeFile(path.join(path.dirname(fs.realpathSync(__filename)), '../cfg/agent.' + id + 'pid'), pid, function (err) {
            if (err) {
                console.log('Writing PID error: ' + err);
            }
        });
    }
/**************/
if (process.env["ARGS"] !== undefined) { //Is a service
    var _args = process.env["ARGS"].split(',');
    args = _args.splice(3, _args.length + 3);
}
id = args.indexOf('-id') > -1 ? args[args.indexOf('-id') + 1] + '.' : '';
start();
checker();
process.on('SIGINT', function () {
    console.log('Terminating... SIGINT');
    process.exit(0);
});
process.on('SIGTERM', function () {
    console.log('Terminating... SIGTERM');
    process.exit(0);
});