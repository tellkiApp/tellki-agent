(function () {
    'use strict';
    /*jshint node:true */

    var path = require('path'),
        fs = require('fs'),
        util = require('util');

    var errorLevel = 0,
        exitLevel = 0,
        r = 5000, //Retry connection 5s
        u = 'http://guberni.slyip.com:3000/agent', //Url of the sockejs service
        k = '', //Client Key, if needed because ip validation
        p = path.dirname(fs.realpathSync(__filename)),
        cfgFile = '', //Config file to save agent data
        logFile = '', //Log file
        scriptPath = path.join(p, 'scripts'),
        t = 10000, //Command Timeout 10s
        v = '1.0', //Version
        tags = '', id = '',
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
                        api.log.console(err, 2);
                    }
                });
            },
            unlink: function (file) {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                    api.log.console('Successfully deleted the configuration File. If you want restart the Agent again!', 1);
                }
            },
            validate: function (data) {
                if (data !== undefined) {
                    try {
                        if (data !== {})
                            return data.key !== undefined && data.uuid !== undefined;
                    }
                    catch (e) { }
                }
                return false;
            },
            file: function (p, id) {
                return path.join(p, 'agent' + ((id !== '') ? '.' + id : '') + '.cfg');
            }
        },
        agent: {
            set: function (data) {
                a = data;
            },
            info: function (cfgFile, logFile, scriptPath, v, id, callBack) {
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
                        return { log: logFile, scripts: scriptPath, conf: cfgFile };
                    }
                    function versions(v) {
                        process.versions.agent = v;
                        return process.versions;
                    }
                    return {
                        uuid: (state !== null) ? state.uuid : '00000000-0000-0000-0000-000000000000',
                        host: os.hostname(),
                        label: id,
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
                api.conf.read(cfgFile, function (conf) {
                    if (api.conf.validate(conf)) {
                        api.log.console('Restoring the new agent...');
                        callBack(JSON.stringify(createAgent(conf)));
                    } else {
                        api.log.console('Activating the new agent...');
                        callBack(JSON.stringify(createAgent(null)));
                    }
                });
            },
            libraries:
            {
                install: function (installPath, setup, callBack) {
                    //Download and install? a package
                    if (setup.package !== undefined) {
                        api.log.console(JSON.stringify(setup));
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
                                    zip.extractAllTo(installPath, true);
                                }
                                AdmZip = http = null;
                                if (setup.install !== null) {
                                    //Execute the setup install script
                                    run.spawn(installPath, {
                                        cmd: setup.install[0],
                                        args: setup.install.splice(1, setup.install.length - 1),
                                        timeout: 60000,
                                        path: setup.opId.toString()
                                    }, function (resp, code, duration) {
                                        callBack(code, new Date().getTime() - startAt);
                                    });
                                } else
                                    callBack(0, new Date().getTime() - startAt);
                            });
                        });
                        req.on('error', function (e) {
                            api.log.console('==========ERROR==========', 2);
                            api.log.console('There was a problem setting up the agent: ' + e.message + '@' + options.host, 2);
                            callBack(-1, new Date().getTime() - startAt, e.message);
                        });
                    } else {
                        //Just install a package
                        if (setup.install !== null) {
                            var _path = path.join(installPath, setup.opId.toString());
                            if (!fs.existsSync(_path))
                                fs.mkdirSync(_path);
                            //Execute the setup install script
                            //console.log(setup.install.toString());
                            run.spawn(installPath, {
                                cmd: setup.install[0],
                                args: setup.install.splice(1, setup.install.length - 1),
                                timeout: 60000,
                                path: setup.opId.toString()
                            }, function (resp, code, duration) {
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
                        var name = path.join(dir, files[i]);
                        if (fs.statSync(name).isDirectory()) {
                            _files.push(files[i]);
                        }
                    }
                    return _files;
                }
            }
        },
        log: {
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
            file: function (p, id) {
                return path.join(p, 'agent.client' + ((id !== '') ? '.' + id : '') + '.log');
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
                api.log.console('Connected to Tellki\'s Controller!');
                api.agent.info(cfgFile, logFile, scriptPath, v, id, function (agent) {
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
                            api.log.console('Invalid: ' + json.resp);
                            api.conf.unlink(cfgFile);
                            break;
                        case -1:
                            api.log.console('Terminating: ' + json.resp);
                            break;
                        case 1: //Connect
                            api.conf.write(cfgFile, JSON.stringify(json.resp));
                            api.agent.set(json.resp);
                            api.log.console('Done! Waiting for instructions...');
                            break;
                        case 3: //Execute Command
                            api.log.console('Command: ' + msg);
                            run.spawn(scriptPath, json, function (resp, code, duration) {
                                sock.write(socket.response(json, resp, code, duration, a));
                            });
                            break;
                        case 5: //Scheduler Command
                            api.log.console('Scheduler: ' + msg);
                            var pid = run.spawn(scriptPath, json, function (resp, code, duration) {
                                sock.write(socket.response(json, resp, code, duration, a));
                                api.jobs.remove(j, { conf: json });
                            });
                            api.jobs.add(j, { conf: json, pid: pid });
                            break;
                        case 100: //Install Library Response
                            api.agent.libraries.install(scriptPath, json, function (res, duration, msg) {
                                sock.write(socket.response(json, msg, res, duration, a));
                            });
                            break;
                        case 200: //Stop all running Jobs
                            (json.opId !== undefined) ? api.jobs.stopConf(j, json.opId) : api.jobs.stopAll(j);
                            sock.write(socket.response(json, 'STOPALL', 200, 0, a));
                            break;
                        case 300: //Stats
                            sock.write(socket.response(json, {
                                Memory: util.inspect(process.memoryUsage()),
                                Uptime: process.uptime(),
                                Jobs: Object.keys(j).length,
                                PID: process.pid
                            }, 300, 0, a));
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
                api.log.console('Something went wrong, must retry in ' + r + 'ms...' + e, 2);
                api.jobs.stopAll(j);
                callBack();
            });
            sock.on('close', function () {
                api.log.console('The connection was closed!', 1);
                api.jobs.stopAll(j);
                process.exit(0);
            });
        },
        retry: function (url, retry) {
            api.log.console('Trying to reconnect...', 1);
            this.start(url, retry);
        },
        start: function (url, retry) {
            this.connect(url, function () {
                setTimeout(function () {
                    socket.retry(url, retry);
                }, retry);
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
        spawn: function (scriptPath, cmd, callBack) {
            var options = {
                cwd: (cmd.path === undefined) ? scriptPath : path.join(scriptPath, cmd.path),
                env: process.env,
                start: new Date().getTime(),
                duration: function () { return new Date().getTime() - options.start },
                resp: ''
            };
            //console.log('PATH:' + options.cwd);
            var child = cp.spawn(cmd.cmd, cmd.args, options);

            child.stdout.on('data', function (buffer) {
                options.resp += buffer.toString('utf-8');
                if (cmd.timeout === 0)
                    callBack(options.resp, 0, options.duration());
            });
            child.stderr.on('data', function (data) {
                api.log.console('stderr: ' + data, 2);
                callBack(data.toString(), -2, options.duration());
                clearTimeout(kill);
            });
            child.on('exit', function (code) {
                api.log.console('Process exited with code: ' + (code === null ? -3 : code) + (cmd.libraryId !== undefined ? ' Library: ' + cmd.libraryId : ''));
                if (code !== null) {
                    callBack(options.resp, code, options.duration());
                    clearTimeout(kill);
                }
            });
            child.on('error', function (e) {
                api.log.console('Caught exception: ' + e, 2);
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
    //Read the Key value if it's submited by param
    if (process.argv.length > 2) {
        for (var i = 2; i < process.argv.length - 1; i++) {
            switch (process.argv[i]) {
                case '-id':
                    id = process.argv[i + 1];
                    break;
                case '-k':
                    k = process.argv[i + 1];
                    break;
                case '-tags':
                    tags = process.argv[i + 1];
                    break;
            }
        }
    }
    // =============================================================================
    logFile = api.log.file(p, id);
    if (logFile !== '' && fs.existsSync(logFile))
        fs.unlinkSync(logFile);
    // =============================================================================
    api.log.console('PID: ' + process.pid);
    api.log.console('Id: ' + id);
    api.log.console('Node version is ' + process.versions.node);
    api.log.console('Starting the Tellki Agent...');
    api.log.console('Platform is ' + process.platform);
    api.log.console('Agent path is ' + fs.realpathSync(__filename));
    cfgFile = api.conf.file(p, id);
    api.log.console('Config file ' + cfgFile);
    api.log.console('Log file ' + logFile);
    // =============================================================================
    if (!fs.existsSync(scriptPath))
        fs.mkdirSync(scriptPath);
    api.log.console('Scripts path ' + scriptPath);
    // =============================================================================
    socket.start(u,r);
    // =============================================================================
    setInterval(function () {
        if (typeof global.gc === 'function') {
            global.gc();
            api.log.console('Cleared GC!');
        }
        api.log.console('Memory Usage: ' + util.inspect(process.memoryUsage()));
        api.log.console('Uptime: ' + process.uptime() + 's');
        api.log.console('Running Jobs: ' + Object.keys(j).length);
    }, 60000); //Each minute

}).call(this)