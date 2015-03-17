'use strict';

var fs = require('fs'), path = require('path');

var isInstall = true;
var isInvalid = true;

if (process.argv.length > 2) {
	for (var i = 2; i < process.argv.length; i++) {
		switch (process.argv[i]) {
			case '-install':
				isInvalid = false;
				isInstall = true;
				runInstall();
				break;
				
			case '-uninstall':
				isInvalid = false;
				isInstall = false;
				runUninstall();
				break;
		}
	}
}

if (isInvalid) {
	console.log('Invalid parameters!');
	console.log('Options:');
	console.log('[-install (parameters)]');
	console.log('[-uninstall] [-id]');
	process.exit(-1);
}

var options = {
	serviceId : null,
	serviceName : 'tellki-agent{{ID}}',
	
	agentFile : 'agent.js',
	agentCheckFlag : '-check',
	agentIdFlag : '-id',
	agentPidFile : 'agent{{ID}}pid',
	agentStartCmd : 'tellkiagent{{ID}}',

	serviceFilePath : '/etc/init.d/{{SERVICE_NAME}}',
	serviceFilePathPermissions : '700',

	cmdService : 'sh {{SERVICE_FILE_PATH}} {{COMMAND}}',

	cmdUpdateRc : 'update-rc.d {{SERVICE_NAME}} defaults',
	cmdChkconfig : 'chkconfig --add {{SERVICE_NAME}}',
	cmdInsserv : 'insserv {{SERVICE_FILE_PATH}},start:lvl2,lvl3,lvl4,lvl5',
	cmdRcUpdate : 'rc-update add {{SERVICE_NAME}} default',
	
	cmdRemoveUpdateRc : 'update-rc.d -f {{SERVICE_NAME}} remove',
	cmdRemoveChkconfig : 'chkconfig --del {{SERVICE_NAME}}',
	cmdRemoveInsserv : 'insserv -r {{SERVICE_FILE_PATH}}',
	cmdRemoveRcUpdate : 'rc-update del {{SERVICE_NAME}} default'
};

function runInstall() {
	validateRootAccess(checkInstaledService);
}

function runUninstall() {
	validateRootAccess(stopService);
}

function validateRootAccess(callback) {
	var output = null;
	var exec = require('child_process').spawn('whoami', [], { env: process.env });
	exec.on('close', function(code) {			
		if (code === 0) {
			if (output === 'root') {
				callback();
			} else {
				console.log('permission denied: root access (e.g. sudo) is required');
				process.exit(1);
			}
		} else if (code === 127 || code === -1) {
			console.log('whoami: command not found');
			process.exit(1);
		} else {
			console.log('whoami: error executing command');
			process.exit(1);
		}
	});
	exec.stdout.on('data', function(data) {
		output = data.toString().trim();
	});
}

// ### Install methods

function checkInstaledService() {
	// Process arguments
	var args = process.argv.splice(2, process.argv.length + 2);
	for(var i = args.length - 1; i >= 0; i--) {
		if(args[i] === '-install' || args[i] === '-uninstall') {
		   args.splice(i, 1);
		}
	}
	// Get service ID
	options.serviceId = null;
	for (var i = 0; i < args.length; i++) {
		if (args[i] === options.agentIdFlag) {
			options.serviceId = args[i + 1];
			break;
		}
	}
	// Setup service name
	options.serviceName = (options.serviceId === null || options.serviceId === undefined)
		? options.serviceName.replace(/{{ID}}/g, '')
		: options.serviceName.replace(/{{ID}}/g, '.' + options.serviceId);
		
	// Check if the init file already exists
	options.serviceFilePath = options.serviceFilePath.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	fs.exists(options.serviceFilePath, function (exists) {
		if (exists) {
			console.log('tellki-agent: init file already exists: please run with -uninstall option first');
			process.exit(1);
		} else {
			activateAgent(args);
		}
	});
}

function activateAgent(args) {
	args.push(options.agentCheckFlag); // Add AGENT_CHECK_FLAG to arguments
	
	// Execute
	var agentFile = path.join(path.dirname(fs.realpathSync(__filename)), options.agentFile);
	
	var child = require('child_process').fork(agentFile, args, { env: process.env, execArgv: ['--expose-gc'] });
	child.on('exit', function (code) {
		if (code === 0) {
			processInitFile(args);
		} else {
			console.log('tellki-agent: error activating tellki-agent');
			process.exit(1);
		}
	});
}

function processInitFile(args) {
			
	// Setup agent pid file
	options.agentPidFile = (options.serviceId === null || options.serviceId === undefined)
		? options.agentPidFile.replace(/{{ID}}/g, '.')
		: options.agentPidFile.replace(/{{ID}}/g, '.' + options.serviceId + '.');
		
	// Setup start cmd
	options.agentStartCmd = (options.serviceId === null || options.serviceId === undefined)
		? options.agentStartCmd.replace(/{{ID}}/g, '')
		: options.agentStartCmd.replace(/{{ID}}/g, ' ' + options.agentIdFlag + ' ' + options.serviceId);

	// Setup replace vars
	var pathS = path.dirname(fs.realpathSync(__filename)) + '/../';
	var serviceNameS = options.serviceName;
	var pidFileS = options.agentPidFile;
	var startCmdS = options.agentStartCmd;
		
	// Replace vars
	var data = options.INIT_SCRIPT;
	data = data.replace(/{{PATH_S}}/g, pathS);
	data = data.replace(/{{SERVICE_NAME_S}}/g, serviceNameS);
	data = data.replace(/{{PIDFILE_S}}/g, pidFileS);
	data = data.replace(/{{STARTCMD_S}}/g, startCmdS);
	
	// Write init file to disk
	fs.writeFile(options.serviceFilePath, data, function(err) {
		if(err) {
			console.log('tellki-agent: error creating init file');
			process.exit(1);
		}
		setInitPermissions();
	});
}

function setInitPermissions() {	
	fs.chmod(options.serviceFilePath, options.serviceFilePathPermissions, function(err) {
		if(err) {
			console.log('tellki-agent: error setting init file permissions');
			process.exit(1);
		}
		registerWithUpdaterc();
	});
}

function registerWithUpdaterc() {
	// Run update-rc.d
	options.cmdUpdateRc = options.cmdUpdateRc.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	runRegister(options.cmdUpdateRc, function() { setService('start', finish); }, registerWithChkconfig);
}

function registerWithChkconfig() {
	// Run chkconfig
	options.cmdChkconfig = options.cmdChkconfig.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	runRegister(options.cmdChkconfig, function() { setService('start', finish); }, registerWithRcUpdate);
}

function registerWithRcUpdate() {
	// Run chkconfig
	options.cmdRcUpdate = options.cmdRcUpdate.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	runRegister(options.cmdRcUpdate, function() { setService('start', finish); }, registerWithInsserv);
}

function registerWithInsserv() {
	// Run insserv
	options.cmdInsserv = options.cmdInsserv.replace(/{{SERVICE_FILE_PATH}}/g, options.serviceFilePath);
	runRegister(options.cmdInsserv,
		function() { setService('start', finish); },
		function() {
			console.log('tellki-agent: unable to install tellki-agent service');
			process.exit(1);
		});
}

// ### Uninstall methods

function stopService() {
	// Get service ID
	var args = process.argv.splice(2, process.argv.length + 2);
	
	options.serviceId = null;
	for (var i = 0; i < args.length; i++) {
		if (args[i] === options.agentIdFlag) {
			options.serviceId = args[i + 1];
			break;
		}
	}
	
	options.serviceName = (options.serviceId === null || options.serviceId === undefined)
		? options.serviceName.replace(/{{ID}}/g, '')
		: options.serviceName.replace(/{{ID}}/g, '.' + options.serviceId);
		
	options.serviceFilePath = options.serviceFilePath.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	
	setService('stop', unregisterWithUpdaterc);
}

function unregisterWithUpdaterc() {
	// Run update-rc.d
	options.cmdRemoveUpdateRc = options.cmdRemoveUpdateRc.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	runRegister(options.cmdRemoveUpdateRc, deleteInitFile, unregisterWithChkconfig);
}

function unregisterWithChkconfig() {
	// Run chkconfig
	options.cmdRemoveChkconfig = options.cmdRemoveChkconfig.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	runRegister(options.cmdRemoveChkconfig, deleteInitFile, unregisterWithRcUpdate);
}

function unregisterWithRcUpdate() {
	// Run chkconfig
	options.cmdRemoveRcUpdate = options.cmdRemoveRcUpdate.replace(/{{SERVICE_NAME}}/g, options.serviceName);
	runRegister(options.cmdRemoveRcUpdate, deleteInitFile, unregisterWithInsserv);
}

function unregisterWithInsserv() {
	// Run insserv
	options.cmdRemoveInsserv = options.cmdRemoveInsserv.replace(/{{SERVICE_FILE_PATH}}/g, options.serviceFilePath);
	runRegister(options.cmdRemoveInsserv, deleteInitFile, function() {
		console.log('tellki-agent: unable to uninstall tellki-agent service');
		process.exit(1);
	});
}

function deleteInitFile() {
	// Delete init file.
	fs.unlink(options.serviceFilePath, function (err) {
		if (err) {
			console.log('tellki-agent: error deleting init file');
			process.exit(1);
		}
		finish();
	});
}


// ### Util

// Run service with the given command
function setService(command, callback) {
	// Run start service
	options.cmdService = options.cmdService.replace(/{{SERVICE_FILE_PATH}}/g, options.serviceFilePath);
	options.cmdService = options.cmdService.replace(/{{COMMAND}}/g, command);
	run(options.cmdService,
		function onExit(code) {
			if (code === 127 || code === -1) {
				console.log('tellki-agent: init file not found: ' + options.serviceFilePath);
				process.exit(1);
			} else if (code === 0 || code === 1) {
				callback();
			} else {
				console.log('tellki-agent: error sending ' + command + ' to tellki-agent service');
				process.exit(1);
			}
		});
}

// Run register command with support for 'command not found'
function runRegister(cmd, successCallback, notFoundCallback) {
	run(cmd,
		function onExit(code) {
			if (code === 127 || code === -1) {
				notFoundCallback();
			} else if (code === 0) {
				successCallback();
			} else {
				console.log('tellki-agent: error executing ' + cmd);
				process.exit(1);
			}
		});
}

// Run command
function run(cmd, onCloseCallback, onStdoutCallback) {	
	var tokens = cmd.split(' ');
	var cmd = tokens[0];
	var args = [];
	if (tokens.length > 1) {
		tokens.splice(0, 1);
		args = tokens;
	}
	var callbackCalled = false;
	var exec = require('child_process').spawn(cmd, args, { env: process.env });
	exec.on('exit', function(code) {
			if (callbackCalled)
				return;
			callbackCalled = true;
			onCloseCallback(code);
		});
	exec.on('error', function(err) {
			if (callbackCalled)
				return;
			callbackCalled = true;
			var code = -1;
			if (err.code === 'ENOENT')
				code = 127;
			onCloseCallback(code);
		});
	if (onStdoutCallback !== undefined)
		exec.stdout.on('data', onStdoutCallback);
}

function finish() {
	// All done, exit
	if (isInstall)
		console.log('tellki-agent: service successfully installed');
	else
		console.log('tellki-agent: service successfully uninstalled');
	process.exit(0);
}

options.INIT_SCRIPT = "\
#! /bin/sh\n\
#\n\
# Written by Guberni\n\
# tellki-agent: The agent for Tellki - an IT monitoring and management cloud service.\n\
# http://www.tellki.com\n\
#\n\
# chkconfig: 345 85 15\n\
#\n\
### BEGIN INIT INFO\n\
# Provides:          tellki-agent\n\
# Required-Start:\n\
# Required-Stop:\n\
# Default-Start:     2 3 4 5\n\
# Default-Stop:      0 1 6\n\
# Short-Description: Start and stop Tellki Agent\n\
# Description: The monitoring agent for Tellki - an IT monitoring and management cloud service.\n\
### END INIT INFO\n\
\n\
AGENTUSER=\"root\"\n\
PATH_A={{PATH_S}}\n\
SERVICE_NAME={{SERVICE_NAME_S}}\n\
PIDFILE=\"$PATH_A/cfg/{{PIDFILE_S}}\"\n\
RETURNCODE=0\n\
\n\
if [ -f /etc/init.d/functions ]; then\n\
	. /etc/init.d/functions\n\
fi\n\
\n\
if [ -f /etc/SuSE-release ]; then\n\
	. /etc/rc.status\n\
	rc_reset\n\
fi\n\
\n\
case \"$1\" in\n\
	start)\n\
		if [[ ! -f $PIDFILE ]] || [[ -z $(cat $PIDFILE) ]]; then\n\
			echo \"$PIDFILE not found or empty\"\n\
			RETURNCODE=1\n\
		elif [ $(ps up $(cat $PIDFILE) | grep tellki | wc -l) -gt 0 ]; then\n\
			echo \"$SERVICE_NAME is already running\"\n\
			RETURNCODE=1\n\
		else\n\
			echo \"Starting $SERVICE_NAME\"\n\
			su - $AGENTUSER -c \"{{STARTCMD_S}} &\"\n\
			\n\
			if [ -f /etc/SuSE-release ]; then\n\
				rc_status -v\n\
			elif [ -f /etc/debian_version ] || [ -f /etc/lsb-release ] || [ -f /etc/gentoo-release ]; then\n\
				echo \"init status: started\"\n\
			else\n\
				success\n\
			fi\n\
		fi\n\
		;;\n\
		\n\
	stop)\n\
		if [[ ! -f $PIDFILE ]] || [[ -z $(cat $PIDFILE) ]]; then\n\
			echo \"$PIDFILE not found or empty\"\n\
			RETURNCODE=1\n\
		elif [ $(ps up $(cat $PIDFILE) | grep tellki | wc -l) -eq 0 ]; then\n\
			echo \"$SERVICE_NAME is not running\"\n\
			RETURNCODE=1\n\
		else\n\
			echo \"Stopping $SERVICE_NAME\"\n\
			kill -9 $(cat $PIDFILE) > /dev/null\n\
			\n\
			if [ -f /etc/SuSE-release ]; then\n\
				rc_status -v\n\
			elif [ -f /etc/debian_version ] || [ -f /etc/lsb-release ] || [ -f /etc/gentoo-release ]; then\n\
				echo \"init status: stopped\"\n\
			else\n\
				success\n\
			fi\n\
		fi\n\
		;;\n\
		\n\
	status)\n\
		if [[ ! -f $PIDFILE ]] || [[ -z $(cat $PIDFILE) ]]; then\n\
			echo \"$PIDFILE not found or empty\"\n\
			RETURNCODE=1\n\
		elif [ $(ps up $(cat $PIDFILE) | grep tellki | wc -l) -gt 0 ]; then\n\
			echo \"$SERVICE_NAME is running\"\n\
		else\n\
			echo \"$SERVICE_NAME is not running\"\n\
		fi\n\
		\n\
		if [ -f /etc/SuSE-release ]; then\n\
			rc_status -v\n\
		fi\n\
		;;\n\
		\n\
	*)\n\
		echo \"usage: /etc/init.d/$SERVICE_NAME start|stop|status\"\n\
		RETURNCODE=1\n\
esac\n\
\n\
if [ -f /etc/SuSE-release ]; then\n\
	rc_exit\n\
fi\n\
\n\
exit $RETURNCODE\n\
";