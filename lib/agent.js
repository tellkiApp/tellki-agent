(function () {
    'use strict';
    /*jshint node:true */

    var path = require('path'),
        fs = require('fs'),
        util = require('util');

    var errorLevel = 0,
        exitLevel = 0,
        r = 5000,
        u = 'http://guberni.slyip.com:3000/agent',
        k = 'NkPeRKh5hoCi2XHdE1h5SXsJh8WoxzAerTymwHu',
        p = path.dirname(fs.realpathSync(__filename)),
        agentConf = path.join(p, '../agent.cfg'),
        logFile = path.join(p, '../agent.log'),
        scriptPath = path.join(p, '/scripts'),
        t = 10000,
        v = '1.0',
        tags = '',
        a = {},
        j = {};

    var api = {
        conf: {
            read: function (file, callBack) {
                var cfg = null;
                fs.readFile(file, 'utf8', function (err, data) {
                    if (err) {
                        if (err.errno === 34) {
                            cfg = undefined;
                        } else {
                            throw err;
                        }
                    }
                    else {
                        cfg = JSON.parse(data);
                    }
                    callBack(cfg);
                });
            },
            write: function (file, data) {
                fs.writeFile(file, data, function (err) {
                    if (err) {
                        api.console(err, 2);
                    }
                });
            },
            unlink: function (file) {
                if (fs.existsSync(file)) {
                    fs.unlink(file, function (err) {
                        if (err) throw err;
                        api.console('Successfully deleted the configuration File. If you want restart the Agent again!', 1);
                    });
                }
            },
            validate: function (data) {
                if (data !== undefined) {
                    try {
                        if (data !== {})
                            return data.key === k;
                    }
                    catch (e) { }
                }
                return false;
            }
        },
        agent: {
            set: function (data) {
                a = data;
            },
            info: function (agentConf, logFile, scriptPath, v, callBack) {
                var createAgent = function (state) {
                    var os = require('os');
                    function getIpAddress() {
                        var ifaces = os.networkInterfaces();
                        var addr = '';
                        for (var dev in ifaces) {
                            ifaces[dev].forEach(function (details) {
                                if (details.family == 'IPv4' && !details.internal) {
                                    if (addr !== '') {
                                        addr += ',';
                                    }
                                    addr += details.address;
                                }
                            });
                        }
                        return addr;
                    };
                    function paths() {
                        return { log: logFile, scripts: scriptPath, conf: agentConf };
                    }
                    function versions(v) {
                        process.versions.agent = v;
                        return process.versions;
                    }
                    return {
                        uuid: (state !== null) ? state.uuid : '00000000-0000-0000-0000-000000000000',
                        host: os.hostname(),
                        key: (state !== null) ? state.key : k,
                        ip: getIpAddress(),
                        tz: new Date().getTimezoneOffset(),
                        platform: process.platform,
                        os: os.type(),
                        arch: os.arch(),
                        v: versions(v),
                        tags: (state !== null) ? state.tags : tags,
                        op: (state !== null) ? 1 : 0,
                        libraries: api.agent.libraries.installed(scriptPath),
                        paths: paths(),
                        PID: process.pid
                    }
                };
                api.conf.read(agentConf, function (conf) {
                    if (api.conf.validate(conf)) {
                        api.console('Restoring the new agent...', 0);
                        callBack(JSON.stringify(createAgent(conf)));
                    } else {
                        api.console('Activating the new agent...', 0);
                        callBack(JSON.stringify(createAgent(null)));
                    }
                });
            },
            libraries:
            {
                install: function (setup, callBack) {
                    if (setup.package !== undefined) {
                        api.console(JSON.stringify(setup), 0);
                        var options = {
                            host: setup.package.host,
                            port: setup.package.port,
                            path: setup.package.path
                        };
                        var http = require('http'), AdmZip = require('adm-zip');
                        var startAt = new Date().getTime();
                        var req = http.get(options, function (res) {
                            var data = [], dataLen = 0;
                            res.on('data', function (chunk) {
                                data.push(chunk);
                                dataLen += chunk.length;
                            }).on('end', function () {
                                if (data.length === 0) {
                                    callBack(2, new Date().getTime() - startAt);
                                    return;
                                }
                                var buf = new Buffer(dataLen);
                                for (var i = 0, len = data.length, pos = 0; i < len; i++) {
                                    data[i].copy(buf, pos);
                                    pos += data[i].length;
                                }
                                var zip = new AdmZip(buf);
                                var zipEntries = zip.getEntries();
                                for (var i = 0; i < zipEntries.length; i++) {
                                    zip.extractAllTo(scriptPath, true);
                                }
                                http = null;
                                AdmZip = null;
                                if (setup.InstallScript !== undefined) {
                                    //Execute the setup install script
                                    var cmd = { cmd: setup.InstallScript };
                                    run.exec(cmd, function (resp, code, duration) {
                                        callBack(code, new Date().getTime() - startAt);
                                    });
                                } else
                                    callBack(0, new Date().getTime() - startAt);
                            });
                        });
                        req.on('error', function (e) {
                            api.console('==========ERROR==========', 2);
                            api.console('There was a problem setting up the agent: ' + e.message + '@' + options.host, 2);
                            callBack(1, new Date().getTime() - startAt);
                        });
                    } else {
                        if (setup.InstallScript !== undefined) {
                            //Execute the setup install script
                            var cmd = { cmd: setup.InstallScript };
                            run.exec(cmd, function (resp, code, duration) {
                                callBack(code, new Date().getTime() - startAt);
                            });
                        }
                    }
                },
                installed: function (dir) {
                    var _files = [];
                    var files = fs.readdirSync(dir);
                    for (var i in files) {
                        if (!files.hasOwnProperty(i)) continue;
                        var name = dir + '/' + files[i];
                        if (fs.statSync(name).isDirectory()) {
                            _files.push(files[i]);
                        }
                    }
                    return _files;
                }
            }
        },
        console: function (msg, level) {
            //level: 0 - Info, 1 - Warning, 2 - Error
            if (level === undefined)
                level = 0;
            var _msg = level + '>' + new Date().toISOString() + ':' + msg;
            if (errorLevel <= level) {
                console.log(_msg);
            }
            if (logFile !== '') {
                fs.appendFile(logFile, _msg + '\r\n', function (err) {
                    if (err)
                        console.log('2>' + err);
                });
            }
        },
        jobs:
            {
                //running jobs
                add: function (jobs, job) {
                    if (jobs === null)
                        jobs = {};
                    jobs[job.conf.opId] = job;
                },
                //remove jobs
                remove: function (jobs, job) {
                    delete jobs[job.conf.opId];
                },
                //stop jobs
                stop: function (jobs, job) {
                    jobs[job.conf.opId].pid.kill('SIGKILL');
                    delete jobs[job.conf.opId];
                },
                stopConf: function (jobs, opId) {
                    jobs[opId].pid.kill('SIGKILL');
                    delete jobs[opId];
                },
                //stop all
                stopAll: function (jobs) {
                    for (var job in jobs) {
                        jobs[job].pid.kill('SIGKILL');
                    }
                    jobs = {};
                },
            }
    };

    var socket = {
        connect: function (url, callBack) {
            var SockJS = require('sockjs-client');
            var sock = SockJS.create(url);

            sock.on('connection', function () { // connection is established 
                api.console('Connected to Tellki\'s Controller!', 0);
                api.agent.info(agentConf, logFile, scriptPath, v, function (agent) {
                    sock.write(agent);
                });
            });

            sock.on('data', function (msg) { // received some data 
                if (msg === undefined) {
                    return;
                }
                try {
                    var json = (typeof msg === 'object') ? msg : JSON.parse(msg);
                    switch (json.op) {
                        case -2:
                            api.console('Invalid: ' + json.resp, 0);
                            api.conf.unlink(agentConf);
                            break;
                        case -1:
                            api.console('Terminating: ' + json.resp, 0);
                            break;
                        case 1: //Connect
                            api.conf.write(agentConf, JSON.stringify(json.resp));
                            api.agent.set(json.resp);
                            api.console('Done! Waiting for instructions...', 0);
                            break;
                        case 3: //Execute Command
                            api.console('Command: ' + msg, 0);
                            run.spawn(json, function (resp, code, duration) {
                                sock.write(socket.response(json, resp, code, duration, a));
                            });
                            break;
                        case 5: //Scheduler Command
                            api.console('Scheduler: ' + msg, 0);
                            var pid = run.spawn(json, function (resp, code, duration) {
                                sock.write(socket.response(json, resp, code, duration, a));
                                api.jobs.remove(j, { conf: json });
                            });
                            api.jobs.add(j, { conf: json, pid: pid });
                            break;
                        case 100: //Install Library Response
                            api.agent.libraries.install(json, function (res, duration) {
                                sock.write(socket.response(json, json.id, res, duration, a));
                            });
                            break;
                        case 200: //Stop all running Jobs
                            (json.opId !== undefined) ? api.jobs.stopConf(j, json.opId) : api.jobs.stopAll(j);
                            sock.write(socket.response(json, 'STOPALL', 200, 0, a));
                            break;
                        case 300: //Stats
                            sock.write(socket.response(json, { Memory: util.inspect(process.memoryUsage()), Uptime: process.uptime(), Jobs: Object.keys(j).length }, 300, 0, a));
                            break;
                        default:
                            sock.write(socket.response(json, 'INVALID', -4, 0, a));
                            break;
                    }
                } catch (e) {
                    throw e;
                }
            });
            sock.on('error', function (e) { // something went wrong 
                api.console('Something went wrong, must retry in ' + r + 'ms...' + e, 2);
                api.jobs.stopAll(j);
                callBack();
            });
            sock.on('close', function () {
				api.console('The connection to the controller was closed!', 2);
                api.jobs.stopAll(j);
                process.exit(0);
            });
        },
        retry: function () {
            api.console('Trying to reconnect...', 1);
            this.start();
        },
        start: function () {
            this.connect(u, function () {
                setTimeout(function () {
                    socket.retry();
                }, r);
            });
        },
        response: function (data, resp, code, duration, agent) {
            return JSON.stringify({
                opId: data.opId,
                op: data.op + 1,
                uuid: agent.uuid,
                resp: resp,
                code: code.toString(),
                duration: duration
            });
        }
    };

    var cp = require('child_process');
    var run = {
        spawn: function (cmd, callBack) {
            var options = {
                cwd: scriptPath + ((cmd.libraryId !== undefined) ? '\\' + cmd.libraryId + '\\' : ''),
                env: process.env,
                start: new Date().getTime(),
                duration: function () { return new Date().getTime() - options.start },
                resp: ''
            };

            var child = cp.spawn(cmd.cmd, cmd.args, options);

            child.stdout.on('data', function (buffer) {
                options.resp += buffer.toString('utf-8');
                if (cmd.timeout === 0)
                    callBack(options.resp, 0, options.duration());
            });
            child.stderr.on('data', function (data) {
                api.console('stderr: ' + data, 2);
                callBack(data.toString(), -2, duration());
                clearTimeout(kill);
            });
            child.on('exit', function (code) {
                api.console('Process exited with code: ' + (code === null ? -3 : code) + (cmd.libraryId !== undefined ? ' Library: ' + cmd.libraryId : ''), 0);
                if (code !== null) {
                    callBack(options.resp, code, options.duration());
                    clearTimeout(kill);
                }
            });
            child.on('error', function (e) {
                api.console('Caught exception: ' + e, 2);
                callBack(e.toString(), -2, options.duration());
                clearTimeout(kill);
            });

            var kill = setTimeout(function () {
                if (child !== undefined) {
                    child.kill('SIGKILL');
                    callBack('Call a timedout!', -1, options.duration());
                }
            }, cmd.timeout);

            return child;
        }
    }

    // =============================================================================

    api.console('PID: ' + process.pid);
    api.console('Node version is ' + process.versions.node, 0);
    api.console('Starting the Tellki Agent...', 0);
    api.console('Platform is ' + process.platform, 0);
    api.console('Agent path is ' + fs.realpathSync(__filename), 0);
    api.console('Config file ' + agentConf, 0);
    if (!fs.existsSync(scriptPath)) fs.mkdirSync(scriptPath);
    api.console('Log file ' + logFile, 0);
    if (logFile !== '')
        fs.unlink(logFile, function (err) {
            if (err) throw err;
        });
    api.console('Scripts path ' + scriptPath, 0);
    //Read the Key value if it's submited by param
    if (process.argv.length > 2) {
        for (var i = 2; i < process.argv.length - 1; i++) {
            if (process.argv[i] === '-k') {
                k = process.argv[i + 1];
            }
            if (process.argv[i] === '-tags') {
                tags = process.argv[i + 1];
            }
        }
    }
    path = null;
    socket.start();

    setInterval(function () {
        if (typeof global.gc === 'function') {
            global.gc();
            api.console('Cleared GC!', 0);
        }
        api.console('Memory Usage: ' + util.inspect(process.memoryUsage()));
        api.console('Uptime: ' + process.uptime() + 's');
        api.console('Running Jobs: ' + Object.keys(j).length);
    }, 60000); //Each minute

}).call(this)